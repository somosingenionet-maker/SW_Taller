import { supabase } from '../supabase';
import type { Tecnico } from '../../types';

export type NuevoTecnico = Omit<Tecnico, 'id'>;

const COLS = 'id, nombre, especialidad, activo';

type TecnicoRow = { id: string; nombre: string; especialidad: string | null; activo: boolean };

function mapTecnico(r: TecnicoRow): Tecnico {
  return {
    id: r.id,
    nombre: r.nombre,
    especialidad: r.especialidad ?? undefined,
    activo: r.activo,
  };
}

export async function listTecnicos(): Promise<Tecnico[]> {
  const { data, error } = await supabase.from('tecnicos').select(COLS).order('nombre');
  if (error) throw error;
  return (data ?? []).map((r) => mapTecnico(r as TecnicoRow));
}

export async function createTecnico(input: NuevoTecnico): Promise<Tecnico> {
  const { data, error } = await supabase
    .from('tecnicos')
    .insert({ nombre: input.nombre, especialidad: input.especialidad || null, activo: input.activo })
    .select(COLS)
    .single();
  if (error) throw error;
  return mapTecnico(data as TecnicoRow);
}

export async function updateTecnico(t: Tecnico): Promise<Tecnico> {
  const { data, error } = await supabase
    .from('tecnicos')
    .update({ nombre: t.nombre, especialidad: t.especialidad || null, activo: t.activo })
    .eq('id', t.id)
    .select(COLS)
    .single();
  if (error) throw error;
  return mapTecnico(data as TecnicoRow);
}

export async function deleteTecnico(id: string): Promise<void> {
  const { error } = await supabase.from('tecnicos').delete().eq('id', id);
  if (error) throw error;
}
