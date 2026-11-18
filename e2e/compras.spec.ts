import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { login } from './helpers';

// Compras y proveedores. Entra con el administrador del taller de pruebas (datos reales de solo lectura) y SUSTITUYE las
// lecturas y escrituras de compras y proveedores por datos de mentira: así se comprueba toda la pantalla (estados, avisos,
// lo enviado al guardar, la exportación para la gestoría) sin dejar compras ni proveedores en la base de pruebas. Las reglas
// de la base (totales, stock, duplicados, anulación, permisos) se prueban aparte, dentro de una transacción que se deshace.

const hoy = new Date();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const cors = { 'access-control-allow-origin': '*' };

const PROV = { id: 'pv1', nombre: 'Recambios Ruiz', nif: 'B12345678', telefono: null, correo: null, contacto: null, direccion: null, dias_pago: 30, notas: null, activo: true };
const compra = (id: string, numero: string, fecha: string, estado: string, total: number, venc: string | null) => ({
  id, proveedor_id: 'pv1', numero, fecha, fecha_vencimiento: venc, estado, fecha_pago: estado === 'pagada' ? fecha : null,
  base: Math.round(total / 1.21 * 100) / 100, iva: Math.round((total - total / 1.21) * 100) / 100, total, notas: null, proveedores: { nombre: 'Recambios Ruiz' },
});
const LISTA = [
  compra('c1', 'F-100', iso(hoy), 'pendiente', 121, dias(20)),
  compra('c2', 'F-101', iso(hoy), 'pendiente', 242, dias(-5)),       // vencida
  compra('c3', 'F-102', iso(hoy), 'pagada', 60.5, null),
  compra('c4', 'F-103', iso(hoy), 'anulada', 999, null),
];

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
}

async function simular(page: Page, extra: { rpc?: (nombre: string, cuerpo: Record<string, unknown>) => unknown } = {}) {
  const rpcs: { nombre: string; cuerpo: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/proveedores(\?|$)/, async (route) => {
    if (route.request().method() === 'GET') return json(route, [PROV]);
    return route.fallback();
  });
  await page.route(/\/rest\/v1\/compras\?/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    if (/proveedores%20%28%20nombre%2C%20nif|compra_lineas/.test(decodeURIComponent(url)) || /compra_lineas/.test(url)) return route.fallback();
    if (/id=eq\./.test(url)) return json(route, LISTA.find((c) => url.includes(`id=eq.${c.id}`)) ?? LISTA[0]);
    return json(route, LISTA);
  });
  await page.route(/\/rest\/v1\/compra_lineas\?/, async (route) => json(route, [
    { id: 'l1', producto_id: null, descripcion: 'Pastillas', cantidad: 1, precio_unitario: 100, iva_pct: 21, subtotal: 100, posicion: 0 },
  ]));
  await page.route(/\/rest\/v1\/rpc\/(guardar_compra|marcar_pago_compra|anular_compra|editar_datos_compra)/, async (route) => {
    const nombre = route.request().url().split('/rpc/')[1].split('?')[0];
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    rpcs.push({ nombre, cuerpo });
    const r = extra.rpc?.(nombre, cuerpo);
    if (r && typeof r === 'object' && 'error' in (r as object)) return json(route, { message: (r as { error: string }).error, code: 'P0001' }, 400);
    return json(route, nombre === 'guardar_compra' ? 'nueva-compra' : null);
  });
  return rpcs;
}

async function irACompras(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Compras', exact: true }).click();
  await expect(page.getByTestId('compras-tab')).toBeVisible();
}

test('compras (solo lectura real): la pestaña carga, cambia entre compras y proveedores y valida antes de guardar', async ({ page }) => {
  await irACompras(page);
  await expect(page.getByTestId('resumen-compras')).toBeVisible();
  await page.getByRole('tab', { name: 'Proveedores' }).click();
  await expect(page.getByTestId('panel-proveedores')).toBeVisible();
  await page.getByRole('tab', { name: 'Compras' }).click();
  await page.getByTestId('nueva-compra').click();
  await expect(page.getByTestId('compra-form')).toBeVisible();
  await page.getByTestId('guardar-compra').click();
  await expect(page.getByTestId('error-compra')).toHaveText('Elige el proveedor.');           // se valida en pantalla: no se envía nada
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('compra-form')).toHaveCount(0);
});

