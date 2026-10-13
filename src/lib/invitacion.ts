// El enlace del correo de invitación/alta abre la app con `#…type=invite` (o `?type=invite`).
// Supabase borra ese fragmento en cuanto lee la sesión, así que se captura al cargar la página,
// antes de que se cree el cliente de Supabase (este módulo debe importarse el primero en main.tsx).
const url = typeof window !== 'undefined' ? window.location.hash + window.location.search : '';

/** true si el usuario llega desde el enlace de invitación y debe elegir su contraseña. */
export const llegaDeInvitacion = /(^|[#&?])type=invite(&|$)/.test(url);

/** Mensaje si el enlace del correo ya caducó o se usó; null en caso contrario. */
export const errorDeEnlace: string | null = /error_code=otp_expired|error=access_denied/.test(url)
  ? 'El enlace del correo ha caducado o ya se usó. Pulsa «¿Olvidaste tu contraseña?» para recibir uno nuevo.'
  : null;
