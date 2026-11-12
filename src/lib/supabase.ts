import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y rellena las claves.'
  );
}

/** Cliente Supabase tipado con el esquema de la base de datos. */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Cliente aparte, sin sesión guardada, solo para comprobar una contraseña (cambio de contraseña desde
 * dentro). Iniciar sesión con el cliente principal sustituiría la sesión en curso por una nueva sin
 * segundo factor y dejaría fuera, a mitad de trabajo, a quien tiene la verificación en dos pasos.
 */
export function crearClienteSinSesion() {
  return createClient<Database>(url as string, anonKey as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'doonty-comprobacion' },
  });
}
