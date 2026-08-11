/**
 * Autenticación del lado cliente.
 *
 * Las contraseñas nunca se almacenan en claro. Se hashean con SHA-256 usando
 * una sal fija (SALT) antes de guardarse en localStorage. La sal impide que
 * un volcado del almacenamiento sea directamente atacable con tablas
 * precalculadas (rainbow tables) de SHA-256 puro.
 *
 * Limitación conocida: este esquema protege contra miradas casuales al
 * localStorage, pero no es equivalente a autenticación en servidor. Para
 * un entorno multiusuario en producción real se debería añadir un backend.
 */

import { Usuario } from '../types';
import { getUsuarios, saveUsuarios } from '../data/mockData';

const SALT = 'ingenio-v1::';

/** Devuelve el hash hexadecimal SHA-256 de `SALT + password`. */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(SALT + password);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Devuelve true si `value` tiene el formato de un hash SHA-256 (64 hex). */
export const isHashed = (value: string): boolean => /^[a-f0-9]{64}$/.test(value);

/** Compara una contraseña en claro contra un hash almacenado. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  return (await hashPassword(password)) === storedHash;
}

/**
 * Migración única desde la versión anterior de la app, que guardaba las
 * contraseñas en texto plano bajo el campo `password`.
 *
 * Se ejecuta en cada inicio de sesión: detecta usuarios con `password` en
 * lugar de `passwordHash`, los convierte al nuevo formato y persiste el
 * cambio. En instalaciones ya migradas la función es un no-op instantáneo.
 */
export async function migrateLegacyPasswords(): Promise<void> {
  const usuarios = getUsuarios() as (Usuario & { password?: string })[];
  let changed = false;
  for (const u of usuarios) {
    if (!u.passwordHash && u.password) {
      u.passwordHash = isHashed(u.password) ? u.password : await hashPassword(u.password);
      delete u.password;
      changed = true;
    }
  }
  if (changed) saveUsuarios(usuarios);
}
