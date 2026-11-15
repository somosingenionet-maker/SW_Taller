import { test, expect, type Page } from '@playwright/test';

// Páginas públicas de reserva (/reservar/<taller>) y de gestión de la cita (/cita/<token>), en un móvil. La Edge Function
// se sustituye por un servidor de mentira con el mismo contrato que supabase/functions/reservas-publicas, y el captcha
// de Cloudflare por uno de pruebas. El contrato real se prueba con deno test y contra Supabase.
// (Requiere VITE_TURNSTILE_SITE_KEY: playwright.config.ts la pone al arrancar la web.)

test.use({ viewport: { width: 375, height: 812 } });

function fechasFuturas() {
  const d = new Date(); d.setDate(d.getDate() + 3);
  const f = (n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  return [f(0), f(1), f(2)];
}

function servidor(opciones: { confirmacion?: 'automatica' | 'manual'; tipos?: boolean; primerReservaOcupada?: boolean } = {}) {
  const [d1, d2, d3] = fechasFuturas();
  const peticiones: Record<string, unknown>[] = [];
  let reservasIntentadas = 0;
  let estadoCita: 'confirmada' | 'cancelada' = 'confirmada';
  const responder = (b: Record<string, unknown>): { status: number; json: unknown } => {
    peticiones.push(b);
    switch (b.action) {
      case 'info':
        if (b.slug === 'no-existe') return { status: 404, json: { error: 'Este taller no tiene las reservas online activadas.' } };
        return { status: 200, json: {
          empresa: { nombre: 'Taller Ruiz', brandColor: '#2563eb', logoUrl: null, telefono: '600 111 222', correo: 'taller@ruiz.es', ciudad: 'Elche' },
          tipos: opciones.tipos === false ? [] : [{ id: 't1', nombre: 'Revisión', duracionMin: 60 }, { id: 't2', nombre: 'Cambio de aceite', duracionMin: 30 }],
          confirmacion: opciones.confirmacion ?? 'automatica', antelacionHoras: 12, diasMax: 30,
        } };
      case 'disponibilidad':
        return { status: 200, json: { duracionMin: b.tipoId === 't1' ? 60 : 30, dias: { [d1]: ['09:00', '10:00', '16:30'], [d2]: ['09:30'], [d3]: ['11:00', '12:00'] } } };
      case 'reservar':
        reservasIntentadas++;
        if (opciones.primerReservaOcupada && reservasIntentadas === 1) return { status: 409, json: { error: 'Ese hueco acaba de ocuparse. Elige otra hora.' } };
        return { status: 200, json: { ok: true, estado: opciones.confirmacion === 'manual' ? 'pendiente' : 'confirmada', cuando: 'martes, 17 de noviembre de 2026 a las 10:00', enlace: 'http://localhost/cita/token-de-prueba-0123456789', tipo: 'Revisión' } };
      case 'cita':
        if (b.token === 'token-invalido') return { status: 404, json: { error: 'Este enlace no es válido.' } };
        return { status: 200, json: {
          empresa: { nombre: 'Taller Ruiz', brandColor: '#2563eb', logoUrl: null, telefono: '600 111 222', correo: null, ciudad: null },
          cita: { cuando: 'martes, 17 de noviembre de 2026 a las 10:00', estado: estadoCita, tipo: 'Revisión', vehiculo: 'Seat León · 1234ABC', motivo: 'Frenos', duracionMin: 60, cancelable: estadoCita === 'confirmada' },
        } };
      case 'cancelar': estadoCita = 'cancelada'; return { status: 200, json: { ok: true } };
      default: return { status: 400, json: { error: 'Acción no reconocida.' } };
    }
  };
  return { peticiones, responder, d1, d2, d3 };
}

async function preparar(page: Page, s: ReturnType<typeof servidor>) {
  await page.route('**/functions/v1/reservas-publicas', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const r = s.responder(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.json) });
  });
  // Captcha de pruebas: se supera al instante.
  await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript',
    body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('token-de-prueba')},50);return 'w1'},reset:function(){},remove:function(){}};",
  }));
}

