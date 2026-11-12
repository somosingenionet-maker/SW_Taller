import type { Session } from '@supabase/supabase-js';
import { supabase, crearClienteSinSesion } from './supabase';
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
 * Cambia la contraseña de la cuenta en curso, desde dentro de la aplicación. Antes comprueba la
 * contraseña actual, para que una sesión abierta y desatendida no baste para cambiarla. La
 * comprobación se hace con un cliente aparte: la sesión en curso (y su segundo factor) no se toca.
 * Devuelve el mensaje de error, o null si se cambió.
 */
export async function cambiarPassword(actual: string, nueva: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email;
  if (!email) return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';

  const comprobador = crearClienteSinSesion();
  const { error: errActual } = await comprobador.auth.signInWithPassword({ email, password: actual });
  if (errActual) return mensajeCambioPassword(errActual.message, 'actual');
  // Solo la sesión de comprobación: el cierre por defecto («global») cerraría también la del usuario.
  await comprobador.auth.signOut({ scope: 'local' }).catch(() => undefined);

  const { error } = await supabase.auth.updateUser({ password: nueva });
  return error ? mensajeCambioPassword(error.message, 'nueva') : null;
}

/** Traduce los errores del servidor al cambiar la contraseña. `paso`: en cuál de las dos llamadas falló. */
export function mensajeCambioPassword(mensaje: string, paso: 'actual' | 'nueva'): string {
  if (/failed to fetch|networkerror|load failed/i.test(mensaje)) return 'No hay conexión con el servidor. Comprueba tu internet y vuelve a intentarlo.';
  if (/rate limit|too many/i.test(mensaje)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  if (paso === 'actual') {
    return /invalid login credentials/i.test(mensaje) ? 'La contraseña actual no es correcta.' : 'No se pudo comprobar la contraseña actual. Inténtalo de nuevo.';
  }
  if (/different from the old|same_password/i.test(mensaje)) return 'La nueva contraseña debe ser distinta de la actual.';
  if (/reauthentication|reauthenticate/i.test(mensaje)) return 'Por seguridad, cierra sesión, vuelve a entrar y repite el cambio.';
  if (/weak|pwned|known to be/i.test(mensaje)) return 'Esa contraseña es demasiado fácil de adivinar o ha aparecido en filtraciones. Elige otra.';
  if (/aal2|mfa/i.test(mensaje)) return 'Para cambiar la contraseña necesitas haber entrado con tu código de verificación en dos pasos.';
  return 'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
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

// ---------------------------------------------------------------------------
// Segundo factor (MFA con app autenticadora, TOTP)
// ---------------------------------------------------------------------------
// La base de datos y las Edge Functions ya exigen el segundo factor a quien lo tiene activado
// (migración mfa_exigido_en_servidor); estas funciones son la parte de pantalla.

/** Nivel de aseguramiento del token ('aal1' = solo contraseña, 'aal2' = contraseña + código). */
export function aalDelToken(accessToken: string): string {
  try {
    const payload = accessToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const aal = JSON.parse(json).aal;
    return typeof aal === 'string' ? aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

/** true si el usuario tiene un factor verificado pero esta sesión aún no ha pasado el código. */
export function mfaPendiente(session: Pick<Session, 'access_token' | 'user'> | null): boolean {
  if (!session) return false;
  if (aalDelToken(session.access_token) === 'aal2') return false;
  return (session.user.factors ?? []).some((f) => f.status === 'verified' && f.factor_type === 'totp');
}

export interface FactorTotp { id: string; nombre: string; creado: string }

const ERROR_CODIGO = 'Código incorrecto. Comprueba que el reloj del móvil esté en hora e inténtalo de nuevo.';

/** Factores TOTP ya verificados del usuario actual. */
export async function listarFactoresTotp(): Promise<FactorTotp[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error('No se pudo consultar la verificación en dos pasos.');
  return data.totp.map((f) => ({ id: f.id, nombre: f.friendly_name ?? 'Aplicación autenticadora', creado: f.created_at }));
}

/**
 * El cliente de Supabase devuelve el QR como "data:image/svg+xml;utf-8,<svg…>" SIN codificar: si el
 * SVG trae un "#" (colores) el navegador lo corta como si fuera un fragmento y la imagen no carga.
 */
export function qrComoImagen(qr: string): string {
  const svg = qr.replace(/^data:image\/svg\+xml;(?:charset=)?utf-8,/i, '');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface AltaTotp { factorId: string; qr: string; secreto: string }

/** Empieza el alta de un factor: devuelve el QR y la clave para escribirla a mano. */
export async function iniciarAltaTotp(): Promise<AltaTotp> {
  // Un alta abandonada deja un factor sin verificar que bloquearía el siguiente intento.
  const { data: previos } = await supabase.auth.mfa.listFactors();
  for (const f of previos?.all ?? []) {
    if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Doonty ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  });
  if (error || !data) {
    throw new Error(
      /disabled|not enabled|not allowed/i.test(error?.message ?? '')
        ? 'La verificación en dos pasos aún no está activada en el servidor.'
        : 'No se pudo iniciar la activación. Inténtalo de nuevo.',
    );
  }
  return { factorId: data.id, qr: qrComoImagen(data.totp.qr_code), secreto: data.totp.secret };
}

/** Comprueba el código (alta o inicio de sesión). Devuelve un mensaje de error o null. */
export async function verificarCodigoMfa(factorId: string, codigo: string): Promise<string | null> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, '') });
  if (error) return /rate|too many/i.test(error.message) ? 'Demasiados intentos. Espera un momento.' : ERROR_CODIGO;
  return null;
}

/** Quita un factor (requiere haber pasado el segundo factor en esta sesión). */
export async function quitarFactor(factorId: string): Promise<string | null> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? 'No se pudo desactivar. Vuelve a iniciar sesión e inténtalo de nuevo.' : null;
}
