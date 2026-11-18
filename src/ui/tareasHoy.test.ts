import { describe, expect, it } from 'vitest';
import type { Cliente, OrdenTrabajo, Vehiculo } from '../types';
import { saludo, tareasHoy, textoDias } from './tareasHoy';

const ahora = new Date('2026-11-18T10:00:00Z');
const dia = (n: number) => new Date(ahora.getTime() - n * 86_400_000).toISOString();
const ot = (id: string, estado: OrdenTrabajo['estado'], extra: Partial<OrdenTrabajo> = {}): OrdenTrabajo => ({
  id, numero: `OT-${id}`, vehiculoId: 'v1', clienteId: 'c1', estado, fechaRecepcion: dia(3), fechaActualizacion: dia(3), kilometrajeEntrada: 0, descripcionProblema: '', lineas: [], subtotal: 0, ivaPct: 21, totalIva: 0, total: 0, historial: [], ...extra,
});
const veh = [{ id: 'v1', marca: 'Opel', modelo: 'Corsa', matricula: '9007TST' } as Vehiculo];
const cli = [{ id: 'c1', nombre: 'Isabel', apellidos: 'Álvarez' } as Cliente];

describe('tareasHoy', () => {
  it('reparte las órdenes por lo que hay que hacer con cada una', () => {
    const t = tareasHoy([
      ot('1', 'listo'), ot('2', 'presupuesto', { presupuestoEstado: 'enviado' }), ot('3', 'presupuesto', { presupuestoEstado: 'pendiente' }),
      ot('4', 'presupuesto', { presupuestoAprobado: true, presupuestoEstado: 'enviado' }), ot('5', 'en_reparacion'), ot('6', 'recibido'), ot('7', 'entregado'), ot('8', 'cancelado'),
    ], veh, cli, ahora);
    expect(t.listos.map((x) => x.orden.id)).toEqual(['1']);
    expect(t.esperando.map((x) => x.orden.id)).toEqual(['2']);
    expect(t.porEnviar.map((x) => x.orden.id)).toEqual(['3']);
    expect(t.aprobados.map((x) => x.orden.id)).toEqual(['4']);
    expect(t.enTaller.map((x) => x.orden.id).sort()).toEqual(['5', '6']);
  });
  it('en los listos, primero los que faltan por avisar; luego los más antiguos', () => {
    const t = tareasHoy([
      ot('a', 'listo', { notificacionEnviada: true, fechaActualizacion: dia(9) }),
      ot('b', 'listo', { fechaActualizacion: dia(1) }),
      ot('c', 'listo', { fechaActualizacion: dia(5) }),
    ], veh, cli, ahora);
    expect(t.listos.map((x) => x.orden.id)).toEqual(['c', 'b', 'a']);
  });
  it('cuenta los días y enlaza vehículo y cliente', () => {
    const t = tareasHoy([ot('1', 'en_reparacion', { fechaRecepcion: dia(68) })], veh, cli, ahora);
    expect(t.enTaller[0]).toMatchObject({ dias: 68, vehiculo: { matricula: '9007TST' }, cliente: { nombre: 'Isabel' } });
  });
  it('sin órdenes no hay nada', () => {
    expect(tareasHoy([], [], [], ahora)).toEqual({ listos: [], esperando: [], aprobados: [], porEnviar: [], enTaller: [] });
  });
  it('fechas raras no rompen y el día de hoy no es negativo', () => {
    const t = tareasHoy([ot('1', 'recibido', { fechaRecepcion: 'no-es-fecha' }), ot('2', 'recibido', { fechaRecepcion: new Date(ahora.getTime() + 86_400_000).toISOString() })], veh, cli, ahora);
    expect(t.enTaller.every((x) => x.dias === 0)).toBe(true);
  });
});

describe('textos', () => {
  it('días', () => { expect(textoDias(0)).toBe('hoy'); expect(textoDias(1)).toBe('hace 1 día'); expect(textoDias(5)).toBe('hace 5 días'); });
  it('saludo', () => {
    expect(saludo(new Date(2026, 0, 1, 9))).toBe('Buenos días');
    expect(saludo(new Date(2026, 0, 1, 15))).toBe('Buenas tardes');
    expect(saludo(new Date(2026, 0, 1, 22))).toBe('Buenas noches');
  });
});
