import { test, expect } from '@playwright/test';
import { irA, login } from './helpers';

// Catálogo de servicios: se crea y edita en Configuración → Servicios y se elige al añadir mano de obra a una
// orden (se rellenan el texto y el precio). No se guarda ninguna orden; el servicio de prueba se borra al final.
test('servicios: crear y editar en Configuración, y elegirlo en la mano de obra de un presupuesto', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const nombre = `E2E servicio ${Date.now().toString(36)}`;
  const texto = `${nombre} — texto de la línea`;

  const abrirServicios = async () => {
    await page.getByTestId('menu-cuenta').click();
    await page.getByRole('menuitem', { name: 'Configuración de empresa' }).click();
    const ventana = page.getByRole('dialog', { name: 'Configuración de Empresa' });
    await expect(ventana).toBeVisible({ timeout: 15_000 });
    await ventana.getByRole('tab', { name: 'Servicios' }).click();
    const seccion = ventana.getByTestId('ajustes-servicios');
    await expect(seccion).toBeVisible({ timeout: 10_000 });
    return { ventana, seccion };
  };

  // 1) Crear sin precio y luego ponérselo editando.
  let { ventana, seccion } = await abrirServicios();
  const alta = seccion.locator('div.bg-slate-50').last();
  await alta.getByLabel('Nombre del servicio').fill(nombre);
  await alta.getByLabel('Texto de la reparación').fill(texto);
  await alta.getByRole('button', { name: 'Añadir servicio' }).click();
  const fila = seccion.getByTestId('servicio').filter({ hasText: nombre });
  await expect(fila).toBeVisible({ timeout: 10_000 });
  await expect(fila).toContainText('sin precio');

  await fila.getByRole('button', { name: `Editar ${nombre}` }).click();
  await seccion.locator('li.bg-blue-50\\/40').getByLabel('Precio del servicio').fill('42,50');
  await seccion.locator('li.bg-blue-50\\/40').getByRole('button', { name: 'Guardar' }).click();
  await expect(fila).toContainText('42,50 €', { timeout: 10_000 });
  // Un precio mal escrito avisa junto al botón y no guarda.
  await alta.getByLabel('Nombre del servicio').fill('x');
  await alta.getByLabel('Precio del servicio').fill('abc');
  await alta.getByRole('button', { name: 'Añadir servicio' }).click();
  await expect(seccion.getByRole('alert')).toContainText('precio válido');
  await alta.getByLabel('Nombre del servicio').fill('');
  await alta.getByLabel('Precio del servicio').fill('');
  await ventana.getByRole('button', { name: /Cerrar|Cancelar/ }).first().click();
  await expect(ventana).not.toBeVisible({ timeout: 5_000 });

  // 2) En un presupuesto nuevo, la mano de obra sugiere el servicio y rellena texto y precio.
  await irA(page, 'En el taller');
  await page.getByTestId('taller-presupuesto').click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).toBeVisible();
  const linea = page.locator('div').filter({ has: page.getByText('Añadir línea', { exact: true }) }).last();
  const descripcion = linea.getByLabel('Descripción de la mano de obra');
  await descripcion.click();
  await expect(page.getByRole('listbox', { name: 'Servicios del taller' })).toBeVisible();
  await descripcion.fill(nombre.slice(4)); // parte del nombre, en minúsculas
  const opcion = page.getByRole('listbox', { name: 'Servicios del taller' }).getByRole('option').filter({ hasText: nombre });
  await expect(opcion).toContainText('42,50 €');
  await opcion.click();
  await expect(descripcion).toHaveValue(texto);
  await expect(linea.getByPlaceholder('Precio venta € *')).toHaveValue('42.5');
  // Lo escrito a mano que no está en la lista se puede guardar en el catálogo (el usuario de pruebas es administrador).
  await descripcion.fill('Algo que no existe en el catálogo e2e');
  await expect(page.getByRole('option', { name: /Guardar «Algo que no existe en el catálogo e2e» en mis servicios/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // 3) Limpieza: borrar el servicio de prueba.
  await page.reload();
  await expect(page.getByTestId('menu-cuenta')).toBeVisible({ timeout: 15_000 });
  ({ ventana, seccion } = await abrirServicios());
  await seccion.getByRole('button', { name: `Borrar ${nombre}` }).click();
  await expect(seccion.getByTestId('servicio').filter({ hasText: nombre })).toHaveCount(0, { timeout: 10_000 });
});
