import { supabase } from '../supabase';

/** Servicio predefinido del taller: nombre corto, texto de la reparación y precio sin IVA. */
export interface Servicio {
  id: string;
  nombre: string;
  reparacion: string;
  precio: number;
  activo: boolean;
}

type Fila = { id: string; nombre: string; reparacion: string; precio: number | string; activo: boolean };
const map = (f: Fila): Servicio => ({ id: f.id, nombre: f.nombre, reparacion: f.reparacion, precio: Number(f.precio), activo: f.activo });
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
