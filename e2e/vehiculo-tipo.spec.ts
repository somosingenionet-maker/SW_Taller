import { test, expect, type Page } from '@playwright/test';
import { login, irA } from './helpers';

// Tipo de vehículo (turismo / furgoneta de mercancías): se edita en la ficha y decide cada cuánto se propone la ITV.
// Usa el coche de prueba 9002TST (turismo de 2020) y lo deja como estaba al terminar.
const MATRICULA = '9002TST';

async function ponerTipo(page: Page, tipo: 'turismo' | 'furgoneta') {
  // La ficha abierta tapa la lista: se cierra antes de pulsar «Editar» en la fila.
  const cerrar = page.getByRole('button', { name: 'Cerrar panel' });
  if (await cerrar.isVisible()) await cerrar.click();
  await page.locator('#btn-edit-veh-test-02').click();
  const ventana = page.locator('#edit-vehicle-modal');
  await expect(ventana).toBeVisible();
  await ventana.getByLabel('Tipo (ficha técnica)').selectOption(tipo);
  await ventana.getByRole('button', { name: 'Guardar Cambios' }).click();
  await expect(ventana).toHaveCount(0, { timeout: 10_000 });
}

test('Vehículos: el tipo turismo/furgoneta se guarda y se ve en la ficha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await irA(page, 'Vehículos');
  await page.getByPlaceholder('Buscar por marca, modelo, matrícula o bastidor...').fill(MATRICULA);
  const fila = page.locator('table tbody tr').filter({ hasText: MATRICULA });
  await expect(fila).toHaveCount(1, { timeout: 10_000 });
  await fila.click();
  const resumen = page.getByTestId('vehiculo-tipo-anio');
  await expect(resumen).toHaveText(/Turismo \(M1\) · matriculado en 2020/);

  try {
    await ponerTipo(page, 'furgoneta');
    await fila.click();
    await expect(resumen).toHaveText(/Furgoneta de mercancías \(N1\)/);
    // Tras recargar sigue guardado.
    await page.reload();
    await irA(page, 'Vehículos');
    await page.getByPlaceholder('Buscar por marca, modelo, matrícula o bastidor...').fill(MATRICULA);
    await fila.click();
    await expect(resumen).toHaveText(/Furgoneta de mercancías \(N1\)/, { timeout: 10_000 });
  } finally {
    await ponerTipo(page, 'turismo');
    await fila.click();
    await expect(resumen).toHaveText(/Turismo \(M1\)/);
  }
});

test('Vehículos: la importación CSV reconoce la columna «Tipo» (sin importar nada)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await irA(page, 'Vehículos');
  await page.getByRole('button', { name: /Importar/ }).first().click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'vehiculos.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Matrícula;Marca;Modelo;Tipo;Tipo de combustible\n0001ZZZ;Ford;Transit;Furgoneta;Diésel\n0002ZZZ;Seat;Ibiza;Turismo;Gasolina\n'),
  });
  const ventana = page.getByRole('dialog');
  await expect(ventana.getByLabel('Destino de la columna Tipo', { exact: true })).toHaveValue('tipoVehiculo', { timeout: 15_000 });
  await expect(ventana.getByLabel('Destino de la columna Tipo de combustible')).toHaveValue('combustible');
  await expect(ventana.getByRole('button', { name: 'Importar 2 vehículos' })).toBeEnabled();
  await ventana.getByRole('button', { name: 'Cerrar' }).click();
  await expect(ventana).toHaveCount(0);
});
