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
  notasDe,
  EVENTOS,
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
