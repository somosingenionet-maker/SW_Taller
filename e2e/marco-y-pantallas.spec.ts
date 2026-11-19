import { test, expect, type Page } from '@playwright/test';
import { irA, login } from './helpers';

// El marco de la aplicación (menú, buscador, «Nuevo», cuenta, aspecto) y sus pantallas principales. Las pruebas que crean datos los borran siempre al terminar.
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
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
}

test('el marco: menú por tareas con texto, cuenta sin restos del diseño anterior y se recuerda al recargar', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  for (const t of ['Hoy', 'En el taller', 'Citas', 'Clientes', 'Facturas']) await expect(menu.getByRole('button', { name: t, exact: true })).toBeVisible();
  await captura(page, 'escritorio-hoy');
  await page.reload();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
  // El logo del taller (si lo tiene) ocupa el botón de la cuenta; el de Doonty Motor sigue fijo en el menú.
  await expect(page.getByTestId('menu-cuenta').locator('img.u-avatar-logo')).toBeVisible();
  await expect(page.locator('.u-rail .u-logo-img')).toHaveAttribute('src', '/logo-doonty.svg');
  await page.getByTestId('menu-cuenta').click();
  await expect(page.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /diseño/i })).toHaveCount(0);
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('todas las pestañas cargan dentro del marco', async ({ page }) => {
  test.setTimeout(120_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  for (const t of ['En el taller', 'Citas', 'Clientes', 'Vehículos', 'Avisos', 'Facturas', 'Compras', 'Inventario', 'Rentabilidad', 'Hoy']) {
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
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'Hoy', exact: true }).click();
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
  await expect(page.getByRole('menuitem')).toHaveCount(7);
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

test('el color de la empresa se elige solo en Configuración → Logo y color (no está duplicado en el menú) y enseña el contraste sin guardar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  await page.getByTestId('menu-cuenta').click();
  // En el menú de la cuenta queda lo personal (claro/oscuro); el color es de la empresa y no se repite aquí.
  await expect(page.getByRole('menuitem', { name: 'Configuración de empresa' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Color y aspecto' })).toHaveCount(0);
  await expect(page.getByTestId('tema-oscuro')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Configuración de empresa' }).click();
  const ventana = page.getByRole('dialog', { name: 'Configuración de Empresa' });
  await expect(ventana).toBeVisible({ timeout: 15_000 });
  await ventana.getByRole('tab', { name: 'Logo y color' }).click();
  const selector = ventana.getByTestId('selector-color');
  await expect(selector).toBeVisible();
  await selector.getByRole('button', { name: 'Amarillo', exact: true }).click();
  await expect(selector.getByTestId('lectura-color')).toContainText('oscuro'); // color claro: texto oscuro
  await selector.getByRole('button', { name: 'Verde', exact: true }).click();
  await expect(selector.getByTestId('lectura-color')).toContainText('blanco');
  // El logo subido no se pinta sobre el color elegido: el cuadro del logo solo toma el color cuando se enseñan las iniciales.
  await captura(page, 'escritorio-color');
  // Sin guardar nada: Esc con cambios pendientes no cierra la ventana, así que se descarta el cambio con «Cancelar».
  await ventana.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect(ventana).toHaveCount(0);
});

test('en el móvil hay barra inferior con «Más» y no hay desplazamiento horizontal', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 }); // se entra con el menú de escritorio y luego se estrecha
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
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'Hoy', exact: true }).click();
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
  await expect(tablero.getByTestId('matricula').first()).toBeVisible();
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
  await expect(page.getByTestId('matricula').first()).toBeVisible({ timeout: 15_000 });
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
  for (const t of ['Hoy', 'En el taller', 'Citas', 'Clientes', 'Vehículos', 'Avisos', 'Facturas', 'Rentabilidad', 'Compras', 'Inventario']) {
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

test('móvil: ninguna sección sobresale de la pantalla y el contenido no se arrastra de lado', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  // La página en sí casi nunca desborda: lo que se desborda es la zona de contenido, que tiene su propio scroll. Por eso se mira ahí, elemento
  // por elemento (lo que va dentro de una tabla con scroll propio no cuenta: esa caja se desplaza sola y no arrastra la página).
  for (const seccion of ['Hoy', 'En el taller', 'Citas', 'Clientes', 'Vehículos', 'Avisos', 'Facturas', 'Compras', 'Rentabilidad', 'Inventario'] as const) {
    for (const ancho of [360, 390]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await irA(page, seccion);
      await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(300);
      await page.setViewportSize({ width: ancho, height: 800 });
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const fuera: string[] = [];
        document.querySelectorAll('.u-scroll *').forEach((el) => {
          const b = (el as HTMLElement).getBoundingClientRect();
          if (b.width <= 0 || b.right <= W + 1) return;
          let p = el.parentElement;
          while (p && !p.classList.contains('u-scroll')) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return; p = p.parentElement; }
          fuera.push(`${el.tagName.toLowerCase()}.${(el.className?.toString() ?? '').split(' ').filter(Boolean).slice(0, 3).join('.')} (${Math.round(b.right)})`);
        });
        const zona = document.querySelector('.u-scroll') as HTMLElement;
        return { fuera: fuera.slice(0, 5), lateral: getComputedStyle(zona).overflowX, pagina: document.documentElement.scrollWidth > W + 1 };
      });
      expect(r.fuera, `${seccion} a ${ancho}px: sobresale de la pantalla`).toEqual([]);
      expect(r.lateral, `${seccion}: la zona de contenido no debe arrastrarse de lado`).toBe('hidden');
      expect(r.pagina, `${seccion} a ${ancho}px: la página desborda`).toBe(false);
    }
  }
});

