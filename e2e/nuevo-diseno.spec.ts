import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

// Rediseño (fase 1): el marco nuevo convive con la interfaz actual detrás de un interruptor. Estas pruebas no guardan nada en el taller de
// pruebas (ni siquiera el color): solo navegan, buscan y abren formularios sin enviarlos.
const CAPTURAS = process.env.E2E_CAPTURAS; // carpeta opcional donde guardar capturas de revisión

const errores = (page: Page) => {
  const lista: string[] = [];
  page.on('pageerror', (e) => lista.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') lista.push(`console: ${m.text()}`); });
  return lista;
};
const captura = async (page: Page, nombre: string) => { if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nombre}.png` }); };

async function activarNuevo(page: Page) {
  await login(page);
  await page.getByTestId('probar-nuevo-diseno').click();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
}

test('el interruptor cambia entre el diseño actual y el nuevo, y se recuerda', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await expect(page.locator('html')).toHaveAttribute('data-ui', 'nuevo');
  // El menú tiene texto y secciones por tareas.
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  for (const t of ['Hoy', 'En el taller', 'Citas', 'Clientes', 'Facturas']) await expect(menu.getByRole('button', { name: t })).toBeVisible();
  await captura(page, 'escritorio-hoy');

  await page.reload();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('menu-cuenta').click();
  await page.getByRole('menuitem', { name: 'Volver al diseño actual' }).click();
  await expect(page.getByTestId('marco-nuevo')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-ui', 'nuevo');
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible();
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('todas las pestañas cargan dentro del marco nuevo', async ({ page }) => {
  test.setTimeout(120_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  for (const t of ['En el taller', 'Citas', 'Clientes', 'Vehículos', 'Alertas', 'Facturas', 'Compras', 'Inventario', 'Rentabilidad', 'Hoy']) {
    await menu.getByRole('button', { name: new RegExp(`^${t}`) }).click();
    await expect(page.getByRole('status', { name: 'Cargando' }), `${t} se queda cargando`).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('main h2').first(), `${t} no pinta su título`).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Algo salió mal')).toHaveCount(0);
    await expect(menu.getByRole('button', { name: new RegExp(`^${t}`) })).toHaveAttribute('aria-current', 'page');
    if (t === 'En el taller') await captura(page, 'escritorio-taller');
  }
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Ctrl K busca por matrícula y lleva a la pestaña con la búsqueda hecha', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'Hoy' }).click();
  await page.keyboard.press('Control+k');
  const buscador = page.getByRole('dialog', { name: 'Buscar' });
  await expect(buscador).toBeVisible();
  await buscador.getByRole('textbox').fill('zzqqxx');
  await expect(buscador.getByText('No hay nada con eso')).toBeVisible();
  // Los coches del taller de pruebas llevan matrícula «…TST»; el espacio o el guion no importan.
  await buscador.getByRole('textbox').fill('9007 tst');
  await expect(buscador.getByTestId('resultado-busqueda').first()).toBeVisible();
  await captura(page, 'escritorio-buscador');
  await page.keyboard.press('Enter');
  await expect(buscador).toHaveCount(0);
  // Una orden → «En el taller» con la búsqueda ya escrita.
  await expect(page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'En el taller' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main input:not([type]), main input[type="text"], main input[type="search"]').first()).toHaveValue(/\S/);
});

test('el botón Nuevo abre el formulario de la pestaña elegida', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await page.getByTestId('boton-nuevo').click();
  await expect(page.getByRole('menuitem')).toHaveCount(6);
  await page.getByTestId('nuevo-cliente').click();
  await expect(page.getByText('Nuevo Cliente').last()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder(/nombre/i).first()).toBeVisible();

  // Recibir un coche: lleva al taller y abre la recepción.
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('boton-nuevo').click();
  await page.getByTestId('nuevo-ot').click();
  await expect(page.getByText('Nueva Orden de Trabajo').first()).toBeVisible({ timeout: 15_000 });
});

test('Color y aspecto enseña cómo queda y avisa del contraste (sin guardar)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await page.getByTestId('menu-cuenta').click();
  await page.getByRole('menuitem', { name: 'Color y aspecto' }).click();
  const ventana = page.getByRole('dialog', { name: 'Color y aspecto' });
  await expect(ventana).toBeVisible();
  await expect(ventana.getByTestId('guardar-color')).toBeDisabled(); // sin cambios no hay nada que guardar
  await ventana.getByRole('button', { name: 'Amarillo', exact: true }).click();
  await expect(ventana.getByTestId('lectura-color')).toContainText('oscuro'); // color claro: texto oscuro
  await ventana.getByRole('button', { name: 'Verde', exact: true }).click();
  await expect(ventana.getByTestId('lectura-color')).toContainText('blanco');
  await expect(ventana.getByTestId('guardar-color')).toBeEnabled();
  await captura(page, 'escritorio-color');
  await page.keyboard.press('Escape');
  await expect(ventana).toHaveCount(0);
});

test('en el móvil hay barra inferior con «Más» y no hay desplazamiento horizontal', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 }); // el acceso (diseño actual) se comprueba con el riel de escritorio
  await activarNuevo(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const barra = page.getByRole('navigation', { name: 'Menú principal (móvil)' });
  await expect(barra).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menú principal', exact: true })).toBeHidden();
  await captura(page, 'movil-hoy');
  await barra.getByRole('button', { name: 'En el taller' }).click();
  await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 });
  await captura(page, 'movil-taller');
  await barra.getByTestId('tab-mas').click();
  const mas = page.getByRole('dialog', { name: 'Menú' });
  await expect(mas).toBeVisible();
  await expect(mas.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await captura(page, 'movil-mas');
  await mas.getByRole('button', { name: /^Facturas/ }).click();
  await expect(mas).toHaveCount(0);
  await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 });
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(desborda, 'hay desplazamiento horizontal en el móvil').toBe(false);
  expect(fallos, fallos.join('\n')).toEqual([]);
});
