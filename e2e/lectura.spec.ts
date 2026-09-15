import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Estas pruebas son deliberadamente de solo lectura: navegan a Facturas y
// Rentabilidad y comprueban que cargan, pero NUNCA emiten una factura (es
// irreversible en VeriFactu y consumiría la numeración real del tenant).

test('Facturas: la pestaña carga y muestra el listado sin errores', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Facturas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nueva Factura' })).toBeVisible();
});

test('Rentabilidad: la pestaña carga los indicadores sin errores', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Rentabilidad', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rentabilidad del Taller' })).toBeVisible();
});

test('Inicio: el panel principal carga tras iniciar sesión', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  // El propio login helper ya deja "Inicio" como pestaña activa por
  // defecto; aquí solo se confirma que también se puede volver a ella.
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible();
});