test('móvil: las listas son tarjetas (sin tablas anchas) y el € va pegado al importe', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const listas: [Parameters<typeof irA>[1], string][] = [
    ['En el taller', 'lista-ordenes-movil'], ['Clientes', 'lista-clientes-movil'], ['Vehículos', 'lista-vehiculos-movil'],
    ['Facturas', 'lista-facturas-movil'], ['Inventario', 'lista-productos-movil'],
  ];
  for (const [seccion, id] of listas) {
    // En escritorio sigue la tabla de siempre.
    await page.setViewportSize({ width: 1440, height: 900 });
    await irA(page, seccion);
    await expect(page.getByRole('status', { name: 'Cargando' })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('main table').first(), `${seccion}: en escritorio hay tabla`).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId(id)).toHaveCount(0);
    // En el móvil son tarjetas.
    await page.setViewportSize({ width: 390, height: 800 });
    await expect(page.getByTestId(id), `${seccion}: en el móvil hay tarjetas`).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('main table'), `${seccion}: en el móvil no debe quedar ninguna tabla ancha`).toHaveCount(0);
    // Ningún importe parte el € en otra línea.
    const partidos = await page.evaluate(() => [...document.querySelectorAll('.u-tl-imp')].filter((e) => (e as HTMLElement).getBoundingClientRect().height > 30).map((e) => e.textContent));
    expect(partidos, `${seccion}: importes con el € en otra línea`).toEqual([]);
  }
  // En el taller el importe lleva el € al lado, con un espacio que no se parte.
  await page.setViewportSize({ width: 1440, height: 900 });
  await irA(page, 'En el taller');
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.getByTestId('lista-ordenes-movil').locator('.u-tl-imp', { hasText: '€' }).first()).toHaveText(/\d,\d{2}\u00a0€/);
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

