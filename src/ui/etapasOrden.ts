// Los pasos de una orden de trabajo y qué toca después. Mismos estados y mismo orden que el taller ya usaba; solo se les da nombre de acción.
import type { OTEstado } from '../types';

export const PASOS_ORDEN: OTEstado[] = ['presupuesto', 'recibido', 'en_reparacion', 'listo', 'entregado'];

export const NOMBRE_ESTADO: Record<OTEstado, string> = {
  presupuesto: 'Presupuesto', recibido: 'Recibido', en_reparacion: 'En reparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado',
};

const SIGUIENTE: Partial<Record<OTEstado, { estado: OTEstado; accion: string }>> = {
  presupuesto: { estado: 'recibido', accion: 'Recibir el coche' },
  recibido: { estado: 'en_reparacion', accion: 'Empezar la reparación' },
  en_reparacion: { estado: 'listo', accion: 'Marcar como listo' },
  listo: { estado: 'entregado', accion: 'Entregar al cliente' },
};

/** Lo que toca hacer después con una orden en este estado; null si ya no hay más pasos (entregada o cancelada). */
export const siguientePaso = (estado: OTEstado): { estado: OTEstado; accion: string } | null => SIGUIENTE[estado] ?? null;

/** Posición del paso (0-4) y cuántos hay, para dibujar el progreso. Una orden cancelada no tiene paso. */
export function progresoPasos(estado: OTEstado): { actual: number; total: number } | null {
  const i = PASOS_ORDEN.indexOf(estado);
  return i < 0 ? null : { actual: i, total: PASOS_ORDEN.length };
}

/** ¿Pasar de `desde` a `hasta` es retroceder? (el taller no lo permite arrastrando). */
export const esRetroceso = (desde: OTEstado, hasta: OTEstado): boolean => PASOS_ORDEN.indexOf(hasta) < PASOS_ORDEN.indexOf(desde);
