import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  agruparPorEmpresa, avisoDebido, construirAvisoFotos, fechaEfectiva, huerfanos, planificar, rutasDeOrden,
  MAX_HUERFANOS_SOSPECHOSO, MAX_ORDENES_POR_EJECUCION, type OrdenConFotos,
} from './logic.ts';

const DIA = 86_400_000;
const AHORA = new Date('2026-12-01T04:00:00Z');
const en = (d: number) => new Date(AHORA.getTime() + d * DIA).toISOString();
const orden = (id: string, borrar: number, extra: Partial<OrdenConFotos> = {}): OrdenConFotos => ({
  orden_id: id, empresa_id: 'e1', numero: `OT-${id}`, inspeccion_id: null, borrar_en: en(borrar), fotos_recepcion: [], fotos_inspeccion: [], ...extra,
});

Deno.test('borra lo vencido, avisa de lo que vence en 30 días y deja el resto', () => {
  const r = planificar([orden('a', -5), orden('b', 10), orden('c', 31), orden('d', 30)], AHORA, null);
  assertEquals(r.borrar.map((o) => o.orden_id), ['a']);
  assertEquals(r.avisar.map((o) => o.orden_id), ['b', 'd']);
});

Deno.test('NADA se borra antes de la fecha mínima, y el aviso muestra la fecha efectiva', () => {
  const noAntes = en(20);
  const r = planificar([orden('vieja', -400), orden('nueva', 5)], AHORA, noAntes);
  assertEquals(r.borrar, []);
  assertEquals(r.avisar.map((o) => o.orden_id), ['vieja', 'nueva']);
  assertEquals(fechaEfectiva(en(-400), noAntes), new Date(noAntes).getTime());
  assertEquals(fechaEfectiva(en(50), noAntes), new Date(en(50)).getTime());
  // pasada la fecha mínima, lo vencido se borra
  assertEquals(planificar([orden('vieja', -400)], new Date(en(21)), noAntes).borrar.length, 1);
});

Deno.test('fechas ilegibles no se borran', () => {
  assertEquals(planificar([orden('x', 0, { borrar_en: 'no-es-fecha' })], AHORA, null).borrar, []);
  assertEquals(fechaEfectiva('no-es-fecha', null), null);
});

Deno.test('límite de órdenes por ejecución', () => {
  const muchas = Array.from({ length: MAX_ORDENES_POR_EJECUCION + 10 }, (_, i) => orden(String(i), -1));
  const r = planificar(muchas, AHORA, null);
  assertEquals(r.borrar.length, MAX_ORDENES_POR_EJECUCION);
  assertEquals(r.pendientesDeBorrar, MAX_ORDENES_POR_EJECUCION + 10);
});

Deno.test('aviso semanal: nunca avisado o hace 7 días o más', () => {
  assertEquals(avisoDebido(null, AHORA), true);
  assertEquals(avisoDebido(en(-7), AHORA), true);
  assertEquals(avisoDebido(en(-6), AHORA), false);
  assertEquals(avisoDebido('basura', AHORA), true);
});

Deno.test('agrupa por empresa', () => {
  const m = agruparPorEmpresa([orden('a', 1), orden('b', 1, { empresa_id: 'e2' }), orden('c', 1)]);
  assertEquals([...m.keys()], ['e1', 'e2']);
  assertEquals(m.get('e1')!.length, 2);
});

Deno.test('rutasDeOrden separa recepción (desde URL pública) e inspección; ignora URLs ajenas', () => {
  const o = orden('a', 1, { fotos_recepcion: ['https://x/public/fotos-recepcion/e1/a.jpg', 'https://otro/foto.jpg'], fotos_inspeccion: ['e1/i1/u.jpg'] });
  const r = rutasDeOrden(o, (u) => (u.includes('/public/fotos-recepcion/') ? u.split('/public/fotos-recepcion/')[1] : null));
  assertEquals(r, { recepcion: ['e1/a.jpg'], inspeccion: ['e1/i1/u.jpg'] });
});

Deno.test('huérfanos: solo los no referenciados y con más de 3 días', () => {
  const ref = new Set(['e1/usada.jpg']);
  const r = huerfanos([
    { ruta: 'e1/usada.jpg', creado: en(-100) },
    { ruta: 'e1/suelta-vieja.jpg', creado: en(-4) },
    { ruta: 'e1/suelta-reciente.jpg', creado: en(-1) },
    { ruta: 'e1/sin-fecha.jpg', creado: null },
    { ruta: 'e1/fecha-rara.jpg', creado: 'x' },
  ], ref, AHORA);
  assertEquals(r.borrar.map((a) => a.ruta), ['e1/suelta-vieja.jpg']);
  assertEquals(r.sospechoso, false);
});

Deno.test('huérfanos: si hay demasiados, algo falla y no se borra NINGUNO', () => {
  const muchos = Array.from({ length: MAX_HUERFANOS_SOSPECHOSO + 1 }, (_, i) => ({ ruta: `e/${i}.jpg`, creado: en(-30) }));
  const r = huerfanos(muchos, new Set(), AHORA);
  assertEquals(r.borrar, []);
  assertEquals(r.sospechoso, true);
});

Deno.test('el aviso lista las órdenes, la primera fecha y escapa el nombre del taller', () => {
  const t = (d: number) => new Date(AHORA.getTime() + d * DIA).getTime();
  const { asunto, html } = construirAvisoFotos('<Talleres> & Cía', [{ numero: 'OT-2', borrar_en: t(20) }, { numero: 'OT-1', borrar_en: t(5) }], 6);
  assertStringIncludes(asunto, '2 órdenes');
  assertStringIncludes(asunto, '6 de diciembre de 2026');
  assertStringIncludes(html, '6 meses');
  assertStringIncludes(html, 'Conservar fotos');
  assertEquals(html.indexOf('OT-1') < html.indexOf('OT-2'), true);
  assertStringIncludes(html, '&lt;Talleres&gt; &amp; Cía');
  assertEquals(html.includes('<Talleres>'), false);
  const una = construirAvisoFotos('T', [{ numero: 'OT-9', borrar_en: t(3) }], 12);
  assertStringIncludes(una.asunto, '1 orden ');
  const muchas = construirAvisoFotos('T', Array.from({ length: 13 }, (_, i) => ({ numero: `OT-${i}`, borrar_en: t(i + 1) })), 6);
  assertStringIncludes(muchas.html, '…y 3 más');
});
