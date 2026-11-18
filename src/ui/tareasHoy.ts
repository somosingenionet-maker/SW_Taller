// Qué hay que mover hoy en el taller, a partir de las órdenes ya cargadas. Puro y probado: la pantalla «Hoy» solo lo pinta.
import type { Cliente, OrdenTrabajo, Vehiculo } from '../types';

export interface TareaOrden { orden: OrdenTrabajo; vehiculo?: Vehiculo; cliente?: Cliente; /** Días desde que se recibió (o desde el último cambio, en presupuestos). */ dias: number }

export interface TareasHoy {
  /** Coches listos: primero los que aún no se ha avisado al cliente, luego los más antiguos. */
  listos: TareaOrden[];
  /** Presupuesto enviado y sin respuesta, el que más espera primero. */
  esperando: TareaOrden[];
  /** Presupuesto aprobado por el cliente: falta recibir el coche. */
  aprobados: TareaOrden[];
  /** Presupuesto aún sin enviar. */
  porEnviar: TareaOrden[];
  /** Coches dentro del taller (recibidos o en reparación), el que lleva más tiempo primero. */
  enTaller: TareaOrden[];
}

const DIA = 86_400_000;

export function tareasHoy(ordenes: OrdenTrabajo[], vehiculos: Vehiculo[], clientes: Cliente[], ahora: Date = new Date()): TareasHoy {
  const veh = new Map(vehiculos.map((v) => [v.id, v]));
  const cli = new Map(clientes.map((c) => [c.id, c]));
  const desde = (iso: string) => { const t = new Date(iso).getTime(); return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((ahora.getTime() - t) / DIA)); };
  const tarea = (o: OrdenTrabajo, base: string): TareaOrden => ({ orden: o, vehiculo: veh.get(o.vehiculoId), cliente: cli.get(o.clienteId), dias: desde(base) });
  const masAntiguoPrimero = (a: TareaOrden, b: TareaOrden) => b.dias - a.dias;

  const listos = ordenes.filter((o) => o.estado === 'listo').map((o) => tarea(o, o.fechaActualizacion || o.fechaRecepcion))
    .sort((a, b) => Number(!!a.orden.notificacionEnviada) - Number(!!b.orden.notificacionEnviada) || masAntiguoPrimero(a, b));
  const presupuestos = ordenes.filter((o) => o.estado === 'presupuesto');
  const esperando = presupuestos.filter((o) => o.presupuestoEstado === 'enviado' && !o.presupuestoAprobado).map((o) => tarea(o, o.fechaActualizacion || o.fechaRecepcion)).sort(masAntiguoPrimero);
  const aprobados = presupuestos.filter((o) => o.presupuestoAprobado).map((o) => tarea(o, o.fechaActualizacion || o.fechaRecepcion)).sort(masAntiguoPrimero);
  const porEnviar = presupuestos.filter((o) => o.presupuestoEstado !== 'enviado' && !o.presupuestoAprobado).map((o) => tarea(o, o.fechaActualizacion || o.fechaRecepcion)).sort(masAntiguoPrimero);
  const enTaller = ordenes.filter((o) => o.estado === 'recibido' || o.estado === 'en_reparacion').map((o) => tarea(o, o.fechaRecepcion)).sort(masAntiguoPrimero);
  return { listos, esperando, aprobados, porEnviar, enTaller };
}

export const textoDias = (dias: number): string => (dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`);

export function saludo(ahora: Date = new Date()): string {
  const h = ahora.getHours();
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}
