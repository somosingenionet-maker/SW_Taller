import { supabase } from '../supabase';
import type { Factura, LineaDocumento } from '../../types';
import type { Database } from '../database.types';

// empresa_id y numero los rellenan los triggers del servidor
// (set_empresa_id / set_numero_factura) — el cliente nunca los envía.
type FacturaInsert = Database['public']['Tables']['facturas']['Insert'];

const SELECT =
  'id, numero, cliente_id, vehiculo_id, fecha, fecha_vencimiento, estado, notas, ' +
  'subtotal, iva_pct, total_iva, total, hash, hash_anterior, qr_url, fecha_emision_hash, created_at, ' +
  'lineas_factura ( id, descripcion, cantidad, precio_unitario, subtotal, posicion ), ' +
  'factura_ot ( ot_id )';

type LineaRow = {
  id: string; descripcion: string; cantidad: number; precio_unitario: number;
  subtotal: number; posicion: number;
};
type FacturaRow = {
  id: string; numero: string; cliente_id: string; vehiculo_id: string | null;
  fecha: string; fecha_vencimiento: string; estado: string; notas: string;
  subtotal: number; iva_pct: number; total_iva: number; total: number;
  hash: string | null; hash_anterior: string | null; qr_url: string | null;
  fecha_emision_hash: string | null; created_at: string;
  lineas_factura: LineaRow[] | null; factura_ot: { ot_id: string }[] | null;
};

function mapLinea(l: LineaRow): LineaDocumento {
  return {
    id: l.id,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precio_unitario,
    subtotal: l.subtotal,
  };
}

function mapFactura(r: FacturaRow): Factura {
  return {
    id: r.id,
    numero: r.numero,
    createdAt: r.created_at,
    clienteId: r.cliente_id,
    vehiculoId: r.vehiculo_id ?? undefined,
    otIds: (r.factura_ot ?? []).map((fo) => fo.ot_id),
    fecha: r.fecha,
    fechaVencimiento: r.fecha_vencimiento,
    estado: r.estado as Factura['estado'],
    lineas: (r.lineas_factura ?? []).slice().sort((a, b) => a.posicion - b.posicion).map(mapLinea),
    notas: r.notas ?? '',
    subtotal: r.subtotal,
    ivaPct: r.iva_pct,
    totalIva: r.total_iva,
    total: r.total,
    hash: r.hash ?? undefined,
    hashAnterior: r.hash_anterior ?? undefined,
    qrUrl: r.qr_url ?? undefined,
    fechaEmisionHash: r.fecha_emision_hash ?? undefined,
  };
}

// `numero` nunca se envía: lo asigna el trigger set_numero_factura() al
// crear, y una vez asignado no se vuelve a tocar (la UI no deja editarlo).
function toRow(f: Factura) {
  return {
    cliente_id: f.clienteId,
    vehiculo_id: f.vehiculoId || null,
    fecha: f.fecha,
    fecha_vencimiento: f.fechaVencimiento,
    estado: f.estado,
    notas: f.notas || '',
    subtotal: f.subtotal,
    iva_pct: f.ivaPct,
    total_iva: f.totalIva,
    total: f.total,
  };
}

function lineasToRows(facturaId: string, lineas: LineaDocumento[]) {
  return lineas.map((l, i) => ({
    factura_id: facturaId,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precioUnitario,
    subtotal: l.subtotal,
    posicion: i,
  }));
}

async function getFactura(id: string): Promise<Factura> {
  const { data, error } = await supabase.from('facturas').select(SELECT).eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapFactura(data as unknown as FacturaRow);
}

export async function listFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapFactura(r as unknown as FacturaRow));
}

export interface FacturasResumen {
  totalFacturas: number;
  facturasPagadas: number;
  importePendiente: number;
  importeCobrado: number;
  facturasMesActual: number;
  importeMesActual: number;
  facturasVencidas: number;
  importeVencido: number;
}

type ResumenRow = {
  total_facturas: number; facturas_pagadas: number; importe_pendiente: number; importe_cobrado: number;
  facturas_mes_actual: number; importe_mes_actual: number; facturas_vencidas: number; importe_vencido: number;
};

/** Totales agregados (Home, tarjetas KPI de Facturas) calculados en el servidor — no requiere traer las filas completas. */
export async function getFacturasResumen(): Promise<FacturasResumen> {
  const mesActual = new Date().toISOString().slice(0, 7);
  const { data, error } = await supabase.rpc('facturas_resumen', { mes_actual: mesActual });
  if (error) throw new Error(error.message);
  const r = (data as ResumenRow[])[0];
  return {
    totalFacturas: Number(r.total_facturas),
    facturasPagadas: Number(r.facturas_pagadas),
    importePendiente: Number(r.importe_pendiente),
    importeCobrado: Number(r.importe_cobrado),
    facturasMesActual: Number(r.facturas_mes_actual),
    importeMesActual: Number(r.importe_mes_actual),
    facturasVencidas: Number(r.facturas_vencidas),
    importeVencido: Number(r.importe_vencido),
  };
}

export type AgrupacionFacturas = 'semana' | 'mes' | 'año';

export interface FacturaPeriodo {
  clave: string;
  cantidad: number;
  total: number;
}

type PeriodoRow = { clave: string; cantidad: number; total: number };

/** Un renglón por período (semana/mes/año) con su recuento y total — no una fila por factura. */
export async function getFacturasPorPeriodo(agrupacion: AgrupacionFacturas): Promise<FacturaPeriodo[]> {
  const { data, error } = await supabase.rpc('facturas_por_periodo', { agrupacion });
  if (error) throw new Error(error.message);
  return (data as PeriodoRow[] ?? []).map((r) => ({ clave: r.clave, cantidad: Number(r.cantidad), total: Number(r.total) }));
}

