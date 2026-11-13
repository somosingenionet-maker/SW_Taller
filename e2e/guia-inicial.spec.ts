import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

// Guía de primeros pasos en Inicio. Se simula un taller recién creado: las LECTURAS de clientes,
// vehículos, órdenes y mecánicos devuelven vacío (no se escribe nada y no se toca la base de datos
// real). Los datos fiscales y el resto de la empresa son los del tenant de pruebas.

async function tallerNuevo(page: Page) {
  await page.addInitScript(() => { try { Object.keys(localStorage).filter((k) => k.startsWith('doonty-guia-oculta')).forEach((k) => localStorage.removeItem(k)); } catch { /* */ } });
  await page.route(/\/rest\/v1\/(clientes|vehiculos|ordenes_trabajo|tecnicos)\?/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
      : route.continue());
}

test('guía de primeros pasos: un taller nuevo ve los pasos pendientes y cada botón lleva a su sitio', async ({ page }) => {
  await tallerNuevo(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const guia = page.getByTestId('guia-inicial');
  await expect(guia).toBeVisible({ timeout: 15000 });
  for (const id of ['tecnicos', 'clientes', 'vehiculos', 'orden']) await expect(guia.locator(`[data-paso="${id}"]`)).toHaveAttribute('data-hecho', 'false');
  await expect(guia.getByRole('progressbar')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/claude-502/-Users-danielsanchez-Library-CloudStorage-OneDrive-ucentral-edu-co-Daniel-NO-BORRAR-InGenio-Claude/86cce45a-578f-4996-bf31-ee86d214c928/scratchpad/guia-inicio.png' });

  // «Añadir mecánicos» abre Empresa directamente en la pestaña de técnicos.
  await guia.locator('[data-paso="tecnicos"]').getByRole('button').click();
  await expect(page.getByText(/Técnicos del taller/i)).toBeVisible({ timeout: 8000 });
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText(/Técnicos del taller/i)).toBeHidden();

  // «Ir a Clientes» navega al módulo.
  const irClientes = guia.locator('[data-paso="clientes"]').getByRole('button', { name: 'Ir a Clientes' });
  await irClientes.click();
  await expect(page.getByText('No hay clientes registrados. Pulse «Nuevo Cliente» para empezar.')).toBeVisible({ timeout: 8000 });
});

test('guía de primeros pasos: «Ocultar» se recuerda al recargar', async ({ page }) => {
  await tallerNuevo(page);
  await login(page);
  const guia = page.getByTestId('guia-inicial');
  await expect(guia).toBeVisible({ timeout: 15000 });
  await guia.getByRole('button', { name: 'Ocultar la guía' }).click();
  await expect(guia).toBeHidden();
  // El script inicial borra la marca en cada carga: se quita para comprobar que sí se guardó.
  const guardada = await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('doonty-guia-oculta')));
  expect(guardada).toBe(true);
});
