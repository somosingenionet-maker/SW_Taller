// Verificación de Cloudflare Turnstile (captcha invisible) para los formularios públicos.
// La clave secreta vive en los secretos de Supabase (TURNSTILE_SECRET_KEY); la clave pública va en la web.
export const URL_VERIFICACION = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type Fetch = (entrada: string, init?: RequestInit) => Promise<Response>;

/**
 * ¿Pasó el desafío? Falla CERRADO: sin token, sin clave o ante cualquier error de red o respuesta rara, devuelve false.
 * (Cloudflare permite hasta 2048 caracteres de token.)
 */
export async function verificarTurnstile(
  token: unknown, ip: string | null, secreto: string | undefined, peticion: Fetch = fetch,
): Promise<boolean> {
  if (!secreto || typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;
  try {
    const cuerpo = new URLSearchParams({ secret: secreto, response: token });
    if (ip) cuerpo.set('remoteip', ip);
    const r = await peticion(URL_VERIFICACION, { method: 'POST', body: cuerpo });
    if (!r.ok) return false;
    const j = await r.json();
    return j?.success === true;
  } catch {
    return false;
  }
}
