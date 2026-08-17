// Gestión de empresas (tenants) — solo super admin.
//
// Alta y baja de empresas requieren la Auth Admin API (service_role): al
// crear una empresa hay que crear también su primer usuario admin, y al
// eliminarla hay que eliminar los usuarios de Supabase Auth de esa empresa
// (borrar `perfiles` o `empresas` por SQL no borra `auth.users`, y dejar
// usuarios huérfanos sería un agujero de seguridad). Nada de esto es
// expresable con RLS.
//
// Activar/desactivar una empresa y listarlas SÍ se hacen directamente desde
// el cliente vía RLS (el super admin tiene acceso total a `empresas`).
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Política mínima de contraseña — debe mantenerse igual que
// src/utils/password.ts (no se puede importar entre proyectos Deno/Vite).
function errorPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula.';
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una minúscula.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData.user) return json({ error: 'Sesión inválida' }, 401);
  const callerId = callerData.user.id;

  const { data: callerPerfil, error: perfilErr } = await admin
    .from('perfiles')
    .select('rol')
    .eq('id', callerId)
    .single();
  if (perfilErr || callerPerfil?.rol !== 'super_admin') {
    return json({ error: 'Requiere permisos de super administrador' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de la petición inválido' }, 400);
  }

  const action = body.action;

  try {
    if (action === 'create_empresa') {
      const nombre = String(body.nombre ?? '').trim();
      const nif = String(body.nif ?? '').trim();
      const adminEmail = String(body.adminEmail ?? '').trim();
      const adminPassword = String(body.adminPassword ?? '');
      const adminNombre = String(body.adminNombre ?? '').trim();

      if (!nombre) return json({ error: 'El nombre de la empresa es obligatorio.' }, 400);
      if (!adminEmail || !adminNombre) return json({ error: 'Nombre y email del administrador son obligatorios.' }, 400);
      const errPw = errorPassword(adminPassword);
      if (errPw) return json({ error: errPw }, 400);

      const { data: empresa, error: empresaErr } = await admin
        .from('empresas')
        .insert({ nombre, nif })
        .select('id, nombre, tagline, razon_social, nif, direccion_fiscal, correo, telefono, web, ciudad, brand_color, logo_base64, activo, recordatorios_automaticos_activos')
        .single();
      if (empresaErr) return json({ error: empresaErr.message }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { nombre: adminNombre },
      });
      if (createErr) {
        // Revertir la empresa creada para no dejar tenants huérfanos sin admin.
        await admin.from('empresas').delete().eq('id', empresa.id);
        return json({ error: createErr.message }, 400);
      }

      const { error: updateErr } = await admin
        .from('perfiles')
        .update({ nombre: adminNombre, rol: 'admin', empresa_id: empresa.id, activo: true })
        .eq('id', created.user!.id);
      if (updateErr) {
        await admin.auth.admin.deleteUser(created.user!.id);
        await admin.from('empresas').delete().eq('id', empresa.id);
        return json({ error: updateErr.message }, 400);
      }

      return json({ empresa });
    }

    if (action === 'delete_empresa') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Falta el id de la empresa.' }, 400);

      const { data: usuarios, error: usuariosErr } = await admin
        .from('perfiles')
        .select('id')
        .eq('empresa_id', id);
      if (usuariosErr) return json({ error: usuariosErr.message }, 400);

      // Borrar cada usuario de Auth cascada su fila en `perfiles`. Después se
      // borra la empresa, que cascada el resto de tablas de negocio (FK
      // on delete cascade en vehiculos/clientes/ordenes_trabajo/...).
      for (const u of usuarios ?? []) {
        const { error: delUserErr } = await admin.auth.admin.deleteUser(u.id);
        if (delUserErr) return json({ error: `Error eliminando usuario ${u.id}: ${delUserErr.message}` }, 400);
      }

      const { error: delEmpresaErr } = await admin.from('empresas').delete().eq('id', id);
      if (delEmpresaErr) return json({ error: delEmpresaErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: 'Acción no soportada.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});
