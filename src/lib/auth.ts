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
 * Envía el email de recuperación de contraseña. Nunca revela si el email
 * existe o no en el sistema (mismo mensaje de éxito en ambos casos, para no
 * filtrar cuentas registradas) — solo se reporta un error de red/servidor.
 */
export async function sendPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: window.location.origin,
  });
  if (error) return 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.';
  return null;
}

/** Establece una nueva contraseña durante el flujo de recuperación (sesión de recuperación ya activa). */
export async function updatePassword(password: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return error.message;
  return null;
}

/**
 * Carga el perfil de negocio (rol, módulos, activo) del usuario autenticado.
 * Devuelve null si no hay sesión o el perfil no existe.
 */
export async function fetchPerfil(userId: string): Promise<Perfil | null> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, empresa_id, nombre, email, rol, modulos, activo')
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    empresaId: data.empresa_id,
    nombre: data.nombre,
    email: data.email ?? '',
    rol: data.rol as Perfil['rol'],
    modulos: (data.modulos ?? []) as ModuloId[],
    activo: data.activo,
  };
}
