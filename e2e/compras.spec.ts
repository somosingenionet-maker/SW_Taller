import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { login, irA } from './helpers';

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

async function simular(page: Page, extra: { rpc?: (nombre: string, cuerpo: Record<string, unknown>) => unknown; lista?: typeof LISTA } = {}) {
  const lista = extra.lista ?? LISTA;
  const rpcs: { nombre: string; cuerpo: Record<string, unknown> }[] = [];
  await page.route(/\/rest\/v1\/proveedores(\?|$)/, async (route) => {
    if (route.request().method() === 'GET') return json(route, [PROV]);
    return route.fallback();
  });
  await page.route(/\/rest\/v1\/compras\?/, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const url = route.request().url();
    if (/proveedores%20%28%20nombre%2C%20nif|compra_lineas/.test(decodeURIComponent(url)) || /compra_lineas/.test(url)) return route.fallback();
    if (/id=eq\./.test(url)) return json(route, lista.find((c) => url.includes(`id=eq.${c.id}`)) ?? lista[0]);
    const estado = /estado=eq\.(\w+)/.exec(url)?.[1];                              // el servidor filtra por estado: la simulación también
    return json(route, estado ? lista.filter((c) => c.estado === estado) : lista);
  });
  await page.route(/\/rest\/v1\/compra_lineas\?/, async (route) => json(route, [
    { id: 'l1', producto_id: null, descripcion: 'Pastillas', cantidad: 1, precio_unitario: 100, iva_pct: 21, subtotal: 100, posicion: 0 },
  ]));
  await page.route(/\/rest\/v1\/rpc\/(guardar_compra|marcar_pago_compra|anular_compra|editar_datos_compra|registrar_adjunto_compra|borrar_adjunto_compra|marcar_pago_compras)/, async (route) => {
    const nombre = route.request().url().split('/rpc/')[1].split('?')[0];
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    rpcs.push({ nombre, cuerpo });
    const r = extra.rpc?.(nombre, cuerpo);
    if (r && typeof r === 'object' && 'error' in (r as object)) return json(route, { message: (r as { error: string }).error, code: 'P0001' }, 400);
    return json(route, nombre === 'guardar_compra' ? 'nueva-compra' : nombre === 'registrar_adjunto_compra' ? 'adj-nuevo' : nombre === 'borrar_adjunto_compra' ? 'emp/c1/vieja.pdf' : nombre === 'marcar_pago_compras' ? (cuerpo.p_ids as string[]).length : null);
  });
  return rpcs;
}

