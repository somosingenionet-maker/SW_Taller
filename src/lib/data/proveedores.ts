import { supabase } from '../supabase';
import type { Proveedor } from '../../types';
import type { Database } from '../database.types';

// empresa_id lo rellena el disparador set_empresa_id() del servidor: el cliente nunca lo envía.
type ProveedorInsert = Database['public']['Tables']['proveedores']['Insert'];

const SELECT = 'id, nombre, nif, telefono, correo, contacto, direccion, dias_pago, notas, activo';

type Row = {
  id: string; nombre: string; nif: string | null; telefono: string | null; correo: string | null; contacto: string | null;
  direccion: string | null; dias_pago: number; notas: string | null; activo: boolean;
};

const mapProveedor = (r: Row): Proveedor => ({
  id: r.id, nombre: r.nombre, nif: r.nif ?? undefined, telefono: r.telefono ?? undefined, correo: r.correo ?? undefined,
  contacto: r.contacto ?? undefined, direccion: r.direccion ?? undefined, diasPago: r.dias_pago, notas: r.notas ?? undefined, activo: r.activo,
});

const limpio = (t: string | undefined) => { const v = (t ?? '').trim(); return v === '' ? null : v; };
const toRow = (p: Omit<Proveedor, 'id'>) => ({
  nombre: p.nombre.trim(), nif: limpio(p.nif)?.toUpperCase() ?? null, telefono: limpio(p.telefono), correo: limpio(p.correo), contacto: limpio(p.contacto),
  direccion: limpio(p.direccion), dias_pago: p.diasPago, notas: limpio(p.notas), activo: p.activo,
});

/** Convierte los fallos técnicos de la base en frases del taller. */
function traducir(e: { message: string }): Error {
  const m = e.message;
  if (m.includes('proveedores_nif_uq')) return new Error('Ya tienes un proveedor con ese NIF.');
  if (m.includes('proveedores_nombre_uq')) return new Error('Ya tienes un proveedor con ese nombre.');
  if (m.includes('compras_proveedor_id_fkey')) return new Error('Este proveedor tiene compras registradas: desactívalo en vez de borrarlo.');
  return new Error(m);
}

export async function listProveedores(): Promise<Proveedor[]> {
  const { data, error } = await supabase.from('proveedores').select(SELECT).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapProveedor(r as Row));
}

export async function createProveedor(p: Omit<Proveedor, 'id'>): Promise<Proveedor> {
  const { data, error } = await supabase.from('proveedores').insert(toRow(p) as ProveedorInsert).select(SELECT).single();
  if (error) throw traducir(error);
  return mapProveedor(data as Row);
}

export async function updateProveedor(id: string, p: Omit<Proveedor, 'id'>): Promise<Proveedor> {
  const { data, error } = await supabase.from('proveedores').update(toRow(p)).eq('id', id).select(SELECT).single();
  if (error) throw traducir(error);
  return mapProveedor(data as Row);
}

export async function deleteProveedor(id: string): Promise<void> {
  const { error } = await supabase.from('proveedores').delete().eq('id', id);
  if (error) throw traducir(error);
}
