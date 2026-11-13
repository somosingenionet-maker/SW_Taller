import { assertEquals } from 'jsr:@std/assert@1';
import {
  puedeMarcarTarea,
  debeIniciarReparacion,
  formatearOrdenesPortal,
  transicionMecanico,
  normalizarDuracion,
  textoDuracion,
  limpiarNota,
  ingresoDe,
  listoEnDe,
  notasDe,
  EVENTOS,
  esFiltro,
  normalizarEstadoFiltro,
  fechaValida,
  normalizarKm,
  type Tecnico,
} from './logic.ts';

function tecnico(overrides: Partial<Tecnico> = {}): Tecnico {
  return { id: 'tec-1', empresa_id: 'emp-1', nombre: 'Miguel Ángel', ...overrides };
}

// -------- puedeMarcarTarea --------
// Es el único control de acceso del portal público (no hay JWT de usuario):
// un fallo aquí es una fuga de datos entre talleres.
Deno.test('puedeMarcarTarea: permite cuando la OT es de su empresa y está asignada a él', () => {
  assertEquals(puedeMarcarTarea(tecnico(), { empresa_id: 'emp-1', tecnico_asignado: 'Miguel Ángel' }), true);
});

Deno.test('puedeMarcarTarea: rechaza una OT de OTRA empresa aunque el nombre del técnico coincida', () => {
  assertEquals(puedeMarcarTarea(tecnico(), { empresa_id: 'emp-2', tecnico_asignado: 'Miguel Ángel' }), false);
});

Deno.test('puedeMarcarTarea: rechaza una OT de su misma empresa pero asignada a OTRO técnico', () => {
  assertEquals(puedeMarcarTarea(tecnico(), { empresa_id: 'emp-1', tecnico_asignado: 'Otro Técnico' }), false);
});

Deno.test('puedeMarcarTarea: rechaza una OT sin técnico asignado', () => {
  assertEquals(puedeMarcarTarea(tecnico(), { empresa_id: 'emp-1', tecnico_asignado: null }), false);
});

// -------- debeIniciarReparacion --------
Deno.test('debeIniciarReparacion: avanza cuando se completa una tarea y la OT seguía en recibido', () => {
  assertEquals(debeIniciarReparacion('recibido', true), true);
});

Deno.test('debeIniciarReparacion: no avanza si la tarea se desmarca (completado=false)', () => {
  assertEquals(debeIniciarReparacion('recibido', false), false);
});

Deno.test('debeIniciarReparacion: no avanza si la OT ya estaba en otro estado (no pisa progreso manual)', () => {
  assertEquals(debeIniciarReparacion('en_reparacion', true), false);
  assertEquals(debeIniciarReparacion('listo', true), false);
});

