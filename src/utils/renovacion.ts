import type { AlertaTipo, TipoVehiculo } from '../types';
import { sumarMeses } from './aceite';

/**
 * Próxima fecha que se propone al marcar un vencimiento como renovado. Solo es una PROPUESTA (el taller la puede cambiar):
 *   · Seguro e impuesto: un año después del vencimiento anterior.
 *   · ITV de un turismo particular (M1): cada 2 años entre los 4 y los 10 años del coche, y cada año a partir de ahí.
 *   · ITV de una furgoneta de mercancías hasta 3.500 kg (N1): cada 2 años hasta los 6, cada año hasta los 10 y cada
 *     6 meses a partir de ahí.
 *   Sin año de matriculación se propone el plazo más corto de su tipo (1 año / 6 meses): nunca más tarde de la realidad.
 * Se cuenta desde el vencimiento anterior, no desde hoy, porque la renovación conserva el ciclo; y si aun así queda en el
 * pasado (se renovó con mucho retraso), se cuenta desde hoy.
 */
export function proximaRenovacion(
  tipo: Exclude<AlertaTipo, 'aceite'>, vencimientoActual: string, hoy: string, anioMatriculacion?: number, tipoVehiculo?: TipoVehiculo,
): string {
  const meses = tipo === 'itv' ? mesesProximaItv(vencimientoActual, anioMatriculacion, tipoVehiculo) : 12;
  const desdeVencimiento = sumarMeses(meses, fechaLocal(vencimientoActual));
  return desdeVencimiento > hoy ? desdeVencimiento : sumarMeses(meses, fechaLocal(hoy));
}

function mesesProximaItv(vencimiento: string, anio?: number, tipoVehiculo: TipoVehiculo = 'turismo'): number {
  const furgoneta = tipoVehiculo === 'furgoneta';
  if (!anio) return furgoneta ? 6 : 12;
  const edad = Number(vencimiento.slice(0, 4)) - anio;
  if (furgoneta) return edad > 10 ? 6 : edad > 6 ? 12 : 24;
  return edad > 10 ? 12 : 24;
}

/** «AAAA-MM-DD» → Date a medianoche local (sin saltos por zona horaria). */
function fechaLocal(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d);
}

/**
 * Próxima ITV de un coche que acaba de pasarla (revisión pre-ITV al entregar). Es una PROPUESTA que el taller puede cambiar.
 * Regla del RD 920/2017 (art. 6.5): si se pasa dentro de los 30 días naturales anteriores al vencimiento, la siguiente se
 * cuenta desde ese vencimiento (no se pierden días); si no, desde el día de la inspección. Periodicidad según el tipo de
 * vehículo, como `proximaRenovacion`.
 */
export function proximaItvTrasPasarla(fechaInspeccion: string, vencimientoAnterior?: string, anioMatriculacion?: number, tipoVehiculo?: TipoVehiculo): string {
  const inspeccion = fechaInspeccion.slice(0, 10);
  const anterior = vencimientoAnterior?.slice(0, 10);
  const dentroDeVentana = !!anterior && /^\d{4}-\d{2}-\d{2}$/.test(anterior)
    && inspeccion <= anterior && restarDias(anterior, 30) <= inspeccion;
  const base = dentroDeVentana ? anterior! : inspeccion;
  return sumarMeses(mesesProximaItv(base, anioMatriculacion, tipoVehiculo), fechaLocal(base));
}

function restarDias(iso: string, dias: number): string {
  const d = fechaLocal(iso);
  d.setDate(d.getDate() - dias);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}
