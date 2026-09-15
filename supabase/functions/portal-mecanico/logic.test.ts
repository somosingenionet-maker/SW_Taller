import { assertEquals } from 'jsr:@std/assert@1';
import {
  puedeMarcarTarea,
  debeIniciarReparacion,
  formatearOrdenesPortal,
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

  assertEquals(resultado[0].tareas.map((t) => t.id), ['l1']);
  assertEquals(resultado[1].tareas.map((t) => t.id), ['l2']);
  assertEquals(resultado[0].vehiculo, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' });
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