// -------- formatearOrdenesPortal --------
Deno.test('formatearOrdenesPortal: agrupa cada tarea bajo su propia OT, no la de otro', () => {
  const ordenes = [
    { id: 'ot-1', numero: 'OT-1', vehiculo_id: 'v1', estado: 'recibido', descripcion_problema: 'Ruido' },
    { id: 'ot-2', numero: 'OT-2', vehiculo_id: 'v2', estado: 'en_reparacion', descripcion_problema: 'Frenos' },
  ];
  const vehiculos = [
    { id: 'v1', marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { id: 'v2', marca: 'Renault', modelo: 'Clio', matricula: '2222BBB' },
  ];
  const lineas = [
    { id: 'l1', ot_id: 'ot-1', descripcion: 'Cambiar pastillas', completado: false },
    { id: 'l2', ot_id: 'ot-2', descripcion: 'Revisar disco', completado: true },
  ];

  const resultado = formatearOrdenesPortal(ordenes, vehiculos, lineas);

  const ot1 = resultado.find((o) => o.id === 'ot-1')!;
  const ot2 = resultado.find((o) => o.id === 'ot-2')!;
  assertEquals(ot1.tareas.map((t) => t.id), ['l1']);
  assertEquals(ot2.tareas.map((t) => t.id), ['l2']);
  assertEquals(ot1.vehiculo, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' });
});

Deno.test('formatearOrdenesPortal: vehiculo es null si no se encuentra (no revienta)', () => {
  const resultado = formatearOrdenesPortal(
    [{ id: 'ot-1', numero: 'OT-1', vehiculo_id: 'v-inexistente', estado: 'recibido', descripcion_problema: '' }],
    [],
    []
  );
  assertEquals(resultado[0].vehiculo, null);
  assertEquals(resultado[0].tareas, []);
});

// -------- orden de la lista --------
Deno.test('formatearOrdenesPortal: en reparación, luego por empezar, luego listo; dentro, el que entró antes primero', () => {
  const ot = (id: string, estado: string) => ({ id, numero: id, vehiculo_id: 'v', estado, descripcion_problema: '', created_at: '2026-11-01T08:00:00Z' });
  const ordenes = [ot('listo-1', 'listo'), ot('rec-tarde', 'recibido'), ot('rep-tarde', 'en_reparacion'), ot('rec-pronto', 'recibido'), ot('rep-pronto', 'en_reparacion')];
  const ev = (ot_id: string, fecha: string) => ({ ot_id, fecha, descripcion: 'Vehículo recibido en taller' });
  const eventos = [
    ev('rec-tarde', '2026-11-10T12:27:00Z'), ev('rec-pronto', '2026-11-10T09:00:00Z'),
    ev('rep-tarde', '2026-11-11T10:00:00Z'), ev('rep-pronto', '2026-11-09T10:00:00Z'), ev('listo-1', '2026-11-01T10:00:00Z'),
  ];
  const r = formatearOrdenesPortal(ordenes, [], [], eventos, 'Ana');
  assertEquals(r.map((o) => o.id), ['rep-pronto', 'rep-tarde', 'rec-pronto', 'rec-tarde', 'listo-1']);
});

Deno.test('formatearOrdenesPortal: nunca devuelve precios, horas cobradas ni datos del cliente', () => {
  const r = formatearOrdenesPortal(
    [{ id: 'ot-1', numero: 'OT-1', vehiculo_id: 'v1', estado: 'recibido', descripcion_problema: 'x', cliente_id: 'c1', total: 500 } as never],
    [{ id: 'v1', marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA', bastidor: 'VIN' } as never],
    [{ id: 'l1', ot_id: 'ot-1', descripcion: 'Frenos', completado: true, duracion_min: 45, precio_unitario: 40, cantidad: 2, subtotal: 80 } as never],
  );
  const texto = JSON.stringify(r);
  for (const prohibido of ['cliente', 'total', 'precio', 'subtotal', 'cantidad', 'bastidor', 'VIN', '500', '80']) {
    assertEquals(texto.includes(prohibido), false, `no debe aparecer «${prohibido}»`);
  }
  assertEquals(r[0].tareas[0], { id: 'l1', descripcion: 'Frenos', completado: true, duracionMin: 45 });
});

// -------- ingresoDe / notasDe --------
Deno.test('ingresoDe: primer «recibido en taller» del historial (alta, presupuesto aprobado o desde cita); si no hay, la creación', () => {
  const o = { id: 'ot-1', created_at: '2026-11-01T08:00:00Z' };
  assertEquals(ingresoDe(o, [
    { ot_id: 'ot-1', fecha: '2026-11-05T10:00:00+00:00', descripcion: 'Presupuesto aprobado — vehículo recibido en taller' },
    { ot_id: 'ot-1', fecha: '2026-11-02T09:00:00+00:00', descripcion: 'Presupuesto creado' },
    { ot_id: 'ot-2', fecha: '2026-11-01T00:00:00+00:00', descripcion: 'Vehículo recibido en taller' },
  ]), '2026-11-05T10:00:00+00:00');
  assertEquals(ingresoDe(o, []), '2026-11-01T08:00:00Z');
});

Deno.test('notasDe: solo las notas de ESTE técnico y de ESTA orden, en orden', () => {
  const eventos = [
    { ot_id: 'ot-1', fecha: '2026-11-05T12:00:00Z', descripcion: 'Nota de Ana: falta la junta' },
    { ot_id: 'ot-1', fecha: '2026-11-05T10:00:00Z', descripcion: 'Nota de Ana: pedido el filtro' },
    { ot_id: 'ot-1', fecha: '2026-11-05T11:00:00Z', descripcion: 'Nota de Luis: otra cosa' },
    { ot_id: 'ot-2', fecha: '2026-11-05T11:00:00Z', descripcion: 'Nota de Ana: de otro coche' },
  ];
  assertEquals(notasDe('ot-1', 'Ana', eventos).map((n) => n.texto), ['pedido el filtro', 'falta la junta']);
});

// -------- transicionMecanico --------
Deno.test('transicionMecanico: solo los cambios que le tocan al mecánico', () => {
  assertEquals(transicionMecanico('recibido', 'empezar'), 'en_reparacion');
  assertEquals(transicionMecanico('en_reparacion', 'empezar'), null);
  assertEquals(transicionMecanico('en_reparacion', 'listo'), 'listo');
  assertEquals(transicionMecanico('recibido', 'listo'), 'listo');
  assertEquals(transicionMecanico('listo', 'reabrir'), 'en_reparacion');
  assertEquals(transicionMecanico('en_reparacion', 'reabrir'), null);
});

Deno.test('transicionMecanico: nunca toca presupuestos, entregadas ni canceladas', () => {
  for (const estado of ['presupuesto', 'entregado', 'cancelado', 'inventado']) {
    for (const accion of ['empezar', 'listo', 'reabrir'] as const) assertEquals(transicionMecanico(estado, accion), null);
  }
});

// -------- duración y notas --------
Deno.test('normalizarDuracion: entero entre 5 y 1440; vacío = sin anotar; lo demás se rechaza', () => {
  assertEquals(normalizarDuracion(45), { ok: true, minutos: 45 });
  assertEquals(normalizarDuracion('90'), { ok: true, minutos: 90 });
  assertEquals(normalizarDuracion(undefined), { ok: true, minutos: null });
  assertEquals(normalizarDuracion(null), { ok: true, minutos: null });
  for (const malo of [0, 4, 1441, 12.5, -30, 'abc', {}, true]) assertEquals(normalizarDuracion(malo), { ok: false });
});

Deno.test('textoDuracion', () => {
  assertEquals(textoDuracion(45), '45 min');
  assertEquals(textoDuracion(60), '1 h');
  assertEquals(textoDuracion(90), '1 h 30 min');
});

Deno.test('limpiarNota: recorta, une espacios y rechaza vacías, largas o que no son texto', () => {
  assertEquals(limpiarNota('  falta   la junta\n de culata '), 'falta la junta de culata');
  assertEquals(limpiarNota('   '), null);
  assertEquals(limpiarNota('x'.repeat(501)), null);
  assertEquals(limpiarNota('x'.repeat(500))?.length, 500);
  assertEquals(limpiarNota(42), null);
});

Deno.test('EVENTOS: textos del historial', () => {
  assertEquals(EVENTOS.tareaHecha('Ana', 'Cambiar pastillas', 45), 'Ana terminó «Cambiar pastillas» (45 min).');
  assertEquals(EVENTOS.tareaHecha('Ana', 'Cambiar pastillas', null), 'Ana terminó «Cambiar pastillas».');
  assertEquals(EVENTOS.listo('Ana', 0), 'Ana marcó el vehículo como listo: todas las tareas hechas.');
  assertEquals(EVENTOS.listo('Ana', 1), 'Ana marcó el vehículo como listo con 1 tarea sin marcar.');
  assertEquals(EVENTOS.nota('Ana', 'x').startsWith('Nota de Ana: '), true);
});

// -------- cambio de aceite --------
Deno.test('esFiltro: solo los cuatro filtros (el nombre acaba en un nombre de columna)', () => {
  for (const f of ['aire', 'aceite', 'combustible', 'habitaculo']) assertEquals(esFiltro(f), true);
  for (const f of ['estado', 'aire; drop table', 'AIRE', '', null, 3]) assertEquals(esFiltro(f), false);
});

Deno.test('normalizarEstadoFiltro', () => {
  assertEquals(normalizarEstadoFiltro('cambiado'), { ok: true, estado: 'cambiado' });
  assertEquals(normalizarEstadoFiltro('no_cambiado'), { ok: true, estado: 'no_cambiado' });
  assertEquals(normalizarEstadoFiltro(null), { ok: true, estado: null });
  assertEquals(normalizarEstadoFiltro('quizá'), { ok: false });
  assertEquals(normalizarEstadoFiltro(true), { ok: false });
});

Deno.test('fechaValida: AAAA-MM-DD que exista', () => {
  assertEquals(fechaValida('2027-05-11'), '2027-05-11');
  assertEquals(fechaValida('2027-02-31'), null);
  assertEquals(fechaValida('11/05/2027'), null);
  assertEquals(fechaValida(''), null);
  assertEquals(fechaValida(20270511), null);
});

Deno.test('normalizarKm: entero positivo, vacío = sin km', () => {
  assertEquals(normalizarKm(100000), { ok: true, km: 100000 });
  assertEquals(normalizarKm('67500'), { ok: true, km: 67500 });
  assertEquals(normalizarKm(''), { ok: true, km: null });
  assertEquals(normalizarKm(null), { ok: true, km: null });
  for (const malo of [0, -5, 12.5, 'abc', 3_000_000]) assertEquals(normalizarKm(malo), { ok: false });
});

Deno.test('formatearOrdenesPortal: aceite — filtros y próximo cambio solo si se anotó en ESTA orden', () => {
  const veh = [{ id: 'v1', marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA', aceite_proxima_fecha: '2027-05-11', aceite_proximo_km: 67500 }];
  const base = { numero: 'OT', vehiculo_id: 'v1', estado: 'en_reparacion', descripcion_problema: '' };
  const [anotada, sinAnotar, normal] = formatearOrdenesPortal([
    { ...base, id: 'a', es_cambio_aceite: true, filtro_aire: 'cambiado', filtro_habitaculo: 'no_cambiado', aceite_anotado_en: '2026-11-12T10:00:00Z', created_at: '2026-11-01T00:00:00Z' },
    { ...base, id: 'b', es_cambio_aceite: true, created_at: '2026-11-02T00:00:00Z' },
    { ...base, id: 'c', created_at: '2026-11-03T00:00:00Z' },
  ], veh, []);
  assertEquals(anotada.esCambioAceite, true);
  assertEquals(anotada.filtros, { aire: 'cambiado', aceite: null, combustible: null, habitaculo: 'no_cambiado' });
  assertEquals(anotada.aceiteProximo, { fecha: '2027-05-11', km: 67500 });
  assertEquals(sinAnotar.aceiteProximo, null);
  assertEquals(normal.esCambioAceite, false);
});

Deno.test('EVENTOS de aceite', () => {
  assertEquals(EVENTOS.filtro('Ana', 'aire', 'cambiado'), 'Ana: filtro de aire cambiado.');
  assertEquals(EVENTOS.filtro('Ana', 'habitaculo', 'no_cambiado'), 'Ana: filtro de habitáculo NO se cambió.');
  assertEquals(EVENTOS.aceite('Ana', true), 'Ana marcó la orden como cambio de aceite.');
});

// -------- listoEnDe --------
Deno.test('listoEnDe: la última vez que se marcó listo, lo hiciera el mecánico o el taller', () => {
  const ev = (ot_id: string, fecha: string, descripcion: string) => ({ ot_id, fecha, descripcion });
  const eventos = [
    ev('ot-1', '2026-11-10T10:00:00Z', 'Ana marcó el vehículo como listo: todas las tareas hechas.'),
    ev('ot-1', '2026-11-11T09:00:00Z', 'Ana reabrió la orden: vuelve a estar en reparación.'),
    ev('ot-1', '2026-11-12T16:30:00Z', 'Trabajo completado'),
    ev('ot-2', '2026-11-13T08:00:00Z', 'Trabajo completado'),
    ev('ot-1', '2026-11-12T17:00:00Z', 'Nota de Ana: falta la junta'),
  ];
  assertEquals(listoEnDe('ot-1', eventos), '2026-11-12T16:30:00Z');
  assertEquals(listoEnDe('ot-2', eventos), '2026-11-13T08:00:00Z');
  assertEquals(listoEnDe('ot-3', eventos), null);
});

Deno.test('formatearOrdenesPortal: listoEn solo para las órdenes que están listas', () => {
  const ev = [{ ot_id: 'a', fecha: '2026-11-12T10:00:00Z', descripcion: 'Trabajo completado' }, { ot_id: 'b', fecha: '2026-11-12T11:00:00Z', descripcion: 'Trabajo completado' }];
  const o = (id: string, estado: string) => ({ id, numero: id, vehiculo_id: 'v', estado, descripcion_problema: '', created_at: '2026-11-01T00:00:00Z' });
  const r = formatearOrdenesPortal([o('a', 'listo'), o('b', 'en_reparacion')], [], [], ev, 'Ana');
  assertEquals(r.find((x) => x.id === 'a')!.listoEn, '2026-11-12T10:00:00Z');
  assertEquals(r.find((x) => x.id === 'b')!.listoEn, null);
});
