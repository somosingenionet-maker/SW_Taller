/**
 * Política mínima de seguridad para toda contraseña de la plataforma
 * (usuarios de empresa, admins, super admin). Se valida aquí en cliente
 * (feedback inmediato) y de forma duplicada en las Edge Functions
 * admin-users / manage-empresas (fuente de verdad real — el cliente se
 * puede saltar). Si se cambia la regla, hay que actualizar los tres sitios.
 */
export function validarPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula.';
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una minúscula.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

export const REQUISITOS_PASSWORD = 'Mín. 8 caracteres, con mayúscula, minúscula y número.';

/** Valida el formulario «cambiar mi contraseña». Devuelve el mensaje de error o null si es válido. */
export function validarCambioPassword(f: { actual: string; nueva: string; repetir: string }): string | null {
  if (!f.actual) return 'Escribe tu contraseña actual.';
  const errNueva = validarPassword(f.nueva);
  if (errNueva) return errNueva.replace('La contraseña', 'La nueva contraseña');
  if (f.nueva === f.actual) return 'La nueva contraseña debe ser distinta de la actual.';
  if (f.nueva !== f.repetir) return 'Las contraseñas nuevas no coinciden.';
  return null;
}
