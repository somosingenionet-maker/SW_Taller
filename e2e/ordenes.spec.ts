import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Vehículo de pruebas sembrado en el tenant demo (ver memoria de sesión:
// veh-test-01..15, matrículas 9001TST..9015TST) — usarlo evita depender de
// datos que un test anterior pudiera haber dejado a medias.
const MATRICULA_PRUEBA = '9001TST';
const VEHICULO_ID_PRUEBA = 'veh-test-01';

test('OT: crear un presupuesto lo añade a la lista, y se puede eliminar sin dejar rastro', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Taller', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible();

  const buscador = page.getByPlaceholder('Buscar por número, matrícula o cliente...');
  const filas = page.locator('table tbody tr');

  await buscador.fill(MATRICULA_PRUEBA);
  await page.waitForTimeout(400); // debounce de búsqueda (300ms) + respuesta
  const totalAntes = await filas.count();

  await page.getByRole('button', { name: 'Nueva OT' }).click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).toBeVisible();

  await page.locator('label:has-text("Vehículo *") + select').selectOption(VEHICULO_ID_PRUEBA);
  // Si el vehículo no tiene cliente asociado, aparece un select de Cliente;
  // si lo tiene, se muestra un texto de solo lectura y no hace falta tocarlo.
  const selectCliente = page.locator('label:has-text("Cliente *") + select');
  if (await selectCliente.isVisible()) {
    await selectCliente.selectOption({ index: 1 });
  }
  await page.locator('label:has-text("Fecha solicitud *") + input').fill(new Date().toISOString().slice(0, 10));
  await page.getByPlaceholder('Describe el problema que reporta el cliente...').fill(
    'Prueba automatizada E2E — creado por Playwright, se elimina en el mismo test.',
  );

  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).not.toBeVisible({ timeout: 10_000 });

  // La búsqueda sigue activa (mismo filtro) — el nuevo presupuesto debe
  // aparecer como la fila más reciente (buscar_ordenes ordena por
  // updated_at desc), sumando una fila más a las que ya había.
  await page.waitForTimeout(400);
  await expect(filas).toHaveCount(totalAntes + 1);

  const filaNueva = filas.first();
  await expect(filaNueva.getByText('Presupuesto', { exact: false })).toBeVisible();

  // Limpieza: abrir la fila recién creada y eliminarla, para no dejar
  // basura acumulándose en el tenant de pruebas con cada ejecución.
  await filaNueva.click();
  await page.getByRole('button', { name: 'Eliminar OT' }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect(filas).toHaveCount(totalAntes, { timeout: 8_000 });
});