test('Taller: «Recibir un coche» y «Nuevo presupuesto» abren la misma orden con el tipo ya elegido', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  // Desde Hoy y desde el menú «Nuevo»: se abre recibiendo el coche.
  await page.getByTestId('hoy-recibir').click();
  await expect(page.getByRole('button', { name: /Recibir el coche/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Crear OT' })).toBeVisible();
  await page.getByRole('button', { name: /Solo presupuesto/ }).click();
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('marco-nuevo')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('boton-nuevo').click();
  await page.getByTestId('nuevo-presupuesto').click();
  await expect(page.getByRole('button', { name: /Solo presupuesto/ })).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Crear presupuesto' })).toBeVisible();
  // El vehículo se busca por matrícula, sin importar espacios.
  await page.getByRole('button', { name: /Buscar por matrícula, marca o cliente/ }).click();
  await page.getByPlaceholder('Buscar...').fill('9007 tst');
  await expect(page.getByRole('listitem').filter({ hasText: '9007TST' }).first()).toBeVisible();
  await captura(page, 'nueva-orden');
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('cuadros: todos comparten el mismo aspecto (cabecera clara con título y botón de cerrar)', async ({ page }) => {
  test.setTimeout(240_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  const irA = async (t: string) => { await menu.getByRole('button', { name: new RegExp(`^${t}`) }).click(); await expect(page.locator('main h2').first()).toBeVisible({ timeout: 15_000 }); };

  // Mide la cabecera del cuadro abierto: ha de ser clara (no la oscura de antes) y tener título.
  const medir = async (nombre: string) => {
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const luz = (c: string) => { const m = c.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]; return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
      const cajas = [...document.querySelectorAll<HTMLElement>('.fixed .animate-modal-pop, .fixed [role="dialog"], .fixed .dlg-b')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
      const caja = cajas[cajas.length - 1];
      if (!caja) return null;
      const cab = (caja.querySelector('.bg-slate-950, .bg-slate-50, .dlg-b > :first-child, .u-ventana-cab') ?? caja.firstElementChild) as HTMLElement;
      const bg = getComputedStyle(cab).backgroundColor;
      return { luz: luz(bg), alto: caja.getBoundingClientRect().height, ancho: caja.getBoundingClientRect().width, tieneX: !!caja.querySelector('button svg') };
    });
    expect(r, `${nombre}: no se encontró el cuadro`).not.toBeNull();
    expect(r!.luz, `${nombre}: la cabecera es oscura`).toBeGreaterThan(0.85);
    await captura(page, `cuadro-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
  };

  await irA('En el taller');
  await page.getByTestId('taller-recibir').click();
  await medir('Nueva orden');
  await page.keyboard.press('Escape'); // el cuadro de orden se cierra con la X o pulsando fuera
  await page.mouse.click(5, 450);
  await page.waitForTimeout(200);

  await irA('Clientes');
  await page.getByRole('button', { name: /Nuevo Cliente/ }).click();
  await medir('Nuevo cliente');
  await page.mouse.click(5, 450);

  await irA('Vehículos');
  await page.getByRole('button', { name: /Alta Vehículo/ }).click();
  await medir('Nuevo vehiculo');
  await page.mouse.click(5, 450);

  await irA('Inventario');
  await page.getByRole('button', { name: /Nuevo producto/ }).click();
  await medir('Nuevo producto');
  await page.mouse.click(5, 450);

  await irA('Citas');
  await page.getByRole('button', { name: /Nueva cita/ }).first().click();
  await medir('Nueva cita');
  await page.mouse.click(5, 450);

  await irA('Facturas');
  await page.getByRole('button', { name: /Nueva Factura/ }).click();
  await medir('Nueva factura');
  await page.mouse.click(5, 450);
  await page.getByRole('button', { name: /Para la gestoría/ }).click();
  await medir('Exportar gestoria');
  await page.mouse.click(5, 450);

  await irA('Compras');
  await page.getByRole('button', { name: /Nueva compra/ }).click();
  await medir('Nueva compra');
  await page.mouse.click(5, 450);

  for (const [nombre, abrir] of [
    ['Seguridad de la cuenta', 'Seguridad de la cuenta'],
    ['Panel de administracion', 'Panel de administración'],
  ] as const) {
    await page.getByTestId('menu-cuenta').click();
    await page.getByRole('menuitem', { name: abrir }).click();
    await medir(nombre);
    await page.mouse.click(5, 450);
    await page.waitForTimeout(200);
  }
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Alta rápida: crear cliente y vehículo desde la orden, quedan elegidos y asociados (y se borran al terminar)', async ({ page }) => {
  test.setTimeout(150_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await activarNuevo(page);
  const sufijo = Date.now().toString().slice(-6);
  const matricula = `E2E${sufijo}`;
  const nombre = `Prueba${sufijo}`;
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });

  // Pase lo que pase, se borra todo lo que esta prueba (o una anterior que se quedara a medias) haya creado.
  const limpiar = async () => {
    for (let i = 0; i < 2; i++) { await page.mouse.click(5, 450); await page.waitForTimeout(250); } // cierra el alta rápida y la orden, si siguen abiertas
    await menu.getByRole('button', { name: 'Vehículos' }).click();
    await page.getByPlaceholder(/Buscar por marca, modelo, matrícula/).fill('E2E');
    await page.waitForTimeout(400);
    const filasV = page.locator('main tbody tr[id^="veh-row-"]').filter({ hasText: /E2E\d{6}/ });
    while (await filasV.count() > 0) {
      await filasV.first().getByTitle('Eliminar').click();
      await page.getByRole('button', { name: 'Sí, eliminar' }).click();
      await page.waitForTimeout(700);
    }
    await menu.getByRole('button', { name: 'Clientes' }).click();
    await page.getByPlaceholder(/Buscar por nombre, documento/).fill('Alta Rápida');
    await page.waitForTimeout(400);
    const filasC = page.locator('main tbody tr[id^="cli-row-"]').filter({ hasText: /Prueba\d{6} Alta Rápida/ });
    while (await filasC.count() > 0) {
      await filasC.first().getByTitle('Borrar ficha').click();
      await page.getByRole('button', { name: 'Sí, borrar' }).click();
      await page.waitForTimeout(700);
    }
  };

  try {
    await menu.getByRole('button', { name: 'En el taller' }).click();
    await page.getByTestId('taller-recibir').click();
    await page.getByRole('button', { name: /Buscar por matrícula, marca o cliente/ }).click();
    await page.getByPlaceholder('Buscar...').fill(matricula);
    await page.getByText(/Crear vehículo/).click();
    const alta = page.getByTestId('alta-rapida');
    await expect(alta).toBeVisible();
    await expect(alta.getByLabel('Matrícula *')).toHaveValue(matricula);
    // Sin datos mínimos no deja guardar y lo explica.
    await alta.getByTestId('ar-dueno-nuevo').click();
    await alta.getByTestId('alta-rapida-guardar').click();
    await expect(alta.getByTestId('alta-rapida-error')).toContainText('matrícula, la marca o el modelo');
    await alta.getByLabel('Marca *').fill('Seat');
    await alta.getByLabel('Modelo *').fill('Ibiza E2E');
    await alta.getByLabel('Nombre *').fill(nombre);
    await alta.getByLabel('Apellidos *').fill('Alta Rápida');
    await alta.getByLabel('Teléfono *').fill('600123123');
    await captura(page, 'alta-rapida');
    await alta.getByTestId('alta-rapida-guardar').click();
    await expect(alta).toHaveCount(0, { timeout: 15_000 });

    // La orden ya tiene el vehículo y su dueño elegidos.
    const orden = page.getByRole('button', { name: 'Crear OT' }).locator('xpath=ancestor::form');
    await expect(orden.getByText(`Seat Ibiza E2E · ${matricula}`).first()).toBeVisible();
    await expect(orden.getByText('Asignado al vehículo')).toBeVisible();
    await expect(orden.getByText(`${nombre} Alta Rápida`).first()).toBeVisible();
  } finally {
    await limpiar();
  }
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Taller: con el coche ya recibido se ofrece enviar el presupuesto para su aprobación', async ({ page }) => {
  const fallos = errores(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await activarNuevo(page);
  await page.getByRole('navigation', { name: 'Menú principal', exact: true }).getByRole('button', { name: 'En el taller' }).click();
  await page.getByTitle('Vista de tablero').click();
  const recibido = page.getByTestId('tablero-taller').getByRole('region', { name: /^Recibido:/ });
  await expect(recibido).toBeVisible({ timeout: 15_000 });
  test.skip(await recibido.getByTestId('tarjeta-orden').count() === 0, 'No hay ninguna orden en Recibido');
  await recibido.getByTestId('tarjeta-orden').first().getByRole('button', { name: /^Abrir / }).click();
  const ficha = page.locator('[data-panel-lateral]').first();
  await expect(ficha).toBeVisible({ timeout: 10_000 });
  // O ya está aprobado, o se ofrece enviarlo (con correo, WhatsApp o enlace) y la cabecera avisa de lo que falta.
  const bloque = ficha.getByTestId('bloque-presupuesto');
  if (await bloque.count() > 0) {
    await expect(bloque).toContainText('Presupuesto para aprobación');
    await expect(bloque.getByTestId('enviar-presupuesto-correo')).toBeVisible();
    await expect(bloque.getByTestId('enviar-presupuesto-whatsapp')).toBeVisible();
    await expect(ficha.getByTestId('aviso-paso')).toBeVisible();
  } else {
    await expect(ficha.getByTestId('presupuesto-aprobado')).toBeVisible();
  }
  await captura(page, 'presupuesto-en-taller');
  expect(fallos, fallos.join('\n')).toEqual([]);
});

test('Recibir un coche directo: su ficha ofrece enviar el presupuesto al cliente y avisa de lo que falta (se borra al terminar)', async ({ page }) => {
  test.setTimeout(120_000);
  const fallos = errores(page);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await activarNuevo(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal', exact: true });
  await menu.getByRole('button', { name: 'En el taller' }).click();
  await page.getByTitle('Vista de tablero').click();
  const recibido = page.getByTestId('tablero-taller').getByRole('region', { name: /^Recibido:/ });
  await expect(recibido).toBeVisible({ timeout: 15_000 });
  const tarjetaMia = () => recibido.getByTestId('tarjeta-orden').filter({ hasText: '9001TST' });
  expect(await tarjetaMia().count(), 'quedó una orden de pruebas anterior en Recibido').toBe(0);

  // El coche 9001TST (Seat León de pruebas) llega directo a revisión.
  await page.getByTestId('taller-recibir').click();
  await page.getByRole('button', { name: /Buscar por matrícula, marca o cliente/ }).click();
  await page.getByPlaceholder('Buscar...').fill('9001tst');
  await page.getByRole('listitem').filter({ hasText: '9001TST' }).first().click();
  await page.locator('label:has-text("Km entrada *") + input').fill('1234');
  await page.getByPlaceholder('Describe el problema que reporta el cliente...').fill('Prueba automatizada E2E: llega directo a revisión.');
  await page.getByRole('button', { name: 'Crear OT' }).click();
  await expect(page.getByRole('button', { name: 'Crear OT' })).toHaveCount(0, { timeout: 15_000 });

  try {
    await expect(tarjetaMia()).toHaveCount(1, { timeout: 15_000 });
    await expect(tarjetaMia().getByText('Pdte. respuesta')).toHaveCount(0); // aún no se ha enviado nada
    await tarjetaMia().getByRole('button', { name: /^Abrir / }).click();
    const ficha = page.locator('[data-panel-lateral]').first();
    await expect(ficha).toBeVisible({ timeout: 10_000 });
    const bloque = ficha.getByTestId('bloque-presupuesto');
    await expect(bloque).toContainText('Presupuesto para aprobación');
    await expect(bloque).toContainText('Pendiente de envío');
    await expect(bloque).toContainText('Aún no hay importe');
    await expect(bloque.getByTestId('enviar-presupuesto-correo')).toBeVisible();
    await expect(bloque.getByTestId('enviar-presupuesto-whatsapp')).toBeVisible();
    await expect(ficha.getByTestId('aviso-paso')).toContainText('Falta enviar el presupuesto al cliente');
    await captura(page, 'recibido-sin-presupuesto');
  } finally {
    // Limpieza: se elimina la orden creada.
    const ficha = page.locator('[data-panel-lateral]').first();
    if (!(await ficha.isVisible())) {
      if (await tarjetaMia().count() > 0) await tarjetaMia().getByRole('button', { name: /^Abrir / }).click();
    }
    if (await ficha.isVisible()) {
      await ficha.getByTitle('Eliminar OT').click();
      await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
      await expect(tarjetaMia()).toHaveCount(0, { timeout: 10_000 });
    }
  }
  expect(fallos, fallos.join('\n')).toEqual([]);
});
