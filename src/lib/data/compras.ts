import { supabase } from '../supabase';
import type { Compra, CompraLinea, EstadoCompra } from '../../types';

const SELECT = 'id, proveedor_id, numero, fecha, fecha_vencimiento, estado, fecha_pago, base, iva, total, notas, proveedores ( nombre ), compra_adjuntos ( id )';

type Row = {
  id: string; proveedor_id: string; numero: string; fecha: string; fecha_vencimiento: string | null; estado: string; fecha_pago: string | null;
  base: number; iva: number; total: number; notas: string | null; proveedores: { nombre: string } | { nombre: string }[] | null;
  compra_adjuntos?: { id: string }[] | null;
};
type LineaRow = {
  id: string; producto_id: string | null; descripcion: string; cantidad: number; precio_unitario: number; iva_pct: number; subtotal: number; posicion: number;
};

function nombreProveedor(p: Row['proveedores']): string {
  return (Array.isArray(p) ? p[0]?.nombre : p?.nombre) ?? '(proveedor)';
}
const mapCompra = (r: Row): Compra => ({
  id: r.id, proveedorId: r.proveedor_id, proveedorNombre: nombreProveedor(r.proveedores), numero: r.numero, fecha: r.fecha,
  fechaVencimiento: r.fecha_vencimiento ?? undefined, estado: r.estado as EstadoCompra, fechaPago: r.fecha_pago ?? undefined,
  base: Number(r.base), iva: Number(r.iva), total: Number(r.total), notas: r.notas ?? undefined, numAdjuntos: (r.compra_adjuntos ?? []).length,
});
const mapLinea = (l: LineaRow): CompraLinea => ({
  id: l.id, productoId: l.producto_id ?? undefined, descripcion: l.descripcion, cantidad: Number(l.cantidad),
  precioUnitario: Number(l.precio_unitario), ivaPct: Number(l.iva_pct), subtotal: Number(l.subtotal),
});

export interface FiltroCompras { desde?: string; hastaExcluido?: string; limite?: number }

/** Compras (sin líneas), de la más reciente a la más antigua. */
export async function listCompras(f: FiltroCompras = {}): Promise<{ compras: Compra[]; hayMas: boolean }> {
  const limite = f.limite ?? 300;
  let q = supabase.from('compras').select(SELECT).order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(limite + 1);
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hastaExcluido) q = q.lt('fecha', f.hastaExcluido);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const filas = (data ?? []).map((r) => mapCompra(r as unknown as Row));
  return { compras: filas.slice(0, limite), hayMas: filas.length > limite };
}

/** Una compra con sus líneas. */
export async function getCompra(id: string): Promise<Compra> {
  const { data, error } = await supabase.from('compras').select(SELECT).eq('id', id).single();
  if (error) throw new Error(error.message);
  const { data: ls, error: e2 } = await supabase.from('compra_lineas')
    .select('id, producto_id, descripcion, cantidad, precio_unitario, iva_pct, subtotal, posicion').eq('compra_id', id).order('posicion');
  if (e2) throw new Error(e2.message);
  return { ...mapCompra(data as unknown as Row), lineas: (ls ?? []).map((l) => mapLinea(l as LineaRow)) };
}

export interface NuevaCompra {
  proveedorId: string; numero: string; fecha: string; fechaVencimiento?: string; notas?: string;
  pagada: boolean; fechaPago?: string; actualizarCoste: boolean;
  lineas: { productoId?: string; descripcion: string; cantidad: number; precioUnitario: number; ivaPct: number }[];
}

/** Guarda la compra, sus líneas y el stock de golpe: o se guarda todo o nada. Devuelve el id. */
export async function guardarCompra(c: NuevaCompra): Promise<string> {
  const { data, error } = await supabase.rpc('guardar_compra', {
    p_proveedor_id: c.proveedorId, p_numero: c.numero, p_fecha: c.fecha, p_vencimiento: c.fechaVencimiento || (null as unknown as string),
    p_notas: c.notas ?? '', p_pagada: c.pagada, p_fecha_pago: c.pagada ? (c.fechaPago || (null as unknown as string)) : (null as unknown as string),
    p_actualizar_coste: c.actualizarCoste,
    p_lineas: c.lineas.map((l) => ({ producto_id: l.productoId || null, descripcion: l.descripcion, cantidad: l.cantidad, precio_unitario: l.precioUnitario, iva_pct: l.ivaPct })),
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function editarDatosCompra(id: string, d: { numero: string; fecha: string; fechaVencimiento?: string; notas?: string }): Promise<void> {
  const { error } = await supabase.rpc('editar_datos_compra', {
    p_id: id, p_numero: d.numero, p_fecha: d.fecha, p_vencimiento: d.fechaVencimiento || (null as unknown as string), p_notas: d.notas ?? '',
  });
  if (error) throw new Error(error.message);
}

/** `fechaPago` null → vuelve a «pendiente». */
export async function marcarPagoCompra(id: string, fechaPago: string | null): Promise<void> {
  const { error } = await supabase.rpc('marcar_pago_compra', { p_id: id, p_fecha_pago: fechaPago as unknown as string });
  if (error) throw new Error(error.message);
}

export async function anularCompra(id: string): Promise<void> {
  const { error } = await supabase.rpc('anular_compra', { p_id: id });
  if (error) throw new Error(error.message);
}

export interface CompraParaGestoria {
  numero: string; fecha: string; estado: EstadoCompra; proveedorNombre: string; proveedorNif: string;
  lineas: { subtotal: number; ivaPct: number }[];
  total: number;
}

/** Compras con fecha en [desde, hasta) con sus líneas (importe e IVA de cada una), para el libro de facturas recibidas. */
export async function listComprasParaGestoria(desde: string, hasta: string): Promise<CompraParaGestoria[]> {
  const TAM = 1000;
  const todas: CompraParaGestoria[] = [];
  for (let desp = 0; ; desp += TAM) {
    const { data, error } = await supabase.from('compras')
      .select('numero, fecha, estado, total, proveedores ( nombre, nif ), compra_lineas ( subtotal, iva_pct )')
      .gte('fecha', desde).lt('fecha', hasta)
      .order('fecha', { ascending: true }).order('numero', { ascending: true })
      .range(desp, desp + TAM - 1);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as unknown as Array<{
      numero: string; fecha: string; estado: string; total: number;
      proveedores: { nombre: string; nif: string | null } | { nombre: string; nif: string | null }[] | null;
      compra_lineas: { subtotal: number; iva_pct: number }[] | null;
    }>;
    for (const r of filas) {
      const p = Array.isArray(r.proveedores) ? r.proveedores[0] : r.proveedores;
      todas.push({
        numero: r.numero, fecha: r.fecha, estado: r.estado as EstadoCompra, proveedorNombre: p?.nombre ?? '(proveedor)', proveedorNif: p?.nif ?? '',
        total: Number(r.total), lineas: (r.compra_lineas ?? []).map((l) => ({ subtotal: Number(l.subtotal), ivaPct: Number(l.iva_pct) })),
      });
    }
    if (filas.length < TAM) break;
  }
  return todas;
}
