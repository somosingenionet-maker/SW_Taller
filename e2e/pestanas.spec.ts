import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

// Cada pestaña es un trozo aparte del paquete (carga diferida). Esta prueba entra en todas y falla si
// algún trozo no se puede cargar, si salta un error de JavaScript o si la consola registra un error:
// es la red de seguridad de que el troceado no ha dejado ninguna pantalla rota.

const PESTANAS = ['Agenda', 'Inventario', 'Vehículos', 'Clientes', 'Taller', 'Alertas', 'Rentabilidad', 'Facturas', 'Inicio'];

const boton = (page: Page, nombre: string) => page.locator(`button[title="${nombre}"], button[aria-label="${nombre}"]`).first();

test('todas las pestañas cargan sin errores', async ({ page }) => {
  test.setTimeout(120_000);
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => { if (r.url().includes('/assets/')) errores.push(`trozo no cargado: ${r.url()}`); });
  page.on('response', (r) => { if (r.url().includes('/assets/') && r.status() >= 400) errores.push(`trozo ${r.status()}: ${r.url()}`); });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);

  for (const nombre of PESTANAS) {
    await boton(page, nombre).click();
    await expect(page.getByRole('status', { name: 'Cargando' }), `la pestaña ${nombre} se queda cargando`).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('main h2').first(), `la pestaña ${nombre} no pinta su título`).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Algo salió mal'), `la pestaña ${nombre} muestra la pantalla de error`).toHaveCount(0);
  }
  expect(errores, errores.join('\n')).toEqual([]);
});

test('las ventanas grandes (Empresa, Seguridad) cargan al abrirlas', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Seguridad de la cuenta' }).click();
  await expect(page.getByRole('dialog', { name: 'Seguridad de la cuenta' })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await boton(page, 'Configuración de empresa').click();
  await expect(page.getByText('Configuración de Empresa')).toBeVisible({ timeout: 15_000 });
});
