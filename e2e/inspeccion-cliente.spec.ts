import { test, expect, type Page } from '@playwright/test';

// Informe de inspección en el portal del cliente (móvil): aprobar punto por punto. La Edge Function se sustituye
// por un servidor de mentira con el mismo contrato que supabase/functions/portal-cliente. El contrato real se
// prueba con deno test y contra Supabase.

test.use({ viewport: { width: 375, height: 812 } });

type Punto = { id: string; categoria: string; nombre: string; nota: string | null; reparacion: string | null; precio: number | null; decision: string | null; fotos: string[] };

function servidor(opciones: { importeCambia?: boolean } = {}) {
  const peticiones: Record<string, unknown>[] = [];
  let respondida = false;
  const P = (id: string, nombre: string, precio: number | null, categoria = 'Frenos'): Punto => ({ id, categoria, nombre, nota: `Nota de ${nombre}`, reparacion: null, precio, decision: null, fotos: [] });
  const urgentes = [P('u1', 'Pastillas delanteras', 64), P('u2', 'Discos delanteros', 120), P('u3', 'Líquido de frenos', null)];
  const atencion = [P('a1', 'Neumático delantero izq.', 85.5, 'Neumáticos')];
  const datos = () => ({
    empresa: { nombre: 'Taller Ejemplo', brandColor: '#2563eb', logoUrl: null },
    cliente: { nombre: 'Ana', apellidos: 'García' }, vehiculos: [], alertas: [], facturas: [], presupuestosPendientes: [],
    informes: [{
      id: 'i1', otId: 'ot-1', vehiculo: 'Seat León (1234ABC)', estado: respondida ? 'respondida' : 'enviada', enviadaEn: '2026-11-14T10:00:00Z', respondidaEn: null,
      notaGeneral: null, fotosEliminadas: false, urgentes, atencion, bien: 20, totalAprobable: 269.5, puntosAprobables: 3,
    }],
  });
  const responder = (b: Record<string, unknown>): { status: number; json: unknown } => {
    peticiones.push(b);
    if (b.action === undefined) return { status: 200, json: datos() };
    if (b.action === 'responder_inspeccion') {
      const ids = b.aprobados as string[];
      if (ids.length) {
        if (b.acepta !== true) return { status: 400, json: { error: 'Marca la casilla para aceptar las reparaciones.' } };
        if (opciones.importeCambia) return { status: 409, json: { error: 'El importe del informe ha cambiado. Recarga la página y revísalo antes de aceptar.' } };
      }
      for (const p of [...urgentes, ...atencion]) if (p.precio) p.decision = ids.includes(p.id) ? 'aprobado' : 'rechazado';
      respondida = true;
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
  await expect(page.getByTestId('informe-inspeccion')).toBeVisible({ timeout: 10_000 });
}

test('cliente: las urgentes con precio vienen marcadas, el total sigue lo marcado y se acepta con nombre y casilla', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);
  const marcas = page.getByTestId('marcar-punto');
  await expect(marcas).toHaveCount(3);                       // el punto urgente SIN precio no se puede aprobar
  await expect(marcas.nth(0)).toBeChecked();                 // urgentes con precio: marcadas
  await expect(marcas.nth(1)).toBeChecked();
  await expect(marcas.nth(2)).not.toBeChecked();             // atención: la elige el cliente
  await expect(page.getByTestId('total-marcado')).toContainText('Apruebas 2 reparaciones');
  await expect(page.getByTestId('total-marcado')).toContainText('184,00 € + IVA');

  const enviar = page.getByTestId('enviar-respuesta-informe');
  await expect(enviar).toBeDisabled();                       // falta la casilla
  await page.getByRole('checkbox', { name: 'Aprobar: Neumático delantero izq.' }).check();
  await expect(page.getByTestId('total-marcado')).toContainText('269,50 € + IVA');
  await page.getByRole('checkbox', { name: 'Aprobar: Discos delanteros' }).uncheck();
  await expect(page.getByTestId('total-marcado')).toContainText('Apruebas 2 reparaciones');
  await expect(page.getByTestId('total-marcado')).toContainText('149,50 € + IVA');

  await page.getByTestId('acepta-informe').check();
  await expect(enviar).toBeEnabled();
  await enviar.click();
  await expect(page.getByText('Reparaciones aprobadas')).toBeVisible();
  const envio = s.peticiones.find((p) => p.action === 'responder_inspeccion')!;
  expect(envio).toMatchObject({ inspeccionId: 'i1', aprobados: ['u1', 'a1'], acepta: true, nombre: 'Ana García', totalVisto: 149.5 });
});

test('cliente: no aprobar ninguna se envía sin pedir casilla ni nombre', async ({ page }) => {
  const s = servidor();
  await abrir(page, s);
  await page.getByRole('checkbox', { name: 'Aprobar: Pastillas delanteras' }).uncheck();
  await page.getByRole('checkbox', { name: 'Aprobar: Discos delanteros' }).uncheck();
  await expect(page.getByTestId('total-marcado')).toContainText('No apruebas ninguna reparación');
  await expect(page.getByTestId('acepta-informe')).toHaveCount(0);
  await page.getByTestId('enviar-respuesta-informe').click();
  await expect(page.getByText('No aprobaste ninguna reparación')).toBeVisible();
  const envio = s.peticiones.find((p) => p.action === 'responder_inspeccion')!;
  expect(envio.aprobados).toEqual([]);
  expect(envio).not.toHaveProperty('nombre');
  expect(envio).not.toHaveProperty('acepta');
});

test('cliente: si el taller cambió importes mientras decidía, se le explica', async ({ page }) => {
  const s = servidor({ importeCambia: true });
  await abrir(page, s);
  await page.getByTestId('acepta-informe').check();
  await page.getByTestId('enviar-respuesta-informe').click();
  await expect(page.getByText('El importe del informe ha cambiado')).toBeVisible();
});
