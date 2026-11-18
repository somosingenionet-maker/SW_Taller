import { test, expect } from '@playwright/test';
import { login, irA, menuPrincipal } from './helpers';

// Estas pruebas son deliberadamente de solo lectura: navegan a Facturas y
// Rentabilidad y comprueban que cargan, pero NUNCA emiten una factura (es
// irreversible en VeriFactu y consumiría la numeración real del tenant).

test('Facturas: la pestaña carga y muestra el listado sin errores', async ({ page }) => {
  await login(page);
  await irA(page, 'Facturas');
  await expect(page.getByRole('button', { name: 'Nueva Factura' })).toBeVisible();
});

test('Rentabilidad: la pestaña carga los indicadores sin errores', async ({ page }) => {
  await login(page);
  await irA(page, 'Rentabilidad');
  await expect(page.getByRole('heading', { name: 'Rentabilidad', exact: true })).toBeVisible();
});

test('Inicio: el panel principal carga tras iniciar sesión', async ({ page }) => {
  await login(page);
  await irA(page, 'Hoy');
  // El login ya deja «Hoy» como sección activa; aquí se confirma que también se puede volver a ella.
  await expect(menuPrincipal(page).getByRole('button', { name: /^Hoy/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('hoy-recibir')).toBeVisible();
});
