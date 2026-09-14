import { supabase } from '../supabase';

export interface RentabilidadPeriodo {
  facturacion: number;
  entregadas: number;
  tiempoMedioDias: number | null;
  manoObraTotal: number;
  manoObraCosto: number;
  productoTotal: number;
  productoCosto: number;
  canceladas: number;
  otsTotal: number;
  presupuestosTotal: number;
  presupuestosConvertidos: number;
}

type PeriodoRow = {
  facturacion: number; entregadas: number; tiempo_medio_dias: number | null;
  mano_obra_total: number; mano_obra_costo: number; producto_total: number; producto_costo: number;
  canceladas: number; ots_total: number; presupuestos_total: number; presupuestos_convertidos: number;
};

function fecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Totales agregados de un rango de fechas — llamar dos veces (período actual y anterior) para el delta. */
export async function getRentabilidadPeriodo(start: Date, end: Date): Promise<RentabilidadPeriodo> {
  const { data, error } = await supabase.rpc('rentabilidad_periodo', { p_start: fecha(start), p_end: fecha(end) });
  if (error) throw new Error(error.message);
  const r = (data as PeriodoRow[])[0];
  return {
    facturacion: Number(r.facturacion),
    entregadas: Number(r.entregadas),
    tiempoMedioDias: r.tiempo_medio_dias != null ? Number(r.tiempo_medio_dias) : null,
    manoObraTotal: Number(r.mano_obra_total),
    manoObraCosto: Number(r.mano_obra_costo),
    productoTotal: Number(r.producto_total),
    productoCosto: Number(r.producto_costo),
    canceladas: Number(r.canceladas),
    otsTotal: Number(r.ots_total),
    presupuestosTotal: Number(r.presupuestos_total),
    presupuestosConvertidos: Number(r.presupuestos_convertidos),
  };
}

/** Recuento de OTs por estado — todo el histórico, no filtrado por período. */
export async function getRentabilidadEstadoActual(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('rentabilidad_estado_actual');
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const r of (data as { estado: string; cantidad: number }[] ?? [])) out[r.estado] = Number(r.cantidad);
  return out;
}

export interface TecnicoStat {
  nombre: string;
  ots: number;
  facturado: number;
}

export async function getRentabilidadTecnicos(start: Date, end: Date): Promise<TecnicoStat[]> {
  const { data, error } = await supabase.rpc('rentabilidad_tecnicos', { p_start: fecha(start), p_end: fecha(end) });
  if (error) throw new Error(error.message);
  return (data as { nombre: string; ots: number; facturado: number }[] ?? [])
    .map(r => ({ nombre: r.nombre, ots: Number(r.ots), facturado: Number(r.facturado) }));
}

export interface ClienteTop {
  clienteId: string;
  visitas: number;
  facturado: number;
}

export async function getRentabilidadTopClientes(limit = 5): Promise<ClienteTop[]> {
  const { data, error } = await supabase.rpc('rentabilidad_top_clientes', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data as { cliente_id: string; visitas: number; facturado: number }[] ?? [])
    .map(r => ({ clienteId: r.cliente_id, visitas: Number(r.visitas), facturado: Number(r.facturado) }));
}
