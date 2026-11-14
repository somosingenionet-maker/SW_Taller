import { supabase } from '../supabase';

export interface MetricasInspecciones {
  enviadas: number;
  respondidas: number;
  conAprobacion: number;
  propuesto: number;
  aprobado: number;
}
export interface MetricasMecanico { mecanico: string; informes: number; propuesto: number; aprobado: number }
export interface PuntoRechazado { punto: string; rechazados: number; total: number }

const dia = (d: Date) => d.toISOString().slice(0, 10);

export async function getMetricasInspecciones(desde: Date, hasta: Date): Promise<MetricasInspecciones> {
  const { data, error } = await supabase.rpc('inspecciones_metricas', { p_desde: dia(desde), p_hasta: dia(hasta) });
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0];
  return {
    enviadas: Number(r?.enviadas ?? 0), respondidas: Number(r?.respondidas ?? 0), conAprobacion: Number(r?.con_aprobacion ?? 0),
    propuesto: Number(r?.propuesto ?? 0), aprobado: Number(r?.aprobado ?? 0),
  };
}

export async function getMetricasMecanicos(desde: Date, hasta: Date): Promise<MetricasMecanico[]> {
  const { data, error } = await supabase.rpc('inspecciones_metricas_mecanicos', { p_desde: dia(desde), p_hasta: dia(hasta) });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ mecanico: m.mecanico, informes: Number(m.informes), propuesto: Number(m.propuesto), aprobado: Number(m.aprobado) }));
}

export async function getMasRechazadas(desde: Date, hasta: Date): Promise<PuntoRechazado[]> {
  const { data, error } = await supabase.rpc('inspecciones_mas_rechazadas', { p_desde: dia(desde), p_hasta: dia(hasta) });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ punto: p.punto, rechazados: Number(p.rechazados), total: Number(p.total) }));
}

/** Porcentaje entero (0-100) o null si no hay base para calcularlo. */
export function porcentaje(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}