async function irACompras(page: Page) {
  await login(page);
  await irA(page, 'Compras');
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

// ---- Adjuntar la factura del proveedor (almacenamiento y lista simulados) ----

const ADJUNTO = { id: 'a1', compra_id: 'c1', ruta: 'emp/c1/vieja.pdf', nombre: 'Factura vieja.pdf', tipo: 'application/pdf', tamano: 345678, created_at: '2026-11-10T10:00:00Z' };
const PDF = Buffer.from('%PDF-1.4\n%%EOF');

async function simularAlmacen(page: Page, opciones: { subidaFalla?: boolean } = {}) {
  const subidas: string[] = [];
  const borrados: string[] = [];
  let firmas = 0;
  await page.route(/\/storage\/v1\/object\/facturas-proveedor\/.+/, async (route) => {
    if (route.request().method() === 'POST') {
      if (opciones.subidaFalla) return json(route, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' }, 403);
      subidas.push(decodeURIComponent(route.request().url().split('/object/facturas-proveedor/')[1]));
      return json(route, { Key: 'ok', Id: 'x' });
    }
    return route.fallback();
  });
  await page.route(/\/storage\/v1\/object\/sign\/facturas-proveedor\/.+/, async (route) => {
    firmas++;
    return json(route, { signedURL: '/object/sign/facturas-proveedor/emp/c1/vieja.pdf?token=firmado' });
  });
  await page.route(/\/storage\/v1\/object\/facturas-proveedor$/, async (route) => {
    if (route.request().method() === 'DELETE') { borrados.push(...((route.request().postDataJSON() as { prefixes: string[] }).prefixes)); return json(route, []); }
    return route.fallback();
  });
  return { subidas, borrados, firmas: () => firmas };
}

test('adjuntos (almacén de mentira): al guardar sube cada archivo a la carpeta de la compra y lo da de alta con su nombre', async ({ page }) => {
  const rpcs = await simular(page);
  const almacen = await simularAlmacen(page);
  await irACompras(page);
  await page.getByTestId('nueva-compra').click();
  await page.getByLabel('Proveedor *').selectOption('pv1');
  await page.getByLabel('Número de factura del proveedor').fill('F-900');
  await page.getByLabel('Descripción de la línea 1').fill('x');
  await page.getByLabel('Precio de la línea 1').fill('5');
  // Un formato que no es factura se rechaza al elegirlo, antes de subir nada
  await page.getByTestId('compra-archivo').setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await expect(page.getByTestId('error-archivos')).toContainText('no se puede adjuntar');
  await expect(page.getByTestId('compra-archivo-elegido')).toHaveCount(0);
  await page.getByTestId('compra-archivo').setInputFiles({ name: 'factura-ruiz.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.getByTestId('compra-archivo-elegido')).toContainText('factura-ruiz.pdf');
  await expect(page.getByTestId('error-archivos')).toHaveCount(0);
  await page.getByTestId('guardar-compra').click();
  await expect(page.getByTestId('compra-form')).toHaveCount(0, { timeout: 10_000 });
  expect(almacen.subidas).toHaveLength(1);
  expect(almacen.subidas[0]).toMatch(/^[^/]+\/nueva-compra\/[0-9a-f-]{36}\.pdf$/);          // «<empresa>/<compra>/<uuid>.pdf»
  const alta = rpcs.find((r) => r.nombre === 'registrar_adjunto_compra')!;
  expect(alta.cuerpo).toMatchObject({ p_compra_id: 'nueva-compra', p_nombre: 'factura-ruiz.pdf' });
  expect(alta.cuerpo.p_ruta).toBe(almacen.subidas[0]);
});

test('adjuntos (almacén de mentira): si falla la subida, la compra sí queda guardada y se avisa de qué archivo hay que repetir', async ({ page }) => {
  const rpcs = await simular(page);
  await simularAlmacen(page, { subidaFalla: true });
  await irACompras(page);
  await page.getByTestId('nueva-compra').click();
  await page.getByLabel('Proveedor *').selectOption('pv1');
  await page.getByLabel('Número de factura del proveedor').fill('F-901');
  await page.getByLabel('Descripción de la línea 1').fill('x');
  await page.getByLabel('Precio de la línea 1').fill('5');
  await page.getByTestId('compra-archivo').setInputFiles({ name: 'factura.pdf', mimeType: 'application/pdf', buffer: PDF });
  await page.getByTestId('guardar-compra').click();
  await expect(page.getByTestId('compra-form')).toHaveCount(0, { timeout: 10_000 });
  expect(rpcs.some((r) => r.nombre === 'guardar_compra')).toBe(true);
  expect(rpcs.some((r) => r.nombre === 'registrar_adjunto_compra')).toBe(false);                 // sin archivo subido no hay alta en la lista
  await expect(page.getByText(/La compra se guardó, pero/)).toBeVisible();
  await expect(page.getByText(/factura\.pdf/).first()).toBeVisible();
});

test('adjuntos (almacén de mentira): el detalle lista los archivos, abre uno con enlace que caduca y permite quitarlo', async ({ page }) => {
  const rpcs = await simular(page);
  const almacen = await simularAlmacen(page);
  let lista = [ADJUNTO];
  await page.route(/\/rest\/v1\/compra_adjuntos\?/, (route) => json(route, lista));
  await page.route(/\/rest\/v1\/rpc\/borrar_adjunto_compra/, async (route) => { lista = []; rpcs.push({ nombre: 'borrar_adjunto_compra', cuerpo: route.request().postDataJSON() }); return json(route, ADJUNTO.ruta); });
  await irACompras(page);
  await page.getByRole('button', { name: 'Ver la compra F-100' }).click();
  const fila = page.getByTestId('adjunto');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText('Factura vieja.pdf');
  await expect(fila).toContainText('338 KB');
  const pedido = page.context().waitForEvent('request', { predicate: (r) => r.url().includes('token=firmado') });
  await fila.getByRole('button', { name: 'Factura vieja.pdf', exact: true }).click();
  expect((await pedido).url()).toContain('/object/sign/facturas-proveedor/emp/c1/vieja.pdf?token=firmado');
  expect(almacen.firmas()).toBe(1);
  await page.getByRole('button', { name: 'Quitar Factura vieja.pdf' }).click();
  await page.getByRole('button', { name: 'Quitar', exact: true }).last().click();
  await expect(page.getByTestId('adjunto')).toHaveCount(0);
  expect(rpcs.find((r) => r.nombre === 'borrar_adjunto_compra')!.cuerpo).toMatchObject({ p_id: 'a1' });
  await expect.poll(() => almacen.borrados).toEqual(['emp/c1/vieja.pdf']);                         // y el archivo se borra del almacén
});

test('adjuntos (almacén de mentira): una compra anulada conserva sus archivos y no deja añadir ni quitar', async ({ page }) => {
  await simular(page);
  await simularAlmacen(page);
  await page.route(/\/rest\/v1\/compra_adjuntos\?/, (route) => json(route, [{ ...ADJUNTO, compra_id: 'c4' }]));
  await irACompras(page);
  await page.getByRole('button', { name: 'Ver la compra F-103' }).click();
  await expect(page.getByTestId('adjunto')).toHaveCount(1);
  await expect(page.getByTestId('adjuntar-archivo')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Quitar / })).toHaveCount(0);
});

// ---- ZIP de documentos para la gestoría (almacén simulado) ----

function leerZip(bytes: Buffer): Record<string, Buffer> {
  const fin = bytes.length - 22;
  expect(bytes.readUInt32LE(fin)).toBe(0x06054b50);
  const n = bytes.readUInt16LE(fin + 10);
  let pos = bytes.readUInt32LE(fin + 16);
  const out: Record<string, Buffer> = {};
  for (let i = 0; i < n; i++) {
    const tam = bytes.readUInt32LE(pos + 20), ln = bytes.readUInt16LE(pos + 28), desp = bytes.readUInt32LE(pos + 42);
    const nombre = bytes.subarray(pos + 46, pos + 46 + ln).toString('utf8');
    const lnLocal = bytes.readUInt16LE(desp + 26);
    out[nombre] = bytes.subarray(desp + 30 + lnLocal, desp + 30 + lnLocal + tam);
    pos += 46 + ln;
  }
  return out;
}

test('gestoría con compras (almacén de mentira): el ZIP lleva los documentos con su nombre, el índice, el LEEME y avisa de lo que falta o falló', async ({ page }) => {
  await simular(page);
  await page.route(/\/rest\/v1\/facturas\?.*cliente_nif_snapshot/, (route) => json(route, []));
  const adj = (ruta: string, nombre: string, tipo = 'application/pdf') => ({ ruta, nombre, tipo, tamano: 2048 });
  await page.route(/\/rest\/v1\/compras\?.*compra_lineas/, (route) => json(route, [
    { numero: 'F-1', fecha: '2026-07-05', estado: 'pagada', total: 242, proveedores: { nombre: 'Recambios Ruiz, S.L.', nif: 'B12345678' }, compra_lineas: [{ subtotal: 200, iva_pct: 21 }],
      compra_adjuntos: [adj('emp/c1/a.pdf', 'factura ñandú.pdf'), adj('emp/c1/b.jpg', 'reverso', 'image/jpeg')] },
    { numero: 'F-2', fecha: '2026-07-20', estado: 'pendiente', total: 110, proveedores: { nombre: 'Grúas Paco', nif: null }, compra_lineas: [{ subtotal: 100, iva_pct: 10 }],
      compra_adjuntos: [adj('emp/c2/rota.pdf', 'se pierde.pdf')] },
    { numero: 'F-3', fecha: '2026-07-21', estado: 'pendiente', total: 121, proveedores: { nombre: 'Grúas Paco', nif: null }, compra_lineas: [{ subtotal: 100, iva_pct: 21 }], compra_adjuntos: [] },
    { numero: 'F-4', fecha: '2026-07-22', estado: 'anulada', total: 121, proveedores: { nombre: 'Recambios Ruiz, S.L.', nif: 'B12345678' }, compra_lineas: [{ subtotal: 100, iva_pct: 21 }], compra_adjuntos: [adj('emp/c4/x.pdf', 'anulada.pdf')] },
  ]));
  const firmadas: string[][] = [];
  await page.route(/\/storage\/v1\/object\/sign\/facturas-proveedor$/, async (route) => {
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    firmadas.push(paths);
    return json(route, paths.map((path) => ({ path, error: null, signedURL: `/object/sign/facturas-proveedor/${path}?token=t` })));
  });
  await page.route(/\/storage\/v1\/object\/sign\/facturas-proveedor\/.+\?token=t$/, async (route) => {
    const ruta = route.request().url().split('/facturas-proveedor/')[1].split('?')[0];
    if (ruta.endsWith('rota.pdf')) return route.fulfill({ status: 500, headers: cors, body: 'boom' });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body: Buffer.from(`contenido de ${ruta}`) });
  });
  await irACompras(page);
  await page.getByTestId('compras-exportar-gestoria').click();
  await page.getByTestId('exportar-gestoria').getByLabel('Año', { exact: true }).selectOption('2026');
  await page.getByTestId('exportar-gestoria').getByLabel('Trimestre', { exact: true }).selectOption('3');
  await expect(page.getByTestId('resumen-documentos')).toContainText('3 archivos de 2 facturas', { timeout: 15_000 });  // la anulada no cuenta
  await expect(page.getByTestId('sin-documento')).toContainText('Grúas Paco F-3');
  const dl = page.waitForEvent('download');
  await page.getByTestId('descargar-documentos').click();
  const d = await dl;
  expect(d.suggestedFilename()).toMatch(/^doonty_facturas_recibidas_2026-T3_.*\.zip$/);
  const z = leerZip(await readFile((await d.path())!));
  expect(Object.keys(z).sort()).toEqual(['2026-07-05_Recambios-Ruiz-S-L_F-1_1.pdf', '2026-07-05_Recambios-Ruiz-S-L_F-1_2.jpg', 'LEEME.txt', 'indice.csv']);
  expect(z['2026-07-05_Recambios-Ruiz-S-L_F-1_1.pdf'].toString()).toBe('contenido de emp/c1/a.pdf');   // el contenido es el del archivo, byte a byte
  expect(firmadas.flat().sort()).toEqual(['emp/c1/a.pdf', 'emp/c1/b.jpg', 'emp/c2/rota.pdf']);          // la anulada ni se pide
  const indice = z['indice.csv'].toString('utf8');
  expect(indice).toContain('"2026-07-05_Recambios-Ruiz-S-L_F-1_1.pdf";"05/07/2026";"Recambios Ruiz, S.L.";"B12345678";"F-1";"242,00";"Pagada";"factura ñandú.pdf"');
  expect(indice).not.toContain('Grúas Paco');                                                           // el que falló no consta como incluido
  const leeme = z['LEEME.txt'].toString('utf8');
  expect(leeme).toContain('Archivos incluidos: 2');
  expect(leeme).toContain('Grúas Paco F-3');                                                            // sin documento
  expect(leeme).toContain('NO se pudieron incluir');
  expect(leeme).toContain('Gruas-Paco_F-2.pdf (error 500)');
  await expect(page.getByText(/ZIP descargado con 2 de 3 archivos/)).toBeVisible();
});

