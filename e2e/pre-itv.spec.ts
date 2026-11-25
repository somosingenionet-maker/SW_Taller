import { test, expect } from '@playwright/test';
import { login, irA } from './helpers';

// Revisión pre-ITV: una orden marcada «Viene a pasar la ITV» lleva la etiqueta Pre-ITV y su inspección propone
// la plantilla Pre-ITV (puntos del manual de las estaciones ITV). La orden de prueba se borra al final.
const MATRICULA_PRUEBA = '9002TST';

test('pre-ITV: la orden marcada usa la plantilla Pre-ITV en la inspección', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await irA(page, 'En el taller');
  const buscador = page.getByPlaceholder('Buscar por número, matrícula o cliente...');
  const filas = page.locator('table tbody tr');
  const busqueda = page.waitForResponse(
    (r) => r.url().includes('/rpc/buscar_ordenes') && (r.request().postData() ?? '').includes(MATRICULA_PRUEBA),
    { timeout: 15_000 },
  );
  await buscador.fill(MATRICULA_PRUEBA);
  await busqueda;
  await page.waitForTimeout(200);
  const totalAntes = await filas.count();

  await page.getByTestId('taller-presupuesto').click();
  await page.getByRole('button', { name: /Buscar por matrícula, marca o cliente/ }).click();
  await page.getByPlaceholder('Buscar...').fill(MATRICULA_PRUEBA);
  await page.getByRole('listitem').filter({ hasText: MATRICULA_PRUEBA }).first().click();
  const buscadorCliente = page.getByRole('button', { name: /Buscar cliente por nombre/ });
  if (await buscadorCliente.isVisible()) {
    await buscadorCliente.click();
    await page.getByRole('listitem').first().click();
  }
  await page.locator('label:has-text("Fecha solicitud *") + input').fill(new Date().toISOString().slice(0, 10));
  await page.getByPlaceholder('Describe el problema que reporta el cliente...').fill('Prueba E2E pre-ITV — se elimina en el mismo test.');
  await page.getByLabel(/Viene a pasar la ITV/).check();
  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).not.toBeVisible({ timeout: 10_000 });
  await expect(filas).toHaveCount(totalAntes + 1, { timeout: 15_000 });

  try {
    await filas.first().click();
    await expect(page.getByTestId('chip-pre-itv')).toBeVisible({ timeout: 10_000 });
    const bloque = page.getByTestId('inspeccion-orden');
    await expect(bloque.getByLabel('Plantilla de inspección')).toHaveValue('pre-itv', { timeout: 10_000 });
    await bloque.getByTestId('iniciar-inspeccion').click();
    await expect(bloque.getByText('Plantilla: Pre-ITV')).toBeVisible({ timeout: 15_000 });
    await expect(bloque.getByText('55 sin marcar')).toBeVisible();
  } finally {
    // Limpieza: borrar la orden desde su ficha (la inspección se borra con ella).
    const eliminar = page.getByRole('button', { name: 'Eliminar OT' });
    if (!(await eliminar.isVisible())) await filas.first().click();
    await eliminar.click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await expect(filas).toHaveCount(totalAntes, { timeout: 10_000 });
  }
});
