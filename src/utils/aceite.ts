import type { FiltroAceite, FiltrosAceite } from '../types';

// Cambio de aceite: textos y cálculos que comparten el taller, la ficha del vehículo y el Portal del Mecánico.

export const FILTROS: { id: FiltroAceite; nombre: string }[] = [
  { id: 'aire', nombre: 'Filtro de aire' },
  { id: 'aceite', nombre: 'Filtro de aceite' },
  { id: 'combustible', nombre: 'Filtro de combustible' },
  { id: 'habitaculo', nombre: 'Filtro de habitáculo' },
];

export const FILTROS_VACIOS: FiltrosAceite = { aire: null, aceite: null, combustible: null, habitaculo: null };

/** Fecha «AAAA-MM-DD» resultante de sumar meses a `desde` (hora local). Atajos «6 meses» / «1 año». */
export function sumarMeses(meses: number, desde: Date = new Date()): string {
  const d = new Date(desde.getFullYear(), desde.getMonth() + meses, desde.getDate());
  // 31 de agosto + 6 meses no existe: se queda en el último día del mes de destino.
  if (d.getDate() !== desde.getDate()) d.setDate(0);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

/** «Cambiados: aire y aceite. No se cambiaron: habitáculo. Sin revisar: combustible.» — para resúmenes e impresos. */
export function resumenFiltros(f: FiltrosAceite | undefined): string {
  if (!f) return '';
  const corto = (id: FiltroAceite) => FILTROS.find((x) => x.id === id)!.nombre.replace('Filtro de ', '');
  const lista = (ids: FiltroAceite[]) => {
    const n = ids.map(corto);
    return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n.at(-1)}`;
  };
  const ids = FILTROS.map((x) => x.id);
  const cambiados = ids.filter((id) => f[id] === 'cambiado');
  const no = ids.filter((id) => f[id] === 'no_cambiado');
  const sin = ids.filter((id) => f[id] == null);
  if (sin.length === ids.length) return '';
  return [
    cambiados.length ? `Filtros cambiados: ${lista(cambiados)}.` : '',
    no.length ? `No se cambiaron: ${lista(no)}.` : '',
    sin.length ? `Sin revisar: ${lista(sin)}.` : '',
  ].filter(Boolean).join(' ');
}

/** Días que faltan hasta `fecha` (negativo si ya pasó). `hoy` y `fecha` en «AAAA-MM-DD». */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

export type UrgenciaAceite = 'vencido' | 'proximo' | 'programado' | 'sin_dato';

/** Estado del próximo cambio para pintar la ficha: vencido, en los próximos 30 días, programado o sin dato. */
export function urgenciaAceite(proximaFecha: string | undefined, hoy: string, proximoKm?: number, kmActual?: number): UrgenciaAceite {
  const porKm = proximoKm != null && kmActual != null && kmActual >= proximoKm;
  if (!proximaFecha) return porKm ? 'vencido' : 'sin_dato';
  const dias = diasHasta(proximaFecha, hoy);
  if (dias < 0 || porKm) return 'vencido';
  return dias <= 30 ? 'proximo' : 'programado';
}

// Mismas ventanas que supabase/functions/enviar-recordatorios/logic.ts (avisoAceite). Aquí solo
// sirven para pintar el estado en Alertas; lo que se envía de verdad lo decide el servidor.
const DIAS_AVISO = 14, KM_AVISO = 500, DIAS_ULTIMO_AVISO = 7, DIAS_TOPE = 60;

/** Qué correo de aceite está pendiente de salir hoy para una alerta: recordatorio, último aviso o ninguno. */
export function avisoAceitePendiente(
  alerta: { fechaLimite?: string; kilometrajeLimite?: number; recordatorioEnviadoEn?: string; ultimoAvisoEnviadoEn?: string },
  vehiculoKm: number, hoy: string,
): 'recordatorio' | 'vencido' | null {
  const dias = alerta.fechaLimite ? diasHasta(alerta.fechaLimite.slice(0, 10), hoy) : null;
  if (dias != null && dias <= -DIAS_ULTIMO_AVISO) return dias >= -DIAS_TOPE && !alerta.ultimoAvisoEnviadoEn ? 'vencido' : null;
  if (alerta.recordatorioEnviadoEn) return null;
  const porKm = alerta.kilometrajeLimite != null && alerta.kilometrajeLimite - vehiculoKm <= KM_AVISO;
  return (dias != null && dias <= DIAS_AVISO) || porKm ? 'recordatorio' : null;
}
