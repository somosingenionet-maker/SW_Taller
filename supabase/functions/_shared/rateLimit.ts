// Rate limiting compartido por los portales públicos. El prefijo `_` en el
// nombre de carpeta es la convención de Supabase para "no es una función
// propia, es código compartido importado por otras" — el CLI no intenta
// desplegarla como función independiente, pero sí la incluye (junto con
// cualquier otro import relativo) cuando empaqueta la función que la usa.
import { SupabaseClient } from 'npm:@supabase/supabase-js@2';

// Toma la IP real del cliente del header que pone el proxy de Supabase/Deno
// Deploy. Si viene una cadena de proxies (varias IPs separadas por coma), la
// primera es la del cliente original.
export function extraerIp(headerXForwardedFor: string | null): string {
  return headerXForwardedFor?.split(',')[0]?.trim() || 'desconocida';
}

// Comprueba y registra la petición contra la tabla rate_limits (vía la
// función atómica check_rate_limit). Si el propio chequeo falla (p. ej. la
// tabla no existe todavía, o un error de red), se deja pasar la petición en
// vez de bloquear a un usuario legítimo por un fallo de infraestructura
// ajeno a él — el rate limiting es defensa en profundidad, no la única
// barrera (esa sigue siendo el token en sí).
export async function permitirPeticion(
  admin: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('check_rate_limit falló, dejando pasar la petición:', error.message);
    return true;
  }
  return data === true;
}
