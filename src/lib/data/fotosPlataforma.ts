import { supabase } from '../supabase';

export interface UsoEmpresa { empresaId: string; bytes: number; archivos: number }

/** Interruptor general del borrado de fotos y fecha antes de la cual no se borra nada. */
export async function getConfigFotos(): Promise<{ activo: boolean; noAntesDe: string | null }> {
  const { data, error } = await supabase.from('plataforma_config').select('fotos_borrado_activo, fotos_borrado_no_antes_de').eq('id', 'global').single();
  if (error) throw new Error(error.message);
  return { activo: data.fotos_borrado_activo, noAntesDe: data.fotos_borrado_no_antes_de };
}

export async function setBorradoFotosActivo(activo: boolean): Promise<void> {
  const { error } = await supabase.from('plataforma_config').update({ fotos_borrado_activo: activo }).eq('id', 'global');
  if (error) throw new Error(error.message);
}

/** Espacio por taller (el super administrador ve todos), de mayor a menor. */
export async function listUsoAlmacenamiento(): Promise<UsoEmpresa[]> {
  const { data, error } = await supabase.rpc('uso_almacenamiento');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { empresa_id: string; bytes: number; archivos: number }[])
    .map((f) => ({ empresaId: f.empresa_id, bytes: Number(f.bytes), archivos: Number(f.archivos) }))
    .sort((a, b) => b.bytes - a.bytes);
}
