import { supabase } from './supabase';
import type { Perfil, ModuloId } from '../types';

/** Inicia sesión con email y contraseña. Devuelve un mensaje de error o null. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) {
    // Mensaje genérico para no filtrar si el email existe o no.
    return 'Credenciales incorrectas. Verifica tu email y contraseña.';
  }
  return null;
}

/** Cierra la sesión actual. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Carga el perfil de negocio (rol, módulos, activo) del usuario autenticado.
 * Devuelve null si no hay sesión o el perfil no existe.
 */
export async function fetchPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, email, rol, modulos, activo')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    email: data.email ?? '',
    rol: data.rol as Perfil['rol'],
    modulos: (data.modulos ?? []) as ModuloId[],
    activo: data.activo,
  };
}
