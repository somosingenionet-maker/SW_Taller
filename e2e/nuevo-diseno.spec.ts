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
    await page.waitForTimeout(300);
    await captura(page, `pestana-${t.toLowerCase().replace(/ /g, '-')}`);
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

test('Hoy: lista lo que hay en el taller y cada fila lleva a su orden', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await activarNuevo(page);
  await expect(page.locator('main h2').first()).toContainText(/Buenos días|Buenas tardes|Buenas noches/);
  await expect(page.getByTestId('hoy-recibir')).toBeVisible();
  await expect(page.getByText(/Dentro del taller/)).toBeVisible();
  const filas = page.getByTestId('hoy-orden');
  await expect(filas.first()).toBeVisible({ timeout: 15_000 });
  await captura(page, 'escritorio-hoy-2');
  await filas.first().click();
  await expect(page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'En el taller' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main input:not([type]), main input[type="text"], main input[type="search"]').first()).toHaveValue(/OT-/);

  // «Recibir un coche» abre la recepción.
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'Hoy' }).click();
  await page.getByTestId('hoy-recibir').click();
  await expect(page.getByText('Nueva Orden de Trabajo').first()).toBeVisible({ timeout: 15_000 });
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Taller: el tablero enseña matrículas y la ficha de la orden se abre en una ventana centrada', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await activarNuevo(page);
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'En el taller' }).click();
  await page.getByTitle('Vista de tablero').click();
  const tablero = page.getByTestId('tablero-taller');
  await expect(tablero).toBeVisible({ timeout: 15_000 });
  await expect(tablero.getByTestId('tarjeta-orden').first()).toBeVisible();
  await expect(tablero.getByRole('img', { name: /^Matrícula / }).first()).toBeVisible();
  await captura(page, 'escritorio-tablero');

  // El botón del siguiente paso de un presupuesto abre la recepción (no cambia nada hasta confirmarla).
  const presupuesto = tablero.getByRole('region', { name: /^Presupuesto:/ });
  if (await presupuesto.getByTestId('tarjeta-orden').count() > 0) {
    await presupuesto.getByTestId('siguiente-paso').first().click();
    await expect(page.getByText('Recibir vehículo en taller')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByText('Recibir vehículo en taller')).toHaveCount(0);
  }

  // Abrir una orden: ventana centrada, no un panel pegado a la derecha.
  const ficha = page.locator('[data-panel-lateral]').first();
  // (al cancelar la recepción de arriba, la propia aplicación deja abierta la ficha de esa orden)
  if (!(await ficha.isVisible())) await tablero.getByTestId('tarjeta-orden').first().getByRole('button', { name: /^Abrir / }).click();
  await expect(ficha).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(400); // fin del fundido de entrada
  const caja = await ficha.boundingBox();
  const ancho = page.viewportSize()!.width;
  expect(caja, 'la ficha no tiene caja').not.toBeNull();
  expect(Math.abs((caja!.x + caja!.width / 2) - ancho / 2), 'la ficha no está centrada').toBeLessThan(4);
  expect(caja!.width, 'la ficha es demasiado estrecha').toBeGreaterThan(800);
  await expect(ficha.getByTestId('pasos-orden').getByRole('listitem')).toHaveCount(5);
  await expect(ficha.getByTestId('pasos-orden').locator('[aria-current="step"]')).toHaveCount(1);
  await captura(page, 'escritorio-orden');
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Clientes y Vehículos: lista a todo el ancho y la ficha se abre en una ventana centrada', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });

  await menu.getByRole('button', { name: 'Vehículos' }).click();
  await expect(page.getByRole('img', { name: /^Matrícula / }).first()).toBeVisible({ timeout: 15_000 });
  await captura(page, 'vehiculos-lista');
  await page.locator('main tbody tr[id^="veh-row-"]').first().click();
  const fichaV = page.getByRole('dialog', { name: 'Ficha del vehículo' });
  await expect(fichaV).toBeVisible();
  const caja = await fichaV.boundingBox();
  expect(Math.abs((caja!.x + caja!.width / 2) - 720), 'la ficha no está centrada').toBeLessThan(120); // 232 px de menú desplazan el centro útil
  await expect(fichaV.getByText('Ficha Técnica Activa')).toBeVisible();
  await captura(page, 'vehiculos-ficha');
  await page.keyboard.press('Escape');
  await expect(fichaV).toHaveCount(0);

  // La ficha del coche dice de quién es (el 1007DDT del taller de pruebas es de Daniela).
  const conDueno = page.locator('main tbody tr[id^="veh-row-"]').filter({ hasText: '1007DDT' });
  if (await conDueno.count() > 0) {
    await conDueno.first().click();
    await expect(fichaV.getByTestId('propietario-vehiculo')).toContainText('Daniela');
    await page.keyboard.press('Escape');
    await expect(fichaV).toHaveCount(0);
  }

  await menu.getByRole('button', { name: 'Clientes' }).click();
  await page.locator('main tbody tr[id^="cli-row-"]').first().click();
  const fichaC = page.getByRole('dialog', { name: 'Ficha del cliente' });
  await expect(fichaC).toBeVisible();
  await expect(fichaC.getByText('Información de Cliente')).toBeVisible();
  await captura(page, 'clientes-ficha');
  // Editar abre su formulario encima de la ficha (se ve), y Esc cierra la ficha solo si el foco está en ella.
  await fichaC.getByTitle('Editar ficha').click();
  await expect(page.getByText('Editar Información de Ficha')).toBeVisible();
  const formulario = page.locator('div.fixed.z-50').filter({ hasText: 'Editar Información de Ficha' });
  await expect(formulario).toBeVisible();
  await formulario.getByRole('button', { name: /Cancelar/ }).first().click();
  await expect(page.getByText('Editar Información de Ficha')).toHaveCount(0);
  await expect(fichaC).toBeVisible(); // la ficha sigue abierta debajo
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('acceso: pantallas de entrada con el diseño nuevo, en escritorio y en móvil', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByPlaceholder('usuario@empresa.net')).toBeVisible();
  await expect(page.getByText('Tu taller, en orden.')).toBeVisible();
  await captura(page, 'acceso-escritorio');
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar contraseña' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a iniciar sesión' }).click();
  await page.locator('#acceso-clave').fill('abc');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.locator('#acceso-clave')).toHaveAttribute('type', 'text');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Tu taller, en orden.')).toBeHidden();
  await captura(page, 'acceso-movil');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), 'desplazamiento horizontal en el acceso').toBe(false);

  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: 'Prueba Doonty Motor gratis' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Empezar mi prueba gratuita' })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Empezar mi prueba gratuita' })).toBeEnabled();
  await captura(page, 'registro-movil');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), 'desplazamiento horizontal en el alta').toBe(false);
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('aspecto: el modo oscuro se elige, se recuerda y se aplica a todas las pestañas', async ({ page }) => {
  test.setTimeout(120_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', 'oscuro');
  await page.getByTestId('menu-cuenta').click();
  await page.getByTestId('tema-oscuro').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');
  const fondo = await page.locator('.u-app').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(fondo, 'el fondo no es oscuro').toBe('rgb(16, 17, 20)');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro');

  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  for (const t of ['Hoy', 'En el taller', 'Citas', 'Clientes', 'Vehículos', 'Alertas', 'Facturas', 'Rentabilidad', 'Compras', 'Inventario']) {
    await menu.getByRole('button', { name: new RegExp(`^${t}`) }).click();
    await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(250);
    await captura(page, `oscuro-${t.toLowerCase().replace(/ /g, '-')}`);
  }
  // Volver a claro.
  await page.getByTestId('menu-cuenta').click();
  await page.getByTestId('tema-claro').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-tema', 'oscuro');
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('responsive: sin desplazamiento horizontal de la página en 360, 768 y 1024 px', async ({ page }) => {
  test.setTimeout(150_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const nombres: Record<string, string> = { Hoy: 'tab-inicio', 'En el taller': 'tab-taller', Citas: 'tab-citas', Clientes: 'tab-clientes' };
  for (const ancho of [360, 768, 1024]) {
    await page.setViewportSize({ width: ancho, height: 900 });
    const menuEscritorio = page.getByRole('navigation', { name: 'Menú principal', exact: true });
    for (const t of Object.keys(nombres)) {
      if (ancho <= 860) await page.getByTestId(nombres[t]).click(); else await menuEscritorio.getByRole('button', { name: new RegExp(`^${t}`) }).click();
      await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(200);
      const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1);
      expect(desborda, `${t} desborda en ${ancho}px`).toBe(false);
    }
  }
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Configuración de empresa: ventana grande con menú de secciones, tarjetas y pie fijo (sin guardar nada)', async ({ page }) => {
  test.setTimeout(90_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await page.getByTestId('menu-cuenta').click();
  await page.getByRole('menuitem', { name: 'Configuración de empresa' }).click();
  const ventana = page.getByRole('dialog', { name: 'Configuración de Empresa' });
  await expect(ventana).toBeVisible({ timeout: 15_000 });
  const caja = await ventana.boundingBox();
  expect(caja!.width, 'la ventana es demasiado estrecha').toBeGreaterThan(1000);
  expect(caja!.height, 'la ventana es demasiado baja').toBeGreaterThan(700);

  const nav = ventana.getByRole('tablist', { name: 'Secciones de la configuración' });
  await expect(nav.getByRole('tab')).toHaveCount(8);
  await captura(page, 'ajustes-datos');
  for (const [tab, texto] of [['Facturación', 'Numeración de facturas'], ['Logo y color', 'Color de marca'], ['Recordatorios', 'Mensaje de cada recordatorio'], ['Reservas online', ''], ['Inspección', ''], ['Fotos', 'Conservar las fotos de cada orden'], ['Técnicos', 'Técnicos del taller']] as const) {
    await nav.getByRole('tab', { name: tab }).click();
    await expect(ventana.getByRole('heading', { name: tab === 'Facturación' ? 'Facturación' : tab, level: 2 })).toBeVisible();
    if (texto) await expect(ventana.getByText(texto).first()).toBeVisible();
    await page.waitForTimeout(150);
    await captura(page, `ajustes-${tab.toLowerCase().replace(/[^a-z]+/g, '-')}`);
  }

  // Con cambios sin guardar, Esc no cierra y se avisa; sin cambios, Esc cierra.
  await nav.getByRole('tab', { name: 'Datos de la empresa' }).click();
  const nombre = ventana.getByLabel('Nombre de la empresa *');
  const original = await nombre.inputValue();
  await nombre.fill(`${original} x`);
  await expect(ventana.getByTestId('cambios-sin-guardar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ventana).toBeVisible();
  await nombre.fill(original);
  await expect(ventana.getByTestId('cambios-sin-guardar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(ventana).toHaveCount(0);

  // En el móvil el menú de secciones pasa a una fila deslizable y no hay desplazamiento horizontal.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('tab-mas').click();
  await page.getByRole('dialog', { name: 'Menú' }).getByRole('button', { name: 'Configuración de empresa' }).click();
  await expect(ventana).toBeVisible();
  await captura(page, 'ajustes-movil');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  expect(fallos, fallos.join('\n')).toEqual([]);
});
