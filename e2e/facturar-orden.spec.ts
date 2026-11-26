import { test, expect, type Page } from '@playwright/test';
import { login, irA } from './helpers';

// «Facturar esta orden» en la ficha de una orden entregada: abre una factura nueva con el cliente, el vehículo y
// las líneas de la orden. La prueba no guarda nada (se cancela). Usa órdenes fijas del taller de ejemplo:
// OT-TST-14 (entregada, sin factura) y OT-2026-017 (entregada y ya facturada).
async function abrirOrden(page: Page, numero: string) {
  await irA(page, 'En el taller');
  const busqueda = page.waitForResponse((r) => r.url().includes('/rpc/buscar_ordenes') && (r.request().postData() ?? '').includes(numero), { timeout: 15_000 });
  await page.getByPlaceholder('Buscar por número, matrícula o cliente...').fill(numero);
  await busqueda;
  const fila = page.locator('table tbody tr').filter({ hasText: numero });
  await expect(fila).toHaveCount(1, { timeout: 10_000 });
  await fila.click();
}

test('orden entregada sin factura: «Facturar esta orden» abre la factura ya rellena', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await abrirOrden(page, 'OT-TST-14');
  const bloque = page.getByTestId('bloque-factura');
  await expect(bloque).toContainText('aún no tiene factura', { timeout: 10_000 });
  await bloque.getByTestId('facturar-orden').click();
  const guardar = page.getByRole('button', { name: 'Guardar factura' });
  await expect(guardar).toBeVisible({ timeout: 15_000 });
  // Cliente y vehículo ya elegidos, y el total de la orden (114,95 €) ya en la factura.
  const selects = page.locator('select');
  await expect(selects.nth(0)).not.toHaveValue('');
  await expect(selects.nth(1)).not.toHaveValue('');
  await expect(page.getByText('114,95 €').last()).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).last().click();
  await expect(guardar).toHaveCount(0);
});

test('orden ya facturada: la ficha lo dice en vez de ofrecer facturarla otra vez', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await abrirOrden(page, 'OT-2026-017');
  const bloque = page.getByTestId('bloque-factura');
  await expect(bloque).toContainText('Ver en Facturas', { timeout: 10_000 });
  await expect(bloque.getByTestId('facturar-orden')).toHaveCount(0);
});

test('ficha del cliente: enseña sus órdenes y al pulsar una se abre en el taller', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await irA(page, 'Clientes');
  await page.getByPlaceholder('Buscar por nombre, documento (NIF/NIE) o email...').fill('Fernández Gómez');
  await page.locator('table tbody tr').filter({ hasText: 'Antonio' }).first().click();
  const lista = page.getByTestId('ordenes-cliente');
  await expect(lista).toContainText('Órdenes de trabajo · 2', { timeout: 10_000 });
  await lista.getByRole('button').filter({ hasText: 'OT-2026-016' }).click();
  // Se abre la propia orden en el taller.
  await expect(page.getByText('OT-2026-016').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Editar OT' })).toBeVisible({ timeout: 15_000 });
});
