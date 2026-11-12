import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Calidad básica: ningún guardado puede fallar en silencio, los importes llevan un único formato y
// la contraseña se cambia desde dentro. Ningún test deja datos: los guardados que se lanzan aquí
// están pensados para FALLAR (matrícula repetida, red cortada, contraseña actual equivocada).

const MATRICULA_EXISTENTE = '9001TST'; // vehículo sembrado en el tenant de pruebas

test('Vehículos: una matrícula repetida se explica y la ventana no se cierra', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Vehículos', exact: true }).click();
  await page.getByRole('button', { name: /Alta Vehículo/ }).click();
  await expect(page.getByText('Alta de Nuevo Vehículo')).toBeVisible();

  await page.getByPlaceholder('e.g. Toyota').fill('Prueba');
  await page.getByPlaceholder('e.g. Auris').fill('E2E duplicado');
  await page.getByPlaceholder('e.g. 1234-XYZ').fill(MATRICULA_EXISTENTE);
  await page.getByPlaceholder('17 caracteres alfanuméricos').fill('E2EDUPLICADO00001');
  await page.locator('label:has-text("Kilometraje actual") + input').fill('1000');
  await page.getByRole('button', { name: 'Guardar Nuevo' }).click();

  await expect(page.getByText('Ya tienes un vehículo registrado con esa matrícula.')).toBeVisible({ timeout: 10_000 });
  // Antes la ventana se cerraba como si se hubiera guardado: ahora sigue abierta con lo escrito.
  await expect(page.getByText('Alta de Nuevo Vehículo')).toBeVisible();
  await expect(page.getByPlaceholder('e.g. Auris')).toHaveValue('E2E duplicado');
});

test('Clientes: si el guardado falla, sale un aviso y no se pierde lo escrito', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Clientes', exact: true }).click();
  // Se corta solo el alta de clientes (POST): el resto de la aplicación sigue funcionando.
  await page.route('**/rest/v1/clientes*', (route) =>
    route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue());

  await page.getByRole('button', { name: /Nuevo Cliente/ }).click();
  await page.getByPlaceholder('e.g. Pilar', { exact: true }).fill('Prueba');
  await page.getByPlaceholder('e.g. Ramos Ortiz').fill('E2E Sin Red');
  await page.getByPlaceholder('e.g. 12345678W o NIE').fill('00000000T');
  const formulario = page.locator('form').filter({ has: page.getByPlaceholder('e.g. Pilar', { exact: true }) });
  for (const campo of await formulario.locator('input[required]').all()) {
    if (!(await campo.inputValue())) await campo.fill('600000001');
  }
  await formulario.locator('button[type="submit"]').click();

  const aviso = formulario.getByText('No se pudo guardar el cliente.', { exact: false });
  await expect(aviso).toBeVisible({ timeout: 10_000 });
  await expect(aviso).toContainText('No hay conexión');
  await expect(aviso).not.toContainText('Failed to fetch');
  await expect(page.getByPlaceholder('e.g. Ramos Ortiz')).toHaveValue('E2E Sin Red');
});

test('Taller: los importes de la lista llevan coma y dos decimales', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Taller', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

  const texto = await page.locator('table tbody').innerText();
  const importes = texto.match(/\d[\d.,]*\s€/g) ?? [];
  expect(importes.length).toBeGreaterThan(0);
  for (const importe of importes) expect(importe).toMatch(/^\d+,\d{2}\s€$/);
});

test('Seguridad: cambiar la contraseña exige la actual y no cierra la sesión', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Seguridad de la cuenta' }).click();
  await page.getByRole('button', { name: 'Cambiar mi contraseña' }).click();

  // Validación local: las dos nuevas deben coincidir.
  await page.getByLabel('Contraseña actual').fill('NoEsLaBuena1');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('Nueva1234x');
  await page.getByLabel('Repite la nueva contraseña').fill('Nueva1234y');
  await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
  await expect(page.getByText('Las contraseñas nuevas no coinciden.')).toBeVisible();

  // Contraseña actual equivocada: el servidor la rechaza y no se cambia nada.
  await page.getByLabel('Repite la nueva contraseña').fill('Nueva1234x');
  await page.getByRole('button', { name: 'Cambiar contraseña', exact: true }).click();
  await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible({ timeout: 10_000 });

  // La comprobación no ha tocado la sesión en curso: tras recargar se sigue dentro.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible({ timeout: 15_000 });
});
