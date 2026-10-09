import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrdenTrabajo } from '../../types';

// createOrden() no es pura (llama a Supabase) — a diferencia de
// ordenes.test.ts (que solo prueba funciones puras con un stub `{}`), aquí
// hace falta un mock para comprobar qué se envía a la base de datos.
const filaOrdenCompleta = {
  id: 'ot-nueva', numero: 'OT-2026-002', vehiculo_id: 'v1', cliente_id: 'c1', estado: 'presupuesto',
  fecha_recepcion: '2026-01-01', fecha_estimada_entrega: null, fecha_entrega: null,
  kilometraje_entrada: 0, kilometraje_salida: null, descripcion_problema: 'Ruido', diagnostico: null,
  tecnico_asignado: null, subtotal: 0, iva_pct: 21, total_iva: 0, total: 0, notas: null,
  presupuesto_estado: null, presupuesto_aprobado: null, notificacion_enviada: null,
  updated_at: '2026-01-01T00:00:00Z', checklist_recepcion: null, checklist_observaciones: null,
  fotos_recepcion: null, lineas_ot: [], eventos_ot: [],
};

const { mockInsertOrden } = vi.hoisted(() => ({
  mockInsertOrden: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    from: (tabla: string) => {
      if (tabla === 'ordenes_trabajo') {
        return {
          insert: (fila: unknown) => ({ select: () => ({ single: () => mockInsertOrden(fila) }) }),
          select: () => ({ eq: () => ({ single: async () => ({ data: filaOrdenCompleta, error: null }) }) }),
        };
      }
      // lineas_ot / eventos_ot: la OT de prueba no trae líneas ni historial,
      // así que createOrden ni siquiera llega a llamar aquí.
      throw new Error(`Tabla no mockeada en este test: ${tabla}`);
    },
  },
}));

const { createOrden } = await import('./ordenes');

function otFixture(): OrdenTrabajo {
  return {
    id: 'local-temp', numero: 'LO-QUE-SEA', vehiculoId: 'v1', clienteId: 'c1', estado: 'presupuesto',
    fechaRecepcion: '2026-01-01', kilometrajeEntrada: 0, descripcionProblema: 'Ruido',
    lineas: [], subtotal: 0, ivaPct: 21, totalIva: 0, total: 0,
    fechaActualizacion: '2026-01-01T00:00:00Z', historial: [],
  };
}

describe('createOrden — el número lo asigna el servidor', () => {
  beforeEach(() => {
    mockInsertOrden.mockReset();
  });

  it('no envía ningún número: lo pone el trigger del servidor, y devuelve la orden con el número asignado', async () => {
    mockInsertOrden.mockResolvedValueOnce({ data: { id: 'ot-nueva' }, error: null });

    const resultado = await createOrden(otFixture());

    expect(mockInsertOrden).toHaveBeenCalledTimes(1);
    expect(mockInsertOrden.mock.calls[0][0]).not.toHaveProperty('numero');
    expect(resultado.numero).toBe('OT-2026-002');
  });

  it('un error de inserción se propaga tal cual, sin reintentos', async () => {
    mockInsertOrden.mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });

    await expect(createOrden(otFixture())).rejects.toThrow('violates foreign key constraint');
    expect(mockInsertOrden).toHaveBeenCalledTimes(1);
  });
});
