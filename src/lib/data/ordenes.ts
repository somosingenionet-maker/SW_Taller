import { supabase } from '../supabase';
import type { OrdenTrabajo, LineaOT, EventoOT, OTEstado, LineaOTTipo } from '../../types';
import type { Database } from '../database.types';

// empresa_id lo rellena el trigger set_empresa_id() en el servidor.
type OrdenInsert = Database['public']['Tables']['ordenes_trabajo']['Insert'];

const SELECT =
  'id, numero, vehiculo_id, cliente_id, estado, fecha_recepcion, fecha_estimada_entrega, ' +
  'fecha_entrega, kilometraje_entrada, kilometraje_salida, descripcion_problema, diagnostico, ' +
  'tecnico_asignado, subtotal, iva_pct, total_iva, total, notas, presupuesto_estado, ' +
  'presupuesto_aprobado, notificacion_enviada, updated_at, ' +
  'lineas_ot ( id, tipo, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, posicion ), ' +
  'eventos_ot ( fecha, descripcion )';

type LineaRow = {
  id: string; tipo: string; descripcion: string; cantidad: number;
  precio_unitario: number; costo_unitario: number | null; subtotal: number; posicion: number;
};
type EventoRow = { fecha: string; descripcion: string };
type OrdenRow = {
  id: string; numero: string; vehiculo_id: string; cliente_id: string; estado: string;
  fecha_recepcion: string; fecha_estimada_entrega: string | null; fecha_entrega: string | null;
  kilometraje_entrada: number; kilometraje_salida: number | null; descripcion_problema: string;
  diagnostico: string | null; tecnico_asignado: string | null; subtotal: number; iva_pct: number;
  total_iva: number; total: number; notas: string | null;
  presupuesto_estado: string | null; presupuesto_aprobado: boolean | null;
  notificacion_enviada: boolean | null; updated_at: string;
  lineas_ot: LineaRow[] | null; eventos_ot: EventoRow[] | null;
};

function mapLinea(l: LineaRow): LineaOT {
  return {
    id: l.id,
    tipo: l.tipo as LineaOTTipo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precio_unitario,
    costoUnitario: l.costo_unitario ?? undefined,
    subtotal: l.subtotal,
  };
}

function mapOrden(r: OrdenRow): OrdenTrabajo {
  const lineas = (r.lineas_ot ?? []).slice().sort((a, b) => a.posicion - b.posicion).map(mapLinea);
  const historial: EventoOT[] = (r.eventos_ot ?? [])
    .map((e) => ({ fecha: e.fecha, descripcion: e.descripcion }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    id: r.id,
    numero: r.numero,
    vehiculoId: r.vehiculo_id,
    clienteId: r.cliente_id,
    estado: r.estado as OTEstado,
    fechaRecepcion: r.fecha_recepcion,
    fechaEstimadaEntrega: r.fecha_estimada_entrega ?? undefined,
    fechaEntrega: r.fecha_entrega ?? undefined,
    kilometrajeEntrada: r.kilometraje_entrada,
    kilometrajeSalida: r.kilometraje_salida ?? undefined,
    descripcionProblema: r.descripcion_problema,
    diagnostico: r.diagnostico ?? undefined,
    tecnicoAsignado: r.tecnico_asignado ?? undefined,
    subtotal: r.subtotal,
    ivaPct: r.iva_pct,
    totalIva: r.total_iva,
    total: r.total,
    notas: r.notas ?? undefined,
    presupuestoEstado: (r.presupuesto_estado ?? undefined) as OrdenTrabajo['presupuestoEstado'],
    presupuestoAprobado: r.presupuesto_aprobado ?? undefined,
    notificacionEnviada: r.notificacion_enviada ?? undefined,
    fechaActualizacion: r.updated_at,
    lineas,
    historial,
  };
}

function toRow(ot: OrdenTrabajo) {
  return {
    numero: ot.numero,
    vehiculo_id: ot.vehiculoId,
    cliente_id: ot.clienteId,
    estado: ot.estado,
    fecha_recepcion: ot.fechaRecepcion,
    fecha_estimada_entrega: ot.fechaEstimadaEntrega || null,
    fecha_entrega: ot.fechaEntrega || null,
    kilometraje_entrada: ot.kilometrajeEntrada ?? 0,
    kilometraje_salida: ot.kilometrajeSalida ?? null,
    descripcion_problema: ot.descripcionProblema,
    diagnostico: ot.diagnostico || null,
    tecnico_asignado: ot.tecnicoAsignado || null,
    subtotal: ot.subtotal,
    iva_pct: ot.ivaPct,
    total_iva: ot.totalIva,
    total: ot.total,
    notas: ot.notas || null,
    presupuesto_estado: ot.presupuestoEstado ?? null,
    presupuesto_aprobado: ot.presupuestoAprobado ?? null,
    notificacion_enviada: ot.notificacionEnviada ?? null,
  };
}

function lineasToRows(otId: string, lineas: LineaOT[]) {
  return lineas.map((l, i) => ({
    ot_id: otId,
    tipo: l.tipo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precioUnitario,
    costo_unitario: l.costoUnitario ?? null,
    subtotal: l.subtotal,
    posicion: i,
  }));
}

function eventosToRows(otId: string, historial: EventoOT[]) {
  return historial.map((e) => ({ ot_id: otId, fecha: e.fecha, descripcion: e.descripcion }));
}

async function getOrden(id: string): Promise<OrdenTrabajo> {
  const { data, error } = await supabase.from('ordenes_trabajo').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapOrden(data as unknown as OrdenRow);
}

export async function listOrdenes(): Promise<OrdenTrabajo[]> {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(SELECT)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapOrden(r as unknown as OrdenRow));
}

export async function createOrden(ot: OrdenTrabajo): Promise<OrdenTrabajo> {
  const { data, error } = await supabase.from('ordenes_trabajo').insert(toRow(ot) as OrdenInsert).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  if (ot.lineas.length) {
    const { error: eL } = await supabase.from('lineas_ot').insert(lineasToRows(id, ot.lineas));
    if (eL) throw eL;
  }
  if (ot.historial.length) {
    const { error: eE } = await supabase.from('eventos_ot').insert(eventosToRows(id, ot.historial));
    if (eE) throw eE;
  }
  return getOrden(id);
}

export async function updateOrden(ot: OrdenTrabajo): Promise<OrdenTrabajo> {
  const { error } = await supabase.from('ordenes_trabajo').update(toRow(ot)).eq('id', ot.id);
  if (error) throw error;

  // Reemplaza líneas e historial (más simple y correcto que hacer diffs).
  const { error: eDelL } = await supabase.from('lineas_ot').delete().eq('ot_id', ot.id);
  if (eDelL) throw eDelL;
  if (ot.lineas.length) {
    const { error: eL } = await supabase.from('lineas_ot').insert(lineasToRows(ot.id, ot.lineas));
    if (eL) throw eL;
  }

  const { error: eDelE } = await supabase.from('eventos_ot').delete().eq('ot_id', ot.id);
  if (eDelE) throw eDelE;
  if (ot.historial.length) {
    const { error: eE } = await supabase.from('eventos_ot').insert(eventosToRows(ot.id, ot.historial));
    if (eE) throw eE;
  }

  return getOrden(ot.id);
}

export async function deleteOrden(id: string): Promise<void> {
  const { error } = await supabase.from('ordenes_trabajo').delete().eq('id', id);
  if (error) throw error;
}
