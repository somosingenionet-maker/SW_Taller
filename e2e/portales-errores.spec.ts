import { test, expect, type Page } from '@playwright/test';

// Portales públicos (cliente y mecánico): cada fallo se cuenta como lo que es. Sin red NO es
// «enlace no válido» ni sale texto en inglés; un fallo pasajero del servidor deja reintentar; solo
// un enlace que de verdad no existe dice «Enlace no válido».

const PORTALES = [
  { nombre: 'del cliente', ruta: '/portal/token-que-no-existe', funcion: 'portal-cliente' },
  { nombre: 'del mecánico', ruta: '/mecanico/token-que-no-existe', funcion: 'portal-mecanico' },
] as const;

async function sinRed(page: Page, funcion: string) {
  await page.route(`**/functions/v1/${funcion}`, (route) => route.abort('internetdisconnected'));
}

for (const p of PORTALES) {
  test(`portal ${p.nombre}: sin conexión lo dice en español y permite reintentar`, async ({ page }) => {
    await sinRed(page, p.funcion);
    await page.goto(p.ruta);
    await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('No hay conexión. Comprueba tu internet y vuelve a intentarlo.')).toBeVisible();
    await expect(page.getByText(/Edge Function|Failed to/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toHaveCount(0);

    // Vuelve la red: «Reintentar» pide de nuevo; el servidor real dice que ESE enlace no existe.
    await page.unroute(`**/functions/v1/${p.funcion}`);
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0); // un enlace inválido no se arregla reintentando
  });

  test(`portal ${p.nombre}: un fallo del servidor no se confunde con un enlace inválido`, async ({ page }) => {
    await page.route(`**/functions/v1/${p.funcion}`, (route) => route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } })
      : route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Error interno.' }) }));
    await page.goto(p.ruta);
    await expect(page.getByRole('heading', { name: 'No se pudo cargar' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Inténtalo de nuevo en unos segundos.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enlace no válido' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
}