test('compras (datos de mentira): resumen de lo que se debe, vencidas y filtros', async ({ page }) => {
  await simular(page);
  await irACompras(page);
  await expect(page.getByTestId('fila-compra')).toHaveCount(4);
  await expect(page.getByTestId('total-pendiente')).toHaveText('363,00 €');                   // 121 + 242 (las pagadas y anuladas no se deben)
  await expect(page.getByTestId('total-vencido')).toHaveText('242,00 €');
  await expect(page.getByTestId('fila-compra').filter({ hasText: 'F-101' })).toContainText('Vencida');
  await expect(page.getByTestId('fila-compra').filter({ hasText: 'F-100' })).toContainText('Pendiente');
  await expect(page.getByTestId('fila-compra').filter({ hasText: 'F-103' })).toContainText('Anulada');
  await page.getByLabel('Estado', { exact: true }).selectOption('vencida');
  await expect(page.getByTestId('fila-compra')).toHaveCount(1);
  await page.getByLabel('Estado', { exact: true }).selectOption('todas');
  await page.getByLabel('Buscar compra').fill('F-102');
  await expect(page.getByTestId('fila-compra')).toHaveCount(1);
});

test('compras (datos de mentira): al guardar se envía lo elegido, con el vencimiento propuesto y las líneas bien calculadas', async ({ page }) => {
  const rpcs = await simular(page);
  await irACompras(page);
  await page.getByTestId('nueva-compra').click();
  await page.getByLabel('Proveedor *').selectOption('pv1');
  await expect(page.getByLabel('Vencimiento')).toHaveValue(dias(30));                          // fecha de hoy + los 30 días de pago del proveedor
  await page.getByLabel('Número de factura del proveedor').fill('  F-777 ');
  await page.getByLabel('Descripción de la línea 1').fill('Pastillas');
  await page.getByLabel('Cantidad de la línea 1').fill('3');
  await page.getByLabel('Precio de la línea 1').fill('4,00');
  await page.getByTestId('compra-anadir-linea').click();
  await page.getByLabel('Descripción de la línea 2').fill('Grúa');
  await page.getByLabel('Precio de la línea 2').fill('100');
  await page.getByLabel('IVA de la línea 2').selectOption('10');
  await expect(page.getByTestId('compra-totales')).toContainText('124,52 €');
  await page.getByTestId('guardar-compra').click();
  await expect(page.getByTestId('compra-form')).toHaveCount(0, { timeout: 10_000 });
  const envio = rpcs.find((r) => r.nombre === 'guardar_compra')!;
  expect(envio.cuerpo).toMatchObject({ p_proveedor_id: 'pv1', p_numero: 'F-777', p_vencimiento: dias(30), p_pagada: false, p_actualizar_coste: false });
  expect(envio.cuerpo.p_lineas).toEqual([
    { producto_id: null, descripcion: 'Pastillas', cantidad: 3, precio_unitario: 4, iva_pct: 21 },
    { producto_id: null, descripcion: 'Grúa', cantidad: 1, precio_unitario: 100, iva_pct: 10 },
  ]);
});

test('compras (datos de mentira): si el servidor rechaza el guardado, el motivo sale junto al botón y la ventana sigue abierta', async ({ page }) => {
  await simular(page, { rpc: (n) => (n === 'guardar_compra' ? { error: 'Ya has registrado la factura F-100 de Recambios Ruiz.' } : null) });
  await irACompras(page);
  await page.getByTestId('nueva-compra').click();
  await page.getByLabel('Proveedor *').selectOption('pv1');
  await page.getByLabel('Número de factura del proveedor').fill('F-100');
  await page.getByLabel('Descripción de la línea 1').fill('x');
  await page.getByLabel('Precio de la línea 1').fill('1');
  await page.getByTestId('guardar-compra').click();
  await expect(page.getByTestId('error-compra')).toContainText('Ya has registrado la factura F-100');
  await expect(page.getByTestId('compra-form')).toBeVisible();
  await expect(page.getByLabel('Número de factura del proveedor')).toHaveValue('F-100');       // no se pierde lo escrito
});

