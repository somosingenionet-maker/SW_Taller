import { describe, it, expect, vi } from 'vitest';
import type { Factura } from '../../types';

// Mismo motivo que en ordenes.test.ts: importar el módulo dispara la
// creación real del cliente Supabase, que falla en Node sin WebSocket.
vi.mock('../supabase', () => ({ supabase: {} }));

const { mapFactura, mapLinea, toRow, rangoDeClavePeriodo } = await import('./facturas');

function facturaFixture(overrides: Partial<Factura> = {}): Factura {
  return {
    id: 'fac-1',
    numero: 'FAC-0001',
    createdAt: '2026-01-01T00:00:00Z',
    clienteId: 'cli-1',
    otIds: [],
    fecha: '2026-01-01',
    fechaVencimiento: '2026-01-31',
    estado: 'borrador',
    lineas: [],
    notas: '',
    subtotal: 0,
    ivaPct: 21,
    totalIva: 0,
    total: 0,
    ...overrides,
  };
}

describe('mapLinea', () => {
  it('traduce snake_case a camelCase', () => {
    const l = mapLinea({ id: 'l1', descripcion: 'Mano de obra', cantidad: 2, precio_unitario: 30, subtotal: 60, posicion: 0 });
    expect(l).toEqual({ id: 'l1', descripcion: 'Mano de obra', cantidad: 2, precioUnitario: 30, subtotal: 60 });
  });
});

describe('mapFactura — snapshot del cliente', () => {
  const base = {
    id: 'fac-1', numero: 'FAC-0001', cliente_id: 'cli-1', vehiculo_id: null,
    fecha: '2026-01-01', fecha_vencimiento: '2026-01-31', notas: '',
    subtotal: 0, iva_pct: 21, total_iva: 0, total: 0,
    hash: null, hash_anterior: null, qr_url: null, fecha_emision_hash: null, created_at: '2026-01-01T00:00:00Z',
    lineas_factura: null, factura_ot: null,
  };

  it('un borrador (sin snapshot en la fila) no trae clienteSnapshot — se resuelve en vivo', () => {
    const f = mapFactura({
      ...base, estado: 'borrador',
      cliente_nombre_snapshot: null, cliente_apellidos_snapshot: null, cliente_nif_snapshot: null,
      cliente_correo_snapshot: null, cliente_telefono_snapshot: null, cliente_direccion_snapshot: null,
      cliente_ciudad_snapshot: null, cliente_pais_snapshot: null,
    });
    expect(f.clienteSnapshot).toBeUndefined();
  });

  it('una factura emitida (con snapshot en la fila) trae clienteSnapshot completo', () => {
    const f = mapFactura({
      ...base, estado: 'emitida',
      cliente_nombre_snapshot: 'Miguel', cliente_apellidos_snapshot: 'Santos Cabrera',
      cliente_nif_snapshot: '30000014N', cliente_correo_snapshot: 'miguel@test.com',
      cliente_telefono_snapshot: '600000014', cliente_direccion_snapshot: 'Calle Triana 7',
      cliente_ciudad_snapshot: 'Las Palmas', cliente_pais_snapshot: 'España',
    });
    expect(f.clienteSnapshot).toEqual({
      nombre: 'Miguel', apellidos: 'Santos Cabrera', nifNiePasaporte: '30000014N',
      correo: 'miguel@test.com', telefono: '600000014', direccion: 'Calle Triana 7',
      ciudad: 'Las Palmas', pais: 'España',
    });
  });
});

describe('toRow', () => {
  it('convierte un vehiculoId vacío en null (no envía cadena vacía)', () => {
    const fila = toRow(facturaFixture({ vehiculoId: '' }));
    expect(fila.vehiculo_id).toBeNull();
  });

  it('conserva un vehiculoId presente', () => {
    const fila = toRow(facturaFixture({ vehiculoId: 'veh-1' }));
    expect(fila.vehiculo_id).toBe('veh-1');
  });
});

describe('rangoDeClavePeriodo', () => {
  it('año: cubre desde el 1 de enero hasta el 1 de enero del año siguiente', () => {
    expect(rangoDeClavePeriodo('año', '2026')).toEqual({ desde: '2026-01-01', hasta: '2027-01-01' });
  });

  it('mes: cubre desde el día 1 hasta el día 1 del mes siguiente', () => {
    expect(rangoDeClavePeriodo('mes', '2026-03')).toEqual({ desde: '2026-03-01', hasta: '2026-04-01' });
  });

  it('mes: diciembre pasa correctamente al enero del año siguiente', () => {
    expect(rangoDeClavePeriodo('mes', '2026-12')).toEqual({ desde: '2026-12-01', hasta: '2027-01-01' });
  });

  it('semana: cubre exactamente 7 días desde la clave (lunes)', () => {
    expect(rangoDeClavePeriodo('semana', '2026-09-14')).toEqual({ desde: '2026-09-14', hasta: '2026-09-21' });
  });
});
