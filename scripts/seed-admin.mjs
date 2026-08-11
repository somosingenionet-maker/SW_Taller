/**
 * Crea (o asegura) el usuario administrador en Supabase Auth.
 * Idempotente: si el usuario ya existe, solo reajusta su perfil a admin.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-admin.mjs
 *
 * Variables opcionales: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE.
 *
 * ⚠️ Requiere la SERVICE_ROLE_KEY (clave secreta de servidor). No la ejecutes
 *    nunca en el navegador ni la subas a git.
 */
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

// Node < 22 no trae WebSocket global; se lo damos al cliente de Supabase.
globalThis.WebSocket ??= ws;

const URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ingenio.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NOMBRE = process.env.ADMIN_NOMBRE || 'Administrador';
const TODOS_MODULOS = ['vehiculos', 'clientes', 'taller', 'alertas', 'rentabilidad', 'facturas'];

if (!URL || !SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) {
  console.error('❌ Error listando usuarios:', listErr.message);
  process.exit(1);
}

let user = list.users.find((u) => u.email === ADMIN_EMAIL);

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { nombre: ADMIN_NOMBRE },
  });
  if (error) {
    console.error('❌ Error creando el usuario admin:', error.message);
    process.exit(1);
  }
  user = data.user;
  console.log('✅ Usuario admin creado:', user.id);
} else {
  console.log('ℹ️  El usuario admin ya existía:', user.id);
}

// El perfil se crea automáticamente por trigger; lo elevamos a admin.
const { error: upErr } = await admin
  .from('perfiles')
  .update({ rol: 'admin', activo: true, nombre: ADMIN_NOMBRE, modulos: TODOS_MODULOS })
  .eq('id', user.id);
if (upErr) {
  console.error('❌ Error actualizando el perfil admin:', upErr.message);
  process.exit(1);
}

console.log(`✅ Perfil admin listo. Acceso: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
