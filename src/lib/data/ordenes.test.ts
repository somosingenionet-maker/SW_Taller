import { describe, it, expect, vi } from 'vitest';
import type { LineaOT, OrdenTrabajo, EventoOT } from '../../types';

// Las funciones bajo prueba son puras, pero viven en el mismo archivo que
// las que sí llaman a Supabase — importar el módulo dispara igual la
// creación real del cliente (createClient), que en Node falla fuera de un
// navegador (sin WebSocket nativo). Se sustituye por un stub: nada de lo
// que se prueba aquí lo usa.
vi.mock('../supabase', () => ({ supabase: {} }));

const { diffLineas, eventosPendientes, mapLinea, mapOrden, toRow, lineaToRow } = await import('./ordenes');

function linea(overrides: Partial<LineaOT> = {}): LineaOT {
  return {
    id: 'lin-1',
    tipo: 'mano_de_obra',
    descripcion: 'Cambio de aceite',
    cantidad: 1,
    precioUnitario: 40,
    subtotal: 40,
    ...overrides,
  };
}

// -------- diffLineas --------
// Es la lógica que decide qué línea se borra/actualiza/inserta al guardar
// una OT existente — la que se reescribió por rendimiento (antes era
// borrar-todo-y-reinsertar en cada guardado). Un fallo aquí significaría
// perder líneas de una OT real o duplicarlas.
describe('diffLineas', () => {
  it('manda todo a insertar cuando no había ninguna línea existente', () => {
    const { aBorrar, aActualizar, aInsertar } = diffLineas(new Set(), [linea({ id: 'nueva-1' })], 'ot-1');
    expect(aBorrar).toEqual([]);
    expect(aActualizar).toEqual([]);
    expect(aInsertar).toHaveLength(1);
    expect(aInsertar[0]).toMatchObject({ ot_id: 'ot-1', descripcion: 'Cambio de aceite' });
  });

  it('manda a actualizar una línea que sigue existiendo, con sus valores nuevos', () => {
    const existentes = new Set(['lin-1']);
    const { aBorrar, aActualizar, aInsertar } = diffLineas(
      existentes,
      [linea({ id: 'lin-1', precioUnitario: 55, subtotal: 55 })],
      'ot-1'
    );
    expect(aBorrar).toEqual([]);
    expect(aInsertar).toEqual([]);
    expect(aActualizar).toHaveLength(1);
    expect(aActualizar[0]).toMatchObject({ id: 'lin-1', precio_unitario: 55, subtotal: 55 });
  });

  it('marca para borrar una línea existente que ya no viene en la lista entrante', () => {
    const existentes = new Set(['lin-1', 'lin-2']);
    const { aBorrar, aActualizar, aInsertar } = diffLineas(existentes, [linea({ id: 'lin-1' })], 'ot-1');
    expect(aBorrar).toEqual(['lin-2']);
    expect(aActualizar).toHaveLength(1);
    expect(aInsertar).toEqual([]);
  });

  it('separa correctamente un guardado mixto: una se borra, una se actualiza, una es nueva', () => {
    const existentes = new Set(['lin-1', 'lin-2']);
    const entrantes = [linea({ id: 'lin-1', cantidad: 2 }), linea({ id: 'lin-3', descripcion: 'Producto nuevo' })];
    const { aBorrar, aActualizar, aInsertar } = diffLineas(existentes, entrantes, 'ot-1');
    expect(aBorrar).toEqual(['lin-2']);
    expect(aActualizar.map((l) => l.id)).toEqual(['lin-1']);
    expect(aInsertar).toHaveLength(1);
    expect(aInsertar[0].descripcion).toBe('Producto nuevo');
  });

  it('asigna la posición según el orden del array, no el id', () => {
    const entrantes = [linea({ id: 'a' }), linea({ id: 'b' }), linea({ id: 'c' })];
    const { aInsertar } = diffLineas(new Set(), entrantes, 'ot-1');
    expect(aInsertar.map((l) => l.posicion)).toEqual([0, 1, 2]);
  });

  it('conserva completado=true de una línea existente al actualizarla (no lo resetea)', () => {
    const existentes = new Set(['lin-1']);
    const { aActualizar } = diffLineas(existentes, [linea({ id: 'lin-1', completado: true })], 'ot-1');
    expect(aActualizar[0].completado).toBe(true);
  });

  it('una línea nueva sin completado/notificadoCliente definidos usa los defaults seguros', () => {
    const { aInsertar } = diffLineas(new Set(), [linea({ id: 'nueva' })], 'ot-1');
    expect(aInsertar[0].completado).toBe(false);
    expect(aInsertar[0].notificado_cliente).toBe(true);
  });
});

