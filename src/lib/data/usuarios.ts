import { supabase } from '../supabase';
import type { Perfil, ModuloId } from '../../types';

const SELECT = 'id, nombre, email, rol, modulos, activo';

export async function listUsuarios(): Promise<Perfil[]> {
  const { data, error } = await supabase.from('perfiles').select(SELECT).order('nombre');
  if (error) throw error;
  return (data ?? []) as Perfil[];
}

export interface PerfilPatch {
  nombre?: string;
  rol?: 'admin' | 'usuario';
  modulos?: ModuloId[];
  activo?: boolean;
}

export async function updateUsuario(id: string, patch: PerfilPatch): Promise<Perfil> {
  const { data, error } = await supabase.from('perfiles').update(patch).eq('id', id).select(SELECT).single();
  if (error) throw error;
  return data as Perfil;
}

async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // el cuerpo de error no era JSON; se mantiene el mensaje genérico
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export interface NuevoUsuarioInput {
  email: string;
  password: string;
  nombre: string;
  rol: 'admin' | 'usuario';
  modulos: ModuloId[];
  activo: boolean;
}

export async function createUsuario(input: NuevoUsuarioInput): Promise<Perfil> {
  const { perfil } = await invokeAdminUsers<{ perfil: Perfil }>({ action: 'create', ...input });
  return perfil;
}

export async function deleteUsuario(id: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'delete', id });
}

export async function setUsuarioPassword(id: string, password: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'set_password', id, password });
}
