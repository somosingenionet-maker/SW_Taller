import { supabase } from '../supabase';
import { fmt2 } from '../../utils/moneda';

/**
 * Servicio del catálogo del taller: nombre corto, texto de la reparación (lo que ve el cliente y lo que va a la
 * línea de la orden) y precio sin IVA. Sin precio (null) cuando el taller aún no lo ha puesto: la lista base llega así.
 */
export interface Servicio {
  id: string;
  nombre: string;
  reparacion: string;
  precio: number | null;
  activo: boolean;
}

type Fila = { id: string; nombre: string; reparacion: string; precio: number | string | null; activo: boolean };
const map = (f: Fila): Servicio => ({ id: f.id, nombre: f.nombre, reparacion: f.reparacion, precio: f.precio === null ? null : Number(f.precio), activo: f.activo });

/** «64,50 €» o «sin precio». */
export const textoPrecioServicio = (p: number | null): string => (p === null ? 'sin precio' : `${fmt2(p)} €`);
const SELECT = 'id, nombre, reparacion, precio, activo';

export async function listServicios(): Promise<Servicio[]> {
  const { data, error } = await supabase.from('servicios_predefinidos').select(SELECT).order('nombre');
  if (error) throw new Error(error.message);
  return (data as Fila[]).map(map);
}

export async function crearServicio(s: Pick<Servicio, 'nombre' | 'reparacion' | 'precio'>): Promise<Servicio> {
  const { data, error } = await supabase.from('servicios_predefinidos')
    .insert({ nombre: s.nombre, reparacion: s.reparacion, precio: s.precio } as never).select(SELECT).single();
  if (error) throw new Error(mensajeServicio(error.message));
  return map(data as Fila);
}

export async function actualizarServicio(id: string, cambios: Partial<Pick<Servicio, 'nombre' | 'reparacion' | 'precio' | 'activo'>>): Promise<void> {
  const { error } = await supabase.from('servicios_predefinidos').update(cambios).eq('id', id);
  if (error) throw new Error(mensajeServicio(error.message));
}

export async function borrarServicio(id: string): Promise<void> {
  const { error } = await supabase.from('servicios_predefinidos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

function mensajeServicio(m: string): string {
  if (/servicios_predefinidos_nombre_uq|duplicate key/i.test(m)) return 'Ya tienes un servicio con ese nombre.';
  return m;
}