// -------- eventosPendientes --------
describe('eventosPendientes', () => {
  const historial: EventoOT[] = [
    { fecha: '2026-01-01T00:00:00Z', descripcion: 'Presupuesto creado' },
    { fecha: '2026-01-02T00:00:00Z', descripcion: 'Vehículo recibido en taller' },
    { fecha: '2026-01-03T00:00:00Z', descripcion: 'Reparación iniciada' },
  ];

  it('devuelve solo los eventos nuevos al final, respetando cuántos ya había guardados', () => {
    expect(eventosPendientes(historial, 1)).toEqual(historial.slice(1));
  });

  it('devuelve todo el historial cuando no había nada guardado', () => {
    expect(eventosPendientes(historial, 0)).toEqual(historial);
  });

  it('no devuelve nada cuando ya está todo guardado', () => {
    expect(eventosPendientes(historial, historial.length)).toEqual([]);
  });
});

// -------- mapLinea / lineaToRow --------
describe('mapLinea y lineaToRow', () => {
  it('mapLinea traduce snake_case de la fila a camelCase, con undefined en vez de null', () => {
    const mapeada = mapLinea({
      id: 'l1', tipo: 'producto', producto_id: null, descripcion: 'Filtro', cantidad: 2,
      precio_unitario: 10, costo_unitario: null, subtotal: 20, posicion: 0,
      completado: false, notificado_cliente: true,
    });
    expect(mapeada.productoId).toBeUndefined();
    expect(mapeada.costoUnitario).toBeUndefined();
    expect(mapeada.precioUnitario).toBe(10);
  });

  it('lineaToRow traduce camelCase a snake_case para escribir en la base de datos', () => {
    const fila = lineaToRow(linea({ productoId: 'prod-1', costoUnitario: 5 }), 'ot-9', 3);
    expect(fila).toMatchObject({
      ot_id: 'ot-9', producto_id: 'prod-1', costo_unitario: 5, posicion: 3,
    });
  });
});

// -------- toRow / mapOrden --------
function ordenFixture(overrides: Partial<OrdenTrabajo> = {}): OrdenTrabajo {
  return {
    id: 'ot-1',
    numero: 'OT-2026-001',
    vehiculoId: 'veh-1',
    clienteId: 'cli-1',
    estado: 'recibido',
    fechaRecepcion: '2026-01-01',
    kilometrajeEntrada: 1000,
    descripcionProblema: 'Ruido en el motor',
    lineas: [],
    subtotal: 0,
    ivaPct: 21,
    totalIva: 0,
    total: 0,
    fechaActualizacion: '2026-01-01T00:00:00Z',
    historial: [],
    ...overrides,
  };
}

describe('toRow', () => {
  it('convierte campos opcionales ausentes en null, no en undefined (evita omitir la columna en el update)', () => {
    const fila = toRow(ordenFixture());
    expect(fila.diagnostico).toBeNull();
    expect(fila.tecnico_asignado).toBeNull();
    expect(fila.fecha_estimada_entrega).toBeNull();
  });

  it('conserva los valores presentes con su nombre snake_case', () => {
    const fila = toRow(ordenFixture({ tecnicoAsignado: 'Miguel Ángel', diagnostico: 'Correa floja' }));
    expect(fila.tecnico_asignado).toBe('Miguel Ángel');
    expect(fila.diagnostico).toBe('Correa floja');
  });
});

describe('mapOrden', () => {
  it('ordena las líneas por posición y el historial por fecha, sin importar el orden de llegada', () => {
    const ot = mapOrden({
      id: 'ot-1', numero: 'OT-1', vehiculo_id: 'v1', cliente_id: 'c1', estado: 'recibido',
      fecha_recepcion: '2026-01-01', fecha_estimada_entrega: null, fecha_entrega: null,
      kilometraje_entrada: 0, kilometraje_salida: null, descripcion_problema: '', diagnostico: null,
      tecnico_asignado: null, subtotal: 0, iva_pct: 21, total_iva: 0, total: 0, notas: null,
      presupuesto_estado: null, presupuesto_aprobado: null, notificacion_enviada: null,
      updated_at: '2026-01-01T00:00:00Z', checklist_recepcion: null, checklist_observaciones: null,
      fotos_recepcion: null,
      lineas_ot: [
        { id: 'l2', tipo: 'mano_de_obra', producto_id: null, descripcion: 'Segunda', cantidad: 1, precio_unitario: 1, costo_unitario: null, subtotal: 1, posicion: 1, completado: false, notificado_cliente: true },
        { id: 'l1', tipo: 'mano_de_obra', producto_id: null, descripcion: 'Primera', cantidad: 1, precio_unitario: 1, costo_unitario: null, subtotal: 1, posicion: 0, completado: false, notificado_cliente: true },
      ],
      eventos_ot: [
        { fecha: '2026-01-02T00:00:00Z', descripcion: 'Segundo evento' },
        { fecha: '2026-01-01T00:00:00Z', descripcion: 'Primer evento' },
      ],
    });
    expect(ot.lineas.map((l) => l.descripcion)).toEqual(['Primera', 'Segunda']);
    expect(ot.historial.map((e) => e.descripcion)).toEqual(['Primer evento', 'Segundo evento']);
  });
});
