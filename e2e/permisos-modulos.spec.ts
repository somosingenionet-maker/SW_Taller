import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { login } from './helpers';

const URL_SB = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;

const tokenDe = (page: Page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /^sb-.*-auth-token$/.test(x))!;
  return JSON.parse(localStorage.getItem(k)!).access_token as string;
});
const cabeceras = (token: string) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
const leer = async (r: APIRequestContext, token: string, ruta: string) => {
  const res = await r.get(`${URL_SB}/rest/v1/${ruta}`, { headers: cabeceras(token) });
  return { status: res.status(), filas: (await res.json()) as unknown[] };
};
const rpc = async (r: APIRequestContext, token: string, fn: string, body: object = {}) => {
  const res = await r.post(`${URL_SB}/rest/v1/rpc/${fn}`, { headers: cabeceras(token), data: body });
  return { status: res.status(), datos: await res.json() };
};

// Prueba OPCIONAL de los permisos por módulo, contra la base de datos real. Crea un usuario temporal
// con solo el módulo Taller en el taller de pruebas, comprueba qué puede leer y escribir (por la
// pantalla y llamando directamente a la API) y lo borra al terminar. Como crea y borra un usuario de
// verdad, solo se ejecuta si se pide: E2E_PERMISOS=1 npx playwright test e2e/permisos-modulos.spec.ts
test('un usuario con solo Taller no puede leer lo de otros módulos (comprobado contra la API real)', async ({ page, browser, request }) => {
  test.skip(!process.env.E2E_PERMISOS, 'Opcional: crea y borra un usuario real. Ejecutar con E2E_PERMISOS=1.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const tokenAdmin = await tokenDe(page);

  // Crear el usuario de prueba con la función de administración (contraseña aleatoria, nunca se muestra).
  const sufijo = randomBytes(4).toString('hex');
  const email = `zz-modulos-${sufijo}@tallerejemplo.test`;
  const password = `Aa1-${randomBytes(12).toString('base64url')}`;
  const crear = await request.post(`${URL_SB}/functions/v1/admin-users`, {
    headers: cabeceras(tokenAdmin), data: { action: 'create', email, password, nombre: 'ZZ Prueba Módulos', rol: 'usuario', modulos: ['taller'], activo: true },
  });
  expect(crear.status(), 'crear usuario').toBe(200);
  const idUsuario = (await crear.json()).perfil.id as string;

  try {
    // Referencia: el administrador sí ve todo.
    for (const t of ['facturas', 'citas', 'alertas', 'notificaciones_cliente', 'interacciones_cliente', 'movimientos_stock']) {
      expect((await leer(request, tokenAdmin, `${t}?select=id`)).filas.length, `el admin debería ver ${t}`).toBeGreaterThan(0);
    }

    // Entrar como el usuario de solo Taller.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p2 = await ctx.newPage();
    const errores: string[] = [];
    p2.on('pageerror', (e) => errores.push(e.message));
    await p2.goto(process.env.E2E_BASE_URL ?? 'http://localhost:3100');
    await p2.getByPlaceholder('usuario@empresa.net').fill(email);
    await p2.getByPlaceholder('••••••••').fill(password);
    await p2.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(p2.getByRole('button', { name: 'Taller', exact: true })).toBeVisible({ timeout: 20_000 });
    const boton = (n: string) => p2.locator(`button[title="${n}"], button[aria-label="${n}"]`);
    for (const n of ['Inicio', 'Taller']) await expect(boton(n).first()).toBeVisible();
    for (const n of ['Facturas', 'Agenda', 'Alertas', 'Rentabilidad', 'Inventario', 'Clientes', 'Vehículos']) await expect(boton(n), `no debería ver la pestaña ${n}`).toHaveCount(0);

    // La pantalla de Inicio y el Taller funcionan, sin avisos de error.
    await p2.waitForTimeout(2500);
    await expect(p2.getByRole('alert')).toHaveCount(0);
    await boton('Taller').first().click();
    await expect(p2.getByRole('heading', { name: 'Órdenes de Trabajo' })).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('table tbody tr, div[draggable="true"]').first()).toBeVisible({ timeout: 15_000 });

    // Llamadas directas a la API con SU sesión.
    const token = await tokenDe(p2);
    for (const t of ['facturas', 'lineas_factura', 'factura_ot', 'registros_facturacion', 'citas', 'alertas', 'notificaciones_cliente', 'interacciones_cliente', 'movimientos_stock']) {
      const r = await leer(request, token, `${t}?select=*`);
      expect(r.status, t).toBe(200);
      expect(r.filas, `${t} debe salir vacío`).toEqual([]);
    }
    for (const t of ['clientes', 'vehiculos', 'ordenes_trabajo', 'productos']) {
      expect((await leer(request, token, `${t}?select=id&limit=1`)).filas.length, `${t} (datos compartidos) debe verse`).toBe(1);
    }
    expect((await rpc(request, token, 'rentabilidad_estado_actual')).datos).toEqual([]);
    expect((await rpc(request, token, 'rentabilidad_top_clientes', { p_limit: 5 })).datos).toEqual([]);
    const resumen = (await rpc(request, token, 'facturas_resumen')).datos[0];
    expect(Number(resumen.total_facturas)).toBe(0);
    // Escribir tampoco: crear una cita directamente.
    const cita = await request.post(`${URL_SB}/rest/v1/citas`, { headers: { ...cabeceras(token), Prefer: 'return=minimal' }, data: { fecha_hora: new Date().toISOString(), motivo: 'intruso', contacto_nombre: 'Intruso' } });
    expect(cita.status(), 'crear una cita sin el módulo').toBeGreaterThanOrEqual(400);

    // Funciones del servidor.
    const aeat = await request.post(`${URL_SB}/functions/v1/verifactu-enviar`, { headers: cabeceras(token), data: { dryRun: true } });
    expect(aeat.status()).toBe(403);
    expect((await aeat.json()).error).toContain('módulo Facturas');
    const aviso = await request.post(`${URL_SB}/functions/v1/enviar-recordatorios`, { headers: cabeceras(token), data: { action: 'forzar', alertaId: 'no-importa' } });
    expect(aviso.status()).toBe(403);
    expect((await aviso.json()).error).toContain('módulo Alertas');

    expect(errores, errores.join('\n')).toEqual([]);
    await ctx.close();
  } finally {
    const borrar = await request.post(`${URL_SB}/functions/v1/admin-users`, { headers: cabeceras(tokenAdmin), data: { action: 'delete', id: idUsuario } });
    console.log('BORRADO', borrar.status());
  }
});
