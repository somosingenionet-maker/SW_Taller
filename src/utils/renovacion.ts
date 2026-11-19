import type { AlertaTipo } from '../types';
import { sumarMeses } from './aceite';

/**
 * Próxima fecha que se propone al marcar un vencimiento como renovado. Solo es una PROPUESTA (el taller la puede cambiar):
 *   · Seguro e impuesto: un año después del vencimiento anterior.
 *   · ITV de un turismo particular: cada 2 años entre los 4 y los 10 años del coche, y cada año a partir de ahí
 *     (sin año de matriculación, se propone un año: nunca se queda más tarde de la realidad).
 * Se cuenta desde el vencimiento anterior, no desde hoy, porque la renovación conserva el ciclo; y si aun así queda en el
 * pasado (se renovó con mucho retraso), se cuenta desde hoy.
 */
export function proximaRenovacion(tipo: Exclude<AlertaTipo, 'aceite'>, vencimientoActual: string, hoy: string, anioMatriculacion?: number): string {
  const meses = tipo === 'itv' ? mesesProximaItv(vencimientoActual, anioMatriculacion) : 12;
  const desdeVencimiento = sumarMeses(meses, fechaLocal(vencimientoActual));
  return desdeVencimiento > hoy ? desdeVencimiento : sumarMeses(meses, fechaLocal(hoy));
}

function mesesProximaItv(vencimiento: string, anio?: number): number {
  if (!anio) return 12;
  const edad = Number(vencimiento.slice(0, 4)) - anio;
  return edad > 10 ? 12 : 24;
}

/** «AAAA-MM-DD» → Date a medianoche local (sin saltos por zona horaria). */
function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}