test('gestoría con compras (almacén de mentira): sin ningún documento se explica y no hay botón de ZIP', async ({ page }) => {
  await simular(page);
  await page.route(/\/rest\/v1\/facturas\?.*cliente_nif_snapshot/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/compras\?.*compra_lineas/, (route) => json(route, [
    { numero: 'F-1', fecha: '2026-07-05', estado: 'pagada', total: 242, proveedores: { nombre: 'Recambios Ruiz', nif: 'B12345678' }, compra_lineas: [{ subtotal: 200, iva_pct: 21 }], compra_adjuntos: [] },
  ]));
  await irACompras(page);
  await page.getByTestId('compras-exportar-gestoria').click();
  await page.getByTestId('exportar-gestoria').getByLabel('Año', { exact: true }).selectOption('2026');
  await page.getByTestId('exportar-gestoria').getByLabel('Trimestre', { exact: true }).selectOption('3');
  await expect(page.getByTestId('documentos-gestoria')).toContainText('Ninguna de estas facturas tiene el documento adjunto', { timeout: 15_000 });
  await expect(page.getByTestId('descargar-documentos')).toHaveCount(0);
});

// ---- Cuentas por pagar y avisos ----

const POR_PAGAR = [
  compra('p1', 'P-1', dias(-30), 'pendiente', 100, dias(-10)),     // vencida
  compra('p2', 'P-2', dias(-20), 'pendiente', 50.5, dias(-2)),     // vencida
  compra('p3', 'P-3', dias(-5), 'pendiente', 200, dias(3)),        // vence esta semana
  compra('p4', 'P-4', dias(-1), 'pendiente', 80, dias(40)),        // más adelante
  { ...compra('p5', 'P-5', dias(-1), 'pendiente', 10, null), proveedor_id: 'pv2', proveedores: { nombre: 'Grúas Paco' } },
  compra('p6', 'P-6', dias(-9), 'pagada', 999, null),
];

