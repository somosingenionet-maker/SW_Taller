import { test, expect, type Page } from '@playwright/test';

// Cabecera de los enlaces externos: centrada también en pantallas anchas (como la del mecánico). Las Edge Functions
// se sustituyen por respuestas de mentira; solo se prueba cómo se ve.

test.use({ viewport: { width: 1280, height: 800 } });
const cors = { 'access-control-allow-origin': '*' };
const empresa = { nombre: 'Taller Ejemplo', brandColor: '#2563eb', logoUrl: null };

async function mock(page: Page, fn: string, resp: Record<string, unknown>) {
  await page.route(`**/functions/v1/${fn}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { ...cors, 'access-control-allow-headers': '*' } });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(resp) });
  });
}
const centro = async (loc: ReturnType<Page['locator']>) => { const b = (await loc.boundingBox())!; return b.x + b.width / 2; };

test('portal del cliente: la cabecera queda centrada en pantallas anchas', async ({ page }) => {
  await mock(page, 'portal-cliente', { empresa, cliente: { nombre: 'Ana', apellidos: 'García' }, vehiculos: [], presupuestosPendientes: [], informes: [], alertas: [], facturas: [] });
  await page.goto('/portal/token-de-prueba');
  await expect(page.getByRole('heading', { name: /Hola, Ana/ })).toBeVisible();
  const pantalla = 1280 / 2;
  expect(Math.abs((await centro(page.getByRole('heading', { name: /Hola, Ana/ }))) - pantalla)).toBeLessThan(3);
  expect(Math.abs((await centro(page.getByTestId('cabecera-cliente'))) - pantalla)).toBeLessThan(3);
});

test('mi cita y reserva: la cabecera queda centrada en pantallas anchas', async ({ page }) => {
  await mock(page, 'reservas-publicas', {
    empresa: { ...empresa, telefono: '600 111 222', correo: null, ciudad: 'Elche' }, tipos: [{ id: 't1', nombre: 'Revisión', duracionMin: 60 }], confirmacion: 'automatica', antelacionHoras: 12, diasMax: 30,
    cita: { cuando: 'martes, 17 de noviembre de 2026 a las 10:00', estado: 'confirmada', tipo: 'Revisión', vehiculo: null, motivo: null, duracionMin: 60, cancelable: true },
  });
  const pantalla = 1280 / 2;
  await page.goto('/cita/token-de-prueba-largo-largo');
  await expect(page.getByRole('heading', { name: 'Tu cita' })).toBeVisible();
  expect(Math.abs((await centro(page.getByRole('heading', { name: 'Tu cita' }))) - pantalla)).toBeLessThan(3);
  await page.goto('/reservar/taller-ejemplo');
  await expect(page.getByRole('heading', { name: 'Reserva tu cita' })).toBeVisible();
  expect(Math.abs((await centro(page.getByRole('heading', { name: 'Reserva tu cita' }))) - pantalla)).toBeLessThan(3);
});
