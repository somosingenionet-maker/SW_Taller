import { supabase } from '../supabase';
import type { Producto, MovimientoStock } from '../../types';
import type { Database } from '../database.types';

type ProductoInsert = Database['public']['Tables']['productos']['Insert'];
type MovimientoInsert = Database['public']['Tables']['movimientos_stock']['Insert'];

const SELECT =
  'id, nombre, descripcion, sku, precio_venta, costo, stock_actual, stock_minimo, unidad, activo';

type ProductoRow = {
  id: string; nombre: string; descripcion: string | null; sku: string | null;
  precio_venta: number; costo: number; stock_actual: number; stock_minimo: number;
  unidad: string; activo: boolean;
};

function mapProducto(r: ProductoRow): Producto {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? undefined,
    sku: r.sku ?? undefined,
    precioVenta: r.precio_venta,
    costo: r.costo,
    stockActual: r.stock_actual,
    stockMinimo: r.stock_minimo,
    unidad: r.unidad,
    activo: r.activo,
  };
}

// stock_actual nunca se envía: lo mantiene el trigger aplicar_movimiento_stock()
// a partir de lo que se inserte en movimientos_stock.
function toRow(p: Producto) {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion || null,
    sku: p.sku || null,
    precio_venta: p.precioVenta,
    costo: p.costo,
    stock_minimo: p.stockMinimo,
    unidad: p.unidad,
    activo: p.activo,
  };
}

export async function listProductos(): Promise<Producto[]> {
  const { data, error } = await supabase.from('productos').select(SELECT).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProducto(r as ProductoRow));
}

/** Crea un producto. `stockInicial`, si es > 0, genera un movimiento de entrada
 * (así el stock siempre queda registrado en el libro, incluso el primero). */
export async function createProducto(p: Producto, stockInicial = 0): Promise<Producto> {
  const { data, error } = await supabase.from('productos').insert(toRow(p) as ProductoInsert).select('id').single();
  if (error) throw new Error(error.message);
  const id = (data as { id: string }).id;

  if (stockInicial > 0) {
    await registrarMovimiento({ productoId: id, tipo: 'entrada', cantidad: stockInicial, motivo: 'Alta inicial de inventario' });
  }

  const { data: creado, error: eGet } = await supabase.from('productos').select(SELECT).eq('id', id).single();
  if (eGet) throw new Error(eGet.message);
  return mapProducto(creado as ProductoRow);
}

export async function updateProducto(p: Producto): Promise<Producto> {
  const { data, error } = await supabase.from('productos').update(toRow(p)).eq('id', p.id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapProducto(data as ProductoRow);
}

/** Solo permitido si el producto no tiene líneas de OT históricas (FK restrict) —
 * si falla, la UI debe sugerir desactivarlo en vez de borrarlo. */
export async function deleteProducto(id: string): Promise<void> {
  const { error } = await supabase.from('productos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

const MOVIMIENTO_SELECT = 'id, producto_id, tipo, cantidad, motivo, ot_id, created_at';

type MovimientoRow = {
  id: string; producto_id: string; tipo: string; cantidad: number;
  motivo: string | null; ot_id: string | null; created_at: string;
};

function mapMovimiento(r: MovimientoRow): MovimientoStock {
  return {
    id: r.id,
    productoId: r.producto_id,
    tipo: r.tipo as MovimientoStock['tipo'],
    cantidad: r.cantidad,
    motivo: r.motivo ?? undefined,
    otId: r.ot_id ?? undefined,
    createdAt: r.created_at,
  };
}

export async function listMovimientos(productoId: string): Promise<MovimientoStock[]> {
  const { data, error } = await supabase
    .from('movimientos_stock')
    .select(MOVIMIENTO_SELECT)
    .eq('producto_id', productoId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapMovimiento(r as MovimientoRow));
}

export interface NuevoMovimiento {
  productoId: string;
  tipo: 'entrada' | 'salida' | 'ajuste';
  cantidad: number;
  motivo?: string;
}

/** Inserta el movimiento; el trigger aplicar_movimiento_stock() ajusta
 * productos.stock_actual — este módulo nunca escribe esa columna directamente. */
export async function registrarMovimiento(m: NuevoMovimiento): Promise<void> {
  const row: MovimientoInsert = {
    producto_id: m.productoId,
    tipo: m.tipo,
    cantidad: m.cantidad,
    motivo: m.motivo || null,
  };
  const { error } = await supabase.from('movimientos_stock').insert(row);
  if (error) throw new Error(error.message);
}