test('por pagar (datos de mentira): aviso en Inicio y contador en la barra llevan a la vista, agrupada por vencimiento', async ({ page }) => {
  await simular(page, { lista: POR_PAGAR });
  await login(page);
  const aviso = page.getByTestId('aviso-pagos-proveedores');
  await expect(aviso).toContainText('2 pagos a proveedores vencidos (150,50 €)', { timeout: 15_000 });
  await expect(aviso).toContainText('1 que vence esta semana (200,00 €)');
  await expect(page.getByTestId('contador-pagos')).toHaveText('3');
  await aviso.getByRole('button', { name: /Ver lo que debo/ }).click();
  await expect(page.getByTestId('por-pagar')).toBeVisible();
  await expect(page.getByTestId('resumen-por-pagar')).toContainText('440,50 € en 5 facturas');         // las pagadas no se deben
  await expect(page.getByTestId('resumen-por-pagar')).toContainText('150,50 € vencidos');
  for (const g of ['vencidas', 'semana', 'proximas', 'sinFecha']) await expect(page.getByTestId(`grupo-${g}`)).toBeVisible();
  await expect(page.getByTestId('grupo-vencidas').getByTestId('fila-por-pagar').first()).toContainText('P-1');   // la que lleva más tiempo vencida, arriba
  await expect(page.getByTestId('grupo-vencidas')).toContainText('Vencida hace 10 días');
  await expect(page.getByTestId('grupo-semana')).toContainText('Vence en 3 días');
  await expect(page.getByTestId('grupo-sinFecha')).toContainText('Sin fecha de vencimiento');
  await page.getByRole('button', { name: 'Por proveedor' }).click();
  await expect(page.getByTestId('grupo-proveedor')).toHaveCount(2);
  await expect(page.getByTestId('grupo-proveedor').first()).toContainText('Recambios Ruiz');             // el que más se le debe, primero
  await expect(page.getByTestId('grupo-proveedor').first()).toContainText('430,50 €');
});