/** Rango [desde, hasta) de fecha para un período dado por su clave — para filtrar la página de filas de ese grupo. */
export function rangoDeClavePeriodo(agrupacion: AgrupacionFacturas, clave: string): { desde: string; hasta: string } {
  if (agrupacion === 'año') {
    const anio = Number(clave);
    return { desde: `${clave}-01-01`, hasta: `${anio + 1}-01-01` };
  }
  if (agrupacion === 'mes') {
    const [anio, mes] = clave.split('-').map(Number);
    const hastaMes = mes === 12 ? 1 : mes + 1;
    const hastaAnio = mes === 12 ? anio + 1 : anio;
    return { desde: `${clave}-01`, hasta: `${hastaAnio}-${String(hastaMes).padStart(2, '0')}-01` };
  }
  const inicio = new Date(clave + 'T00:00:00');
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 7);
  return { desde: clave, hasta: fin.toISOString().slice(0, 10) };
}

export interface ListFacturasParams {
  limit: number;
  offset: number;
  /** Filtra por rango de fecha (típicamente el de un período de getFacturasPorPeriodo). */
  rangoFecha?: { desde: string; hasta: string };
}

/** Página de facturas completas (con líneas) — para navegar, no para agregados. */
export async function listFacturasPaginado(params: ListFacturasParams): Promise<{ data: Factura[]; count: number }> {
  let query = supabase.from('facturas').select(SELECT, { count: 'exact' });
  if (params.rangoFecha) {
    query = query.gte('fecha', params.rangoFecha.desde).lt('fecha', params.rangoFecha.hasta);
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1);
  if (error) throw new Error(error.message);
  return { data: (data ?? []).map((r) => mapFactura(r as unknown as FacturaRow)), count: count ?? 0 };
}

/** Crea una factura nueva, siempre en estado 'borrador'. El número lo asigna el servidor. */
export async function createFactura(f: Factura): Promise<Factura> {
  const { data, error } = await supabase.from('facturas').insert(toRow(f) as FacturaInsert).select('id').single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;

  if (f.lineas.length) {
    const { error: eL } = await supabase.from('lineas_factura').insert(lineasToRows(id, f.lineas));
    if (eL) throw new Error(eL.message);
  }
  if (f.otIds.length) {
    const { error: eO } = await supabase.from('factura_ot').insert(f.otIds.map((otId) => ({ factura_id: id, ot_id: otId })));
    if (eO) throw new Error(eO.message);
  }
  return getFactura(id);
}

/**
 * Guarda cambios de contenido (cliente, líneas, importes...) en una
 * factura. Solo pensada para facturas en 'borrador' — una vez emitida, la
 * base de datos rechaza cualquier cambio de contenido y también bloquea
 * el borrado-y-reinserción de líneas que hace esta función en cada
 * guardado (ver cambiarEstadoFactura para transiciones de estado
 * administrativas como pagada/vencida/cancelada, que no deben pasar por
 * aquí).
 */
export async function updateFactura(f: Factura): Promise<Factura> {
  const { error } = await supabase.from('facturas').update(toRow(f)).eq('id', f.id);
  if (error) throw new Error(error.message);

  const { error: eDelL } = await supabase.from('lineas_factura').delete().eq('factura_id', f.id);
  if (eDelL) throw new Error(eDelL.message);
  if (f.lineas.length) {
    const { error: eL } = await supabase.from('lineas_factura').insert(lineasToRows(f.id, f.lineas));
    if (eL) throw new Error(eL.message);
  }

  const { error: eDelO } = await supabase.from('factura_ot').delete().eq('factura_id', f.id);
  if (eDelO) throw new Error(eDelO.message);
  if (f.otIds.length) {
    const { error: eO } = await supabase.from('factura_ot').insert(f.otIds.map((otId) => ({ factura_id: f.id, ot_id: otId })));
    if (eO) throw new Error(eO.message);
  }

  return getFactura(f.id);
}

/**
 * Marca una factura como emitida. El servidor calcula en ese momento la
 * huella encadenada (hash + hash_anterior) y el QR de verificación
 * (trigger emitir_y_proteger_factura); a partir de aquí la factura queda
 * inmutable — ver updateFactura.
 */
export async function emitirFactura(id: string): Promise<Factura> {
  const { error } = await supabase.from('facturas').update({ estado: 'emitida' }).eq('id', id);
  if (error) throw new Error(error.message);
  return getFactura(id);
}

/**
 * Cambia el estado administrativo de una factura ya emitida
 * (pagada/vencida/cancelada). A diferencia de updateFactura(), esta
 * función NO toca lineas_factura ni factura_ot — solo actualiza `estado`.
 * Es necesario mantenerlas separadas: una vez emitida, la base de datos
 * bloquea cualquier escritura en las líneas de la factura (trigger
 * bloquear_edicion_hijos_factura), así que el borrado-y-reinserción que
 * hace updateFactura() en cada guardado fallaría aquí.
 */
export async function cambiarEstadoFactura(id: string, estado: Factura['estado']): Promise<Factura> {
  const { error } = await supabase.from('facturas').update({ estado }).eq('id', id);
  if (error) throw new Error(error.message);
  return getFactura(id);
}

/** Solo permitido mientras la factura siga en 'borrador' (bloqueado en servidor si no). */
export async function deleteFactura(id: string): Promise<void> {
  const { error } = await supabase.from('facturas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