test('reservar: servicio → día → hora → datos, con consentimiento y captcha, y se envía lo elegido', async ({ page }) => {
  const s = servidor();
  await preparar(page, s);
  await page.goto('/reservar/taller-ruiz');
  await expect(page.getByRole('heading', { name: 'Reserva tu cita' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Taller Ruiz').first()).toBeVisible();

  // Hasta elegir servicio no hay calendario
  await expect(page.getByTestId('calendario')).toHaveCount(0);
  await page.getByRole('button', { name: /Revisión/ }).click();
  await expect(page.getByTestId('calendario')).toBeVisible();
  // Solo se pueden pulsar los 3 días con hueco
  const habilitados = page.locator('[data-testid="calendario"] button:not([disabled])[aria-pressed]');
  const n = await habilitados.count();
  expect(n).toBeGreaterThanOrEqual(1);   // si los 3 días caen en dos meses, solo se ven los del primero hasta navegar

  await habilitados.first().click();
  await expect(page.getByRole('button', { name: '09:00' })).toBeVisible();
  await expect(page.getByRole('button', { name: '16:30' })).toBeVisible();   // franja de tarde
  await page.getByRole('button', { name: '10:00' }).click();

  const reservar = page.getByTestId('reservar');
  await expect(reservar).toBeDisabled();                                     // faltan datos
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellidos', { exact: true }).fill('García Ruiz');
  await page.getByLabel('Teléfono').fill('600 000 001');
  await page.getByLabel('Correo').fill('ana@mail.es');
  await page.getByLabel('Matrícula').fill('1234abc');
  await expect(reservar).toBeDisabled();                                     // falta el consentimiento
  await page.getByTestId('consentimiento').check();
  await expect(reservar).toBeEnabled({ timeout: 5000 });                     // captcha superado
  await reservar.click();

  await expect(page.getByTestId('reserva-hecha')).toContainText('¡Cita confirmada!');
  await expect(page.getByTestId('reserva-hecha')).toContainText('Revisión');
  const envio = s.peticiones.find((p) => p.action === 'reservar')!;
  expect(envio).toMatchObject({ slug: 'taller-ruiz', tipoId: 't1', hora: '10:00', nombre: 'Ana', apellidos: 'García Ruiz', telefono: '600 000 001', correo: 'ana@mail.es', matricula: '1234abc', consentimiento: true, captchaToken: 'token-de-prueba', web: '' });
});

test('reservar: si el hueco se ocupó, se explica, se pide la disponibilidad otra vez y se puede elegir otra hora', async ({ page }) => {
  const s = servidor({ primerReservaOcupada: true });
  await preparar(page, s);
  await page.goto('/reservar/taller-ruiz');
  await page.getByRole('button', { name: /Cambio de aceite/ }).click();
  await page.locator('[data-testid="calendario"] button:not([disabled])[aria-pressed]').first().click();
  await page.getByRole('button', { name: '09:00' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellidos', { exact: true }).fill('García Ruiz');
  await page.getByLabel('Teléfono').fill('600000001');
  await page.getByLabel('Correo').fill('ana@mail.es');
  await page.getByTestId('consentimiento').check();
  await page.getByTestId('reservar').click();
  await expect(page.getByTestId('error-reserva')).toContainText('Ese hueco acaba de ocuparse');
  const consultas = s.peticiones.filter((p) => p.action === 'disponibilidad').length;
  expect(consultas).toBeGreaterThanOrEqual(2);                               // se volvió a pedir
  await expect(page.getByTestId('reservar')).toHaveCount(0);                 // la hora se deseleccionó
  await page.getByRole('button', { name: '10:00' }).click();
  await expect(page.getByTestId('reservar')).toBeVisible();
});

test('reservar: con confirmación manual el cliente ve «solicitud recibida»', async ({ page }) => {
  const s = servidor({ confirmacion: 'manual' });
  await preparar(page, s);
  await page.goto('/reservar/taller-ruiz');
  await page.getByRole('button', { name: /Revisión/ }).click();
  await page.locator('[data-testid="calendario"] button:not([disabled])[aria-pressed]').first().click();
  await page.getByRole('button', { name: '10:00' }).click();
  await expect(page.getByText('El taller confirmará tu cita por correo.')).toBeVisible();
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellidos', { exact: true }).fill('García Ruiz');
  await page.getByLabel('Teléfono').fill('600000001');
  await page.getByLabel('Correo').fill('ana@mail.es');
  await page.getByTestId('consentimiento').check();
  await page.getByTestId('reservar').click();
  await expect(page.getByTestId('reserva-hecha')).toContainText('Solicitud recibida');
});

test('un taller sin reservas activas o sin servicios lo explica', async ({ page }) => {
  const s = servidor();
  await preparar(page, s);
  await page.goto('/reservar/no-existe');
  await expect(page.getByText('no tiene las reservas online activadas')).toBeVisible({ timeout: 10_000 });

  const s2 = servidor({ tipos: false });
  const page2 = await page.context().newPage();
  await preparar(page2, s2);
  await page2.goto('/reservar/taller-ruiz');
  await expect(page2.getByText('todavía no tiene servicios para reservar online')).toBeVisible({ timeout: 10_000 });
});

test('mi cita: se ve, se puede cancelar tras confirmar, y queda cancelada sin botón', async ({ page }) => {
  const s = servidor();
  await preparar(page, s);
  await page.goto('/cita/token-de-prueba-0123456789');
  await expect(page.getByTestId('estado-cita')).toHaveText('Confirmada');
  await expect(page.getByTestId('cita-publica')).toContainText('Seat León · 1234ABC');
  await page.getByTestId('cancelar-cita').click();
  await expect(page.getByRole('alertdialog')).toContainText('¿Seguro que quieres cancelar');
  await page.getByRole('button', { name: 'No, mantenerla' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(s.peticiones.some((p) => p.action === 'cancelar')).toBe(false);     // nada se canceló todavía
  await page.getByTestId('cancelar-cita').click();
  await page.getByTestId('confirmar-cancelacion').click();
  await expect(page.getByTestId('estado-cita')).toHaveText('Cancelada', { timeout: 10_000 });
  await expect(page.getByTestId('cancelar-cita')).toHaveCount(0);
});

test('mi cita: un enlace inválido muestra el error, no una pantalla en blanco', async ({ page }) => {
  const s = servidor();
  await preparar(page, s);
  await page.goto('/cita/token-invalido');
  await expect(page.getByText('Este enlace no es válido')).toBeVisible({ timeout: 10_000 });
});