test('compras (datos de mentira): detalle con líneas, marcar pagada y anular piden confirmación y llaman a la acción correcta', async ({ page }) => {
  const rpcs = await simular(page);
  await irACompras(page);
  await page.getByRole('button', { name: 'Ver la compra F-100' }).click();
  await expect(page.getByTestId('compra-detalle')).toContainText('Pastillas');
  await page.getByTestId('marcar-pagada').click();
  await expect.poll(() => rpcs.find((r) => r.nombre === 'marcar_pago_compra')?.cuerpo).toMatchObject({ p_id: 'c1', p_fecha_pago: iso(hoy) });
  await page.getByTestId('anular-compra').click();
  await expect(page.getByRole('dialog', { name: /anular/i }).or(page.getByText('¿Anular la compra F-100'))).toBeVisible();
  expect(rpcs.some((r) => r.nombre === 'anular_compra')).toBe(false);                           // aún no: pide confirmación
  await page.getByRole('button', { name: 'Anular compra' }).last().click();
  await expect.poll(() => rpcs.find((r) => r.nombre === 'anular_compra')?.cuerpo).toMatchObject({ p_id: 'c1' });
});

test('gestoría con compras (datos de mentira): resumen de IVA soportado y archivos con las facturas recibidas', async ({ page }) => {
  await simular(page);
  const R = (numero: string, fecha: string, estado: string, subtotal: number, iva: number, nif: string | null) => ({
    numero, fecha, estado, subtotal, iva_pct: iva, total_iva: Math.round(subtotal * iva) / 100, total: Math.round(subtotal * (100 + iva)) / 100,
    cliente_id: 'c1', cliente_nombre_snapshot: 'Ana', cliente_apellidos_snapshot: 'García', cliente_nif_snapshot: nif,
  });
  await page.route(/\/rest\/v1\/facturas\?.*cliente_nif_snapshot/, (route) => json(route, [R('FAC-2026-0001', '2026-07-02', 'pagada', 1000, 21, '12345678Z')]));
  await page.route(/\/rest\/v1\/compras\?.*compra_lineas/, (route) => json(route, [
    { numero: 'F-1', fecha: '2026-07-05', estado: 'pagada', total: 242, proveedores: { nombre: 'Recambios Ruiz', nif: 'B12345678' }, compra_lineas: [{ subtotal: 200, iva_pct: 21 }] },
    { numero: 'F-2', fecha: '2026-07-20', estado: 'pendiente', total: 110, proveedores: { nombre: 'Grúas Paco', nif: null }, compra_lineas: [{ subtotal: 100, iva_pct: 10 }] },
    { numero: 'F-3', fecha: '2026-07-21', estado: 'anulada', total: 999, proveedores: { nombre: 'Recambios Ruiz', nif: 'B12345678' }, compra_lineas: [{ subtotal: 825.62, iva_pct: 21 }] },
  ]));
  await irACompras(page);
  await page.getByTestId('compras-exportar-gestoria').click();
  await page.getByTestId('exportar-gestoria').getByLabel('Año', { exact: true }).selectOption('2026');
  await page.getByTestId('exportar-gestoria').getByLabel('Trimestre', { exact: true }).selectOption('3');
  await expect(page.getByTestId('bloque-recibidas')).toContainText('2 facturas', { timeout: 15_000 });
  await expect(page.getByTestId('bloque-recibidas')).toContainText('300,00 €');                 // base sin la anulada: 200 + 100
  await expect(page.getByTestId('bloque-emitidas')).toContainText('1 factura');
  await expect(page.getByTestId('avisos-recibidas')).toContainText('Proveedores sin NIF: Grúas Paco');
  await expect(page.getByTestId('diferencia-iva')).toContainText('158,00 €');                   // repercutido 210 − soportado 42 − 10 = 158
  const dx = page.waitForEvent('download');
  await page.getByTestId('descargar-excel').click();
  const utf = (await readFile((await (await dx).path())!)).toString('utf8');
  expect(utf).toContain('Facturas recibidas');
  expect(utf).toContain('IVA soportado (facturas recibidas)');
  expect(utf).toContain('Repercutido − soportado');
  const dc = page.waitForEvent('download');
  await page.getByTestId('descargar-csv-recibidas').click();
  const d = await dc;
  expect(d.suggestedFilename()).toContain('gestoria_recibidas_2026-T3');
  const csv = await readFile((await d.path())!, 'utf8');
  expect(csv).toContain('"F-1";"05/07/2026";"Recambios Ruiz";"B12345678";"200,00";"21";"42,00";"242,00";"Pagada"');
  expect(csv).toContain('"TOTAL (sin anuladas)";"";"";"";"300,00";"";"52,00";"352,00";""');
});