test('por pagar (datos de mentira): marcar varias como pagadas envía todas juntas con la fecha elegida', async ({ page }) => {
  const rpcs = await simular(page, { lista: POR_PAGAR });
  await irACompras(page);
  await page.getByRole('tab', { name: /Por pagar/ }).click();
  await expect(page.getByTestId('por-pagar')).toBeVisible();
  await expect(page.getByTestId('barra-pago')).toHaveCount(0);                                           // sin selección no hay barra
  await page.getByRole('checkbox', { name: 'Elegir todas: Vencidas' }).check();
  await expect(page.getByTestId('barra-pago')).toContainText('2 seleccionadas · 150,50 €');
  await page.getByRole('checkbox', { name: 'Elegir la compra P-3 de Recambios Ruiz' }).check();
  await expect(page.getByTestId('barra-pago')).toContainText('3 seleccionadas · 350,50 €');
  await page.getByTestId('pagar-seleccion').click();
  const envio = await expect.poll(() => rpcs.find((r) => r.nombre === 'marcar_pago_compras')?.cuerpo).toMatchObject({ p_fecha_pago: iso(hoy) });
  void envio;
  const cuerpo = rpcs.find((r) => r.nombre === 'marcar_pago_compras')!.cuerpo;
  expect((cuerpo.p_ids as string[]).sort()).toEqual(['p1', 'p2', 'p3']);
  await expect(page.getByTestId('barra-pago')).toHaveCount(0);                                           // se limpia la selección
});

test('por pagar (datos de mentira): fecha anterior a la factura o rechazo del servidor se explican junto al botón y no se pierde la selección', async ({ page }) => {
  await simular(page, { lista: POR_PAGAR, rpc: (n) => (n === 'marcar_pago_compras' ? { error: 'Alguna de las compras ya no está pendiente o no existe: recarga la lista.' } : null) });
  await irACompras(page);
  await page.getByRole('tab', { name: /Por pagar/ }).click();
  await page.getByRole('checkbox', { name: 'Elegir la compra P-4 de Recambios Ruiz' }).check();       // factura de ayer
  await page.getByLabel('Fecha de pago').fill(dias(-5));
  await page.getByTestId('pagar-seleccion').click();
  await expect(page.getByTestId('error-pago')).toContainText('no puede ser anterior a la de la factura más reciente');
  await page.getByLabel('Fecha de pago').fill(iso(hoy));
  await page.getByTestId('pagar-seleccion').click();
  await expect(page.getByTestId('error-pago')).toContainText('ya no está pendiente');
  await expect(page.getByTestId('barra-pago')).toContainText('1 seleccionada');
});

test('por pagar (datos de mentira): sin deudas se dice y no hay aviso en Inicio', async ({ page }) => {
  await simular(page, { lista: [compra('z1', 'Z-1', dias(-3), 'pagada', 10, null)] });
  await login(page);
  await expect(page.getByTestId('aviso-pagos-proveedores')).toHaveCount(0);
  await expect(page.getByTestId('contador-pagos')).toHaveCount(0);
  await irA(page, 'Compras');
  await page.getByRole('tab', { name: /Por pagar/ }).click();
  await expect(page.getByTestId('nada-por-pagar')).toContainText('No debes nada a tus proveedores');
});
