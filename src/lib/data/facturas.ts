import { supabase } from '../supabase';
import type { Factura, LineaDocumento } from '../../types';

const SELECT =
  'id, numero, cliente_id, vehiculo_id, fecha, fecha_vencimiento, estado, notas, ' +
  'subtotal, iva_pct, total_iva, total, ' +
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
  };
}

function toRow(f: Factura) {
  return {
    numero: f.numero,
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
  if (error) throw error;
  return mapFactura(data as unknown as FacturaRow);
}

export async function listFacturas(): Promise<Factura[]> {
  const { data, error } = await supabase
    .from('facturas')
    .select(SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapFactura(r as unknown as FacturaRow));
}

export async function createFactura(f: Factura): Promise<Factura> {
  const { data, error } = await supabase.from('facturas').insert(toRow(f)).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  if (f.lineas.length) {
    const { error: eL } = await supabase.from('lineas_factura').insert(lineasToRows(id, f.lineas));
    if (eL) throw eL;
  }
  if (f.otIds.length) {
    const { error: eO } = await supabase.from('factura_ot').insert(f.otIds.map((otId) => ({ factura_id: id, ot_id: otId })));
    if (eO) throw eO;
  }
  return getFactura(id);
}

export async function updateFactura(f: Factura): Promise<Factura> {
  const { error } = await supabase.from('facturas').update(toRow(f)).eq('id', f.id);
  if (error) throw error;

  const { error: eDelL } = await supabase.from('lineas_factura').delete().eq('factura_id', f.id);
  if (eDelL) throw eDelL;
  if (f.lineas.length) {
    const { error: eL } = await supabase.from('lineas_factura').insert(lineasToRows(f.id, f.lineas));
    if (eL) throw eL;
  }

  const { error: eDelO } = await supabase.from('factura_ot').delete().eq('factura_id', f.id);
  if (eDelO) throw eDelO;
  if (f.otIds.length) {
    const { error: eO } = await supabase.from('factura_ot').insert(f.otIds.map((otId) => ({ factura_id: f.id, ot_id: otId })));
    if (eO) throw eO;
  }

  return getFactura(f.id);
}

export async function deleteFactura(id: string): Promise<void> {
  const { error } = await supabase.from('facturas').delete().eq('id', id);
  if (error) throw error;
}
