import { test, expect } from '@playwright/test';
import { login, irA } from './helpers';

// Un mecánico nuevo nace con su enlace personal, que se copia (o se manda por WhatsApp) desde su tarjeta.
// El mecánico de prueba se borra al final.
test('técnicos: el mecánico nuevo ya tiene su enlace en la tarjeta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.getByTestId('menu-cuenta').click();
  await page.getByRole('menuitem', { name: 'Configuración de empresa' }).click();
  const ventana = page.getByRole('dialog', { name: 'Configuración de Empresa' });
  await expect(ventana).toBeVisible({ timeout: 15_000 });
  await ventana.getByRole('tab', { name: 'Técnicos' }).click();
  await ventana.getByRole('button', { name: 'Añadir' }).click();
  await ventana.getByLabel('Nombre del técnico').fill('Prueba E2E Mecánico');
  await ventana.getByLabel('Teléfono WhatsApp').fill('600000009');
  await ventana.getByRole('button', { name: 'Guardar', exact: true }).click();
  const tarjeta = ventana.locator('div.rounded-2xl').filter({ hasText: 'Prueba E2E Mecánico' }).last();
  try {
    await expect(tarjeta.getByTestId('enlace-tecnico')).toContainText('Copiar enlace', { timeout: 10_000 });
    await expect(tarjeta.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /wa\.me\/34600000009\?text=.*mecanico/);
  } finally {
    await ventana.getByRole('button', { name: 'Eliminar Prueba E2E Mecánico' }).click();
    await expect(ventana.getByText('Prueba E2E Mecánico')).toHaveCount(0, { timeout: 10_000 });
  }
});

// Con el menú lateral, a unos 890 px el buscador se quedaba aplastado junto a los filtros.
test('ancho medio (888 px): los buscadores de Taller e Inventario tienen un ancho usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.setViewportSize({ width: 888, height: 972 });
  await irA(page, 'En el taller');
  const taller = page.getByPlaceholder('Buscar por número, matrícula o cliente...');
  await expect(taller).toBeVisible({ timeout: 15_000 });
  expect((await taller.boundingBox())!.width).toBeGreaterThan(300);
  await irA(page, 'Inventario');
  const inventario = page.getByPlaceholder('Buscar por nombre o SKU...');
  await expect(inventario).toBeVisible({ timeout: 15_000 });
  expect((await inventario.boundingBox())!.width).toBeGreaterThan(300);
});
