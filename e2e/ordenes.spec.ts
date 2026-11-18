import { test, expect } from '@playwright/test';
import { login, irA } from './helpers';

// Vehículo de pruebas sembrado en el tenant demo (ver memoria de sesión:
// veh-test-01..15, matrículas 9001TST..9015TST) — usarlo evita depender de
// datos que un test anterior pudiera haber dejado a medias.
const MATRICULA_PRUEBA = '9001TST';

test('OT: crear un presupuesto lo añade a la lista, y se puede eliminar sin dejar rastro', async ({ page }) => {
  await login(page);
  await irA(page, 'En el taller');
  await expect(page.getByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible();

  const buscador = page.getByPlaceholder('Buscar por número, matrícula o cliente...');
  const filas = page.locator('table tbody tr');

  // Se espera a la respuesta de ESTA búsqueda antes de contar: con una pausa fija, una red lenta
  // hacía contar 0 filas, el test fallaba y además dejaba el presupuesto de prueba sin borrar.
  const busquedaHecha = () => page.waitForResponse(
    (r) => r.url().includes('/rpc/buscar_ordenes') && (r.request().postData() ?? '').includes(MATRICULA_PRUEBA),
    { timeout: 15_000 },
  );
  const primera = busquedaHecha();
  await buscador.fill(MATRICULA_PRUEBA);
  await primera;
  await page.waitForTimeout(200); // pintado de la tabla
  const totalAntes = await filas.count();

  await page.getByTestId('taller-presupuesto').click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).toBeVisible();

  // El vehículo se busca por matrícula (con o sin espacios) y se elige de la lista.
  await page.getByRole('button', { name: /Buscar por matrícula, marca o cliente/ }).click();
  await page.getByPlaceholder('Buscar...').fill(MATRICULA_PRUEBA.replace('TST', ' tst'));
  await page.getByRole('listitem').filter({ hasText: MATRICULA_PRUEBA }).first().click();
  // Si el vehículo no tiene cliente asociado, aparece un buscador de Cliente;
  // si lo tiene, se muestra un texto de solo lectura y no hace falta tocarlo.
  const buscadorCliente = page.getByRole('button', { name: /Buscar cliente por nombre/ });
  if (await buscadorCliente.isVisible()) {
    await buscadorCliente.click();
    await page.getByRole('listitem').first().click();
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
  await expect(filas).toHaveCount(totalAntes + 1, { timeout: 15_000 });

  const filaNueva = filas.first();
  await expect(filaNueva.getByText('Presupuesto', { exact: false })).toBeVisible();

  // Limpieza: abrir la fila recién creada y eliminarla, para no dejar
  // basura acumulándose en el tenant de pruebas con cada ejecución.
  await filaNueva.click();
  await page.getByRole('button', { name: 'Eliminar OT' }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect(filas).toHaveCount(totalAntes, { timeout: 8_000 });
});
