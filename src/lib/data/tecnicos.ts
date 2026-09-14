import { supabase } from '../supabase';
import type { Tecnico } from '../../types';
import type { Database } from '../database.types';

export type NuevoTecnico = Omit<Tecnico, 'id'>;

// empresa_id lo rellena el trigger set_empresa_id() en el servidor.
type TecnicoInsert = Database['public']['Tables']['tecnicos']['Insert'];

const COLS = 'id, nombre, especialidad, activo, telefono, portal_token';

type TecnicoRow = {
  id: string; nombre: string; especialidad: string | null; activo: boolean;
  telefono: string | null; portal_token: string | null;
};

function mapTecnico(r: TecnicoRow): Tecnico {
  return {
    id: r.id,
    nombre: r.nombre,
    especialidad: r.especialidad ?? undefined,
    activo: r.activo,
    telefono: r.telefono ?? undefined,
    portalToken: r.portal_token,
  };
}

export async function listTecnicos(): Promise<Tecnico[]> {
  const { data, error } = await supabase.from('tecnicos').select(COLS).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapTecnico(r as TecnicoRow));
}

export async function createTecnico(input: NuevoTecnico): Promise<Tecnico> {
  const { data, error } = await supabase
    .from('tecnicos')
    .insert({
      nombre: input.nombre, especialidad: input.especialidad || null, activo: input.activo,
      telefono: input.telefono || null,
    } as TecnicoInsert)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapTecnico(data as TecnicoRow);
}

export async function updateTecnico(t: Tecnico): Promise<Tecnico> {
  const { data, error } = await supabase
    .from('tecnicos')
    .update({ nombre: t.nombre, especialidad: t.especialidad || null, activo: t.activo, telefono: t.telefono || null })
    .eq('id', t.id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapTecnico(data as TecnicoRow);
}

export async function deleteTecnico(id: string): Promise<void> {
  const { error } = await supabase.from('tecnicos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Genera (o revoca, pasando null) el token del enlace del Portal del Mecánico. */
export async function setPortalTokenTecnico(id: string, token: string | null): Promise<Tecnico> {
  const { data, error } = await supabase
    .from('tecnicos')
    .update({ portal_token: token })
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapTecnico(data as TecnicoRow);
}
