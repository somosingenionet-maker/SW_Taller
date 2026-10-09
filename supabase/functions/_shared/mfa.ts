// Segundo factor (MFA/TOTP) en las Edge Functions. Estas funciones validan el token del usuario
// y luego consultan con la clave de servicio, que se salta RLS: la regla de la base de datos
// ("sin segundo factor, sin datos") no las alcanza, así que se repite aquí.
//
// Un usuario con un factor TOTP verificado debe presentar un token con aal = 'aal2' (sesión que
// ya ha pasado el código); con solo la contraseña el token es 'aal1' y se rechaza.

/** Nivel de aseguramiento (aal) del token; solo se llama con un token ya validado por getUser(). */
export function aalDelToken(token: string): string {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const aal = JSON.parse(json).aal;
    return typeof aal === 'string' ? aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

interface AdminConMfa {
  auth: { admin: { mfa: { listFactors(p: { userId: string }): Promise<{ data: { factors?: { status: string; factor_type?: string }[] } | null; error: unknown }> } } };
}

/**
 * true si hay que rechazar la petición: el usuario tiene un factor TOTP verificado pero su sesión
 * no lo ha usado. Si no se puede comprobar, se rechaza (mejor un error que saltarse el MFA).
 */
export async function falta2Factor(admin: AdminConMfa, token: string, userId: string): Promise<boolean> {
  if (aalDelToken(token) === 'aal2') return false;
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error || !data) return true;
  return (data.factors ?? []).some((f) => f.status === 'verified');
}

export const MENSAJE_2FACTOR = 'Verifica tu segundo factor de autenticación para continuar.';
