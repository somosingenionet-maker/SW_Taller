import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OrdenTrabajo } from '../../types';

// createOrden() no es pura (llama a Supabase) — a diferencia de
// ordenes.test.ts (que solo prueba funciones puras con un stub `{}`), aquí
// hace falta un mock con estado real para simular la colisión de número de
// OT entre dos creaciones simultáneas y comprobar que el reintento
// automático la resuelve sola, sin que el usuario vea un error.
const filaOrdenCompleta = {
  id: 'ot-nueva', numero: 'OT-2026-002', vehiculo_id: 'v1', cliente_id: 'c1', estado: 'presupuesto',
  fecha_recepcion: '2026-01-01', fecha_estimada_entrega: null, fecha_entrega: null,
  kilometraje_entrada: 0, kilometraje_salida: null, descripcion_problema: 'Ruido', diagnostico: null,
  tecnico_asignado: null, subtotal: 0, iva_pct: 21, total_iva: 0, total: 0, notas: null,
  presupuesto_estado: null, presupuesto_aprobado: null, notificacion_enviada: null,
  updated_at: '2026-01-01T00:00:00Z', checklist_recepcion: null, checklist_observaciones: null,
  fotos_recepcion: null, lineas_ot: [], eventos_ot: [],
};

const { mockRpc, mockInsertOrden } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockInsertOrden: vi.fn(),
}));

vi.mock('../supabase', () => ({
  supabase: {
    rpc: mockRpc,
    from: (tabla: string) => {
      if (tabla === 'ordenes_trabajo') {
        return {
          insert: () => ({ select: () => ({ single: mockInsertOrden }) }),
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
    id: 'local-temp', numero: '', vehiculoId: 'v1', clienteId: 'c1', estado: 'presupuesto',
    fechaRecepcion: '2026-01-01', kilometrajeEntrada: 0, descripcionProblema: 'Ruido',
    lineas: [], subtotal: 0, ivaPct: 21, totalIva: 0, total: 0,
    fechaActualizacion: '2026-01-01T00:00:00Z', historial: [],
  };
}

describe('createOrden — reintento en colisión de numeración', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockInsertOrden.mockReset();
  });

  it('si el primer número choca (23505 en numero), pide uno nuevo y reintenta sola', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'OT-2026-001', error: null });
    mockRpc.mockResolvedValueOnce({ data: 'OT-2026-002', error: null });
    mockInsertOrden
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "ordenes_trabajo_numero_key" numero' } })
      .mockResolvedValueOnce({ data: { id: 'ot-nueva' }, error: null });

    const resultado = await createOrden(otFixture());

    expect(resultado.numero).toBe('OT-2026-002');
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(mockInsertOrden).toHaveBeenCalledTimes(2);
  });

  it('un error de inserción que NO es colisión de número se propaga sin reintentar', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'OT-2026-003', error: null });
    mockInsertOrden.mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });

    await expect(createOrden(otFixture())).rejects.toThrow('violates foreign key constraint');
    expect(mockInsertOrden).toHaveBeenCalledTimes(1);
  });

  it('si todos los intentos chocan, se rinde con un mensaje claro en vez de reintentar para siempre', async () => {
    mockRpc.mockResolvedValue({ data: 'OT-2026-001', error: null });
    mockInsertOrden.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint on numero' } });

    await expect(createOrden(otFixture())).rejects.toThrow();
    // CREATE_ORDEN_MAX_INTENTOS = 3 — ni uno más, ni uno menos.
    expect(mockInsertOrden).toHaveBeenCalledTimes(3);
  });
});
