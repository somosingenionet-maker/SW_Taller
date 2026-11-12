import { describe, expect, it } from 'vitest';
import { avisoDelMecanico } from './avisoMecanico';
import type { OrdenTrabajo } from '../types';

const ot = (cambios: Partial<OrdenTrabajo>): OrdenTrabajo => ({
  id: 'ot-1', numero: 'OT-2026-007', vehiculoId: 'v1', clienteId: 'c1', estado: 'en_reparacion',
  fechaRecepcion: '2026-11-10', kilometrajeEntrada: 1000, descripcionProblema: '', tecnicoAsignado: 'Ana',
  lineas: [], subtotal: 0, ivaPct: 21, totalIva: 0, total: 0, fechaActualizacion: '2026-11-10T10:00:00Z',
  historial: [{ fecha: '2026-11-10T09:00:00Z', descripcion: 'Vehículo recibido en taller' }],
  ...cambios,
} as OrdenTrabajo);
const coche = { marca: 'Seat', modelo: 'Ibiza', matricula: '1234ABC' };

describe('avisoDelMecanico', () => {
  it('avisa cuando deja el coche listo', () => {
    expect(avisoDelMecanico(ot({}), ot({ estado: 'listo' }), coche)).toBe('Ana ha dejado listo Seat Ibiza (1234ABC). Ya puedes avisar al cliente.');
  });
  it('avisa cuando lo reabre', () => {
    expect(avisoDelMecanico(ot({ estado: 'listo' }), ot({}), coche)).toContain('ha reabierto');
  });
  it('enseña la nota nueva, no las que ya se conocían', () => {
    const vieja = { fecha: '2026-11-10T09:30:00Z', descripcion: 'Nota de Ana: pedido el filtro' };
    const nueva = { fecha: '2026-11-10T11:00:00+00:00', descripcion: 'Nota de Ana: falta la junta' };
    const antes = ot({ historial: [...ot({}).historial, vieja] });
    expect(avisoDelMecanico(antes, ot({ historial: [...antes.historial, nueva] }), coche)).toBe('Seat Ibiza (1234ABC) — Nota de Ana: falta la junta');
    expect(avisoDelMecanico(antes, antes, coche)).toBeNull();
  });
  it('marcar una tarea no genera aviso', () => {
    const evento = { fecha: '2026-11-10T11:00:00Z', descripcion: 'Ana terminó «Frenos» (45 min).' };
    expect(avisoDelMecanico(ot({}), ot({ historial: [...ot({}).historial, evento] }), coche)).toBeNull();
  });
  it('sin vehículo cargado usa el número de la orden', () => {
    expect(avisoDelMecanico(ot({}), ot({ estado: 'listo' }))).toContain('la orden OT-2026-007');
  });
});
