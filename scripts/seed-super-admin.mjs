/**
 * Crea (o asegura) el super admin de la plataforma y, para tener un entorno
 * de prueba completo, el admin de la empresa de demostración ('emp-demo',
 * insertada por supabase/seed.sql). Idempotente: si los usuarios ya existen,
 * solo reajusta sus perfiles.
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-super-admin.mjs
 *
 * Variables opcionales: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD,
 * SUPER_ADMIN_NOMBRE, DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_ADMIN_NOMBRE.
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

if (!URL || !SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUsuario({ email, password, nombre }) {
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Error listando usuarios:', listErr.message);
    process.exit(1);
  }

  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (error) {
      console.error(`❌ Error creando el usuario ${email}:`, error.message);
      process.exit(1);
    }
    user = data.user;
    console.log(`✅ Usuario creado (${email}):`, user.id);
  } else {
    console.log(`ℹ️  El usuario ${email} ya existía:`, user.id);
  }
  return user;
}

// ── Super admin (dueño de la plataforma, sin empresa propia) ────────────────
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'super@ingenio.net';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'super123';
const SUPER_ADMIN_NOMBRE = process.env.SUPER_ADMIN_NOMBRE || 'Super Administrador';

const superUser = await ensureUsuario({
  email: SUPER_ADMIN_EMAIL,
  password: SUPER_ADMIN_PASSWORD,
  nombre: SUPER_ADMIN_NOMBRE,
});

const { error: superUpErr } = await admin
  .from('perfiles')
  .update({ rol: 'super_admin', activo: true, nombre: SUPER_ADMIN_NOMBRE, empresa_id: null })
  .eq('id', superUser.id);
if (superUpErr) {
  console.error('❌ Error actualizando el perfil de super admin:', superUpErr.message);
  process.exit(1);
}
console.log(`✅ Super admin listo. Acceso: ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);

// ── Admin de la empresa de demostración ('emp-demo') ─────────────────────────
const DEMO_ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL || 'admin@tallerejemplo.net';
const DEMO_ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'admin123';
const DEMO_ADMIN_NOMBRE = process.env.DEMO_ADMIN_NOMBRE || 'Administrador';
const TODOS_MODULOS = ['vehiculos', 'clientes', 'taller', 'alertas', 'rentabilidad', 'facturas', 'inventario', 'citas'];

const { data: empresaDemo, error: empresaErr } = await admin
  .from('empresas')
  .select('id')
  .eq('id', 'emp-demo')
  .single();
if (empresaErr || !empresaDemo) {
  console.error("❌ No existe la empresa 'emp-demo'. Ejecuta antes `supabase db reset` (aplica supabase/seed.sql).");
  process.exit(1);
}

const demoUser = await ensureUsuario({
  email: DEMO_ADMIN_EMAIL,
  password: DEMO_ADMIN_PASSWORD,
  nombre: DEMO_ADMIN_NOMBRE,
});

const { error: demoUpErr } = await admin
  .from('perfiles')
  .update({ rol: 'admin', activo: true, nombre: DEMO_ADMIN_NOMBRE, empresa_id: 'emp-demo', modulos: TODOS_MODULOS })
  .eq('id', demoUser.id);
if (demoUpErr) {
  console.error('❌ Error actualizando el perfil del admin de la empresa demo:', demoUpErr.message);
  process.exit(1);
}
console.log(`✅ Admin de empresa demo listo. Acceso: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD}`);
