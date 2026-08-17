import { supabase } from '../supabase';
import type { Perfil, ModuloId } from '../../types';

const SELECT = 'id, empresa_id, nombre, email, rol, modulos, activo';

type PerfilRow = {
  id: string; empresa_id: string | null; nombre: string; email: string | null;
  rol: string; modulos: string[]; activo: boolean;
};

function mapPerfil(r: PerfilRow): Perfil {
  return {
    id: r.id,
    empresaId: r.empresa_id,
    nombre: r.nombre,
    email: r.email ?? '',
    rol: r.rol as Perfil['rol'],
    modulos: (r.modulos ?? []) as ModuloId[],
    activo: r.activo,
  };
}

/**
 * Devuelve los usuarios de la propia empresa (o de todas, si quien llama es
 * super admin) — filtrado por RLS. El super admin puede además acotar a una
 * empresa concreta pasando `empresaId` (panel de soporte por empresa).
 */
export async function listUsuarios(empresaId?: string): Promise<Perfil[]> {
  let query = supabase.from('perfiles').select(SELECT).order('nombre');
  if (empresaId) query = query.eq('empresa_id', empresaId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => mapPerfil(r as PerfilRow));
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
  return mapPerfil(data as PerfilRow);
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
  const { perfil } = await invokeAdminUsers<{ perfil: PerfilRow }>({ action: 'create', ...input });
  return mapPerfil(perfil);
}

export async function deleteUsuario(id: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'delete', id });
}

export async function setUsuarioPassword(id: string, password: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'set_password', id, password });
}

export async function setUsuarioEmail(id: string, email: string): Promise<void> {
  await invokeAdminUsers<{ ok: true }>({ action: 'set_email', id, email });
}
