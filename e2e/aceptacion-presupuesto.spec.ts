import { test, expect, type Page } from '@playwright/test';

// Aceptación del presupuesto en el portal del cliente (móvil). La Edge Function se sustituye por un servidor
// de mentira con el mismo contrato que supabase/functions/portal-cliente: aquí se prueba la pantalla (texto,
// nombre, casilla, importe visto, rechazo, importe cambiado). El contrato real se prueba con deno test y contra
// Supabase.

test.use({ viewport: { width: 375, height: 812 } });

const TEXTO = 'Acepto el presupuesto OT-2026-101 para Seat León (1234ABC) por un importe de 123,40 € (IVA incluido) y autorizo la realización de los trabajos descritos.';

function servidor(opciones: { importeCambia?: boolean } = {}) {
  const peticiones: Record<string, unknown>[] = [];
  let respondido: 'aprobado' | 'rechazado' | null = null;
  const datos = () => ({
    empresa: { nombre: 'Taller Ejemplo', brandColor: '#2563eb', logoUrl: null },
    cliente: { nombre: 'Ana', apellidos: 'García' },
    vehiculos: [], alertas: [], facturas: [], informes: [],
    presupuestosPendientes: respondido ? [] : [{
      otId: 'ot-1', numero: 'OT-2026-101', vehiculo: 'Seat León (1234ABC)', total: 123.4, textoAceptacion: TEXTO,
      lineas: [{ descripcion: 'Pastillas delanteras', cantidad: 1, precioUnitario: 64, subtotal: 64 }, { descripcion: 'Líquido de frenos', cantidad: 1, precioUnitario: 39.67, subtotal: 39.67 }],
    }],
  });
  const responder = (b: Record<string, unknown>): { status: number; json: unknown } => {
    peticiones.push(b);
    if (b.action === undefined) return { status: 200, json: datos() };
    if (b.action === 'responder_presupuesto') {
      if (b.aprobado === true) {
        if (b.acepta !== true) return { status: 400, json: { error: 'Marca la casilla para aceptar el presupuesto.' } };
        if (typeof b.nombre !== 'string' || b.nombre.trim().length < 2) return { status: 400, json: { error: 'Escribe tu nombre (entre 2 y 120 caracteres).' } };
        if (opciones.importeCambia) return { status: 409, json: { error: 'El importe del presupuesto ha cambiado. Recarga la página y revísalo antes de aceptar.' } };
      }
      respondido = b.aprobado === true ? 'aprobado' : 'rechazado';
      return { status: 200, json: { ok: true } };
    }
    return { status: 400, json: { error: 'Acción no reconocida.' } };
  };
  return { peticiones, responder };
}

async function abrir(page: Page, s: ReturnType<typeof servidor>) {
  await page.route('**/functions/v1/portal-cliente', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    const r = s.responder(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.json) });
  });
  await page.goto('/portal/token-de-prueba');
  await expect(page.getByText('Presupuesto pendiente')).toBeVisible({ timeout: 10_000 });
}

test('cliente: para aceptar hay que marcar la casilla y poner el nombre; se envía con el importe que vio', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);

  await expect(page.getByTestId('texto-aceptacion')).toHaveText(TEXTO);
  const aceptar = page.getByTestId('aceptar-presupuesto');
  await expect(page.getByLabel('Tu nombre')).toHaveValue('Ana García');   // propuesto, editable
  await expect(aceptar).toBeDisabled();                                    // sin casilla no se puede

  await page.getByTestId('acepta-casilla').check();
  await expect(aceptar).toBeEnabled();
  await page.getByLabel('Tu nombre').fill('A');                            // nombre demasiado corto
  await expect(aceptar).toBeDisabled();
  await page.getByLabel('Tu nombre').fill('Ana María García');
  await aceptar.click();

  await expect(page.getByText('Presupuesto aceptado — gracias')).toBeVisible();
  const envio = s.peticiones.find((p) => p.action === 'responder_presupuesto')!;
  expect(envio).toMatchObject({ aprobado: true, acepta: true, nombre: 'Ana María García', totalVisto: 123.4, otId: 'ot-1' });
});

test('cliente: rechazar no pide casilla ni envía datos de aceptación', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);
  await page.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.getByText('Presupuesto rechazado')).toBeVisible();
  const envio = s.peticiones.find((p) => p.action === 'responder_presupuesto')!;
  expect(envio.aprobado).toBe(false);
  expect(envio).not.toHaveProperty('acepta');
  expect(envio).not.toHaveProperty('nombre');
});

test('cliente: si el taller cambió el importe mientras decidía, se le explica y no queda aceptado', async ({ page }) => {
  const s = servidor({ importeCambia: true });
  await abrir(page, s);
  await page.getByTestId('acepta-casilla').check();
  await page.getByTestId('aceptar-presupuesto').click();
  await expect(page.getByText('El importe del presupuesto ha cambiado')).toBeVisible();
  await expect(page.getByText('Presupuesto aceptado — gracias')).toHaveCount(0);
});
