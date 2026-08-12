// Gestión de usuarios del Panel de Administración (por empresa).
//
// Crear, eliminar y resetear la contraseña de OTROS usuarios requiere la
// Auth Admin API (service_role) — son operaciones que no se pueden expresar
// con RLS. Esta función verifica que quien llama esté autenticado y tenga
// rol 'admin' (de su propia empresa) o 'super_admin', y que las operaciones
// de baja/reseteo se hagan siempre dentro de la misma empresa del objetivo
// (un admin nunca puede tocar usuarios de otra empresa; el super admin sí,
// como excepción de soporte).
//
// El resto de campos del perfil (nombre, rol, módulos, activo) se editan
// directamente desde el cliente vía la política RLS `perfiles_update_admin`.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    .select('rol, empresa_id')
    .eq('id', callerId)
    .single();
  if (perfilErr || !callerPerfil || !['admin', 'super_admin'].includes(callerPerfil.rol)) {
    return json({ error: 'Requiere permisos de administrador' }, 403);
  }
  const esSuperAdmin = callerPerfil.rol === 'super_admin';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de la petición inválido' }, 400);
  }

  const action = body.action;

  try {
    if (action === 'create') {
      const empresaId = callerPerfil.empresa_id;
      if (!empresaId) {
        return json({ error: 'El super admin no crea usuarios de empresa directamente; usa la gestión de empresas.' }, 400);
      }

      const email = String(body.email ?? '').trim();
      const password = String(body.password ?? '');
      const nombre = String(body.nombre ?? '').trim();
      const rol = body.rol === 'admin' ? 'admin' : 'usuario';
      const modulos = Array.isArray(body.modulos) ? body.modulos : [];
      const activo = body.activo !== false;

      if (!email || !nombre) return json({ error: 'Nombre y email son obligatorios.' }, 400);
      if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre },
      });
      if (createErr) return json({ error: createErr.message }, 400);

      // El trigger handle_new_user ya creó la fila en perfiles con valores
      // por defecto (empresa_id null); aquí se asigna a la empresa de quien
      // llama y se ajusta a lo que pidió el admin en el formulario.
      const { data: perfil, error: updateErr } = await admin
        .from('perfiles')
        .update({ nombre, rol, modulos, activo, empresa_id: empresaId })
        .eq('id', created.user!.id)
        .select('id, nombre, email, rol, modulos, activo, empresa_id')
        .single();
      if (updateErr) return json({ error: updateErr.message }, 400);

      return json({ perfil });
    }

    if (action === 'delete') {
      const id = String(body.id ?? '');
      if (!id) return json({ error: 'Falta el id del usuario.' }, 400);
      if (id === callerId) return json({ error: 'No puedes eliminar tu propio usuario.' }, 400);

      const { data: target, error: targetErr } = await admin
        .from('perfiles')
        .select('rol, empresa_id')
        .eq('id', id)
        .single();
      if (targetErr || !target) return json({ error: 'Usuario no encontrado.' }, 404);

      if (!esSuperAdmin && target.empresa_id !== callerPerfil.empresa_id) {
        return json({ error: 'No puedes eliminar usuarios de otra empresa.' }, 403);
      }

      if (target.rol === 'admin') {
        const { count, error: countErr } = await admin
          .from('perfiles')
          .select('id', { count: 'exact', head: true })
          .eq('rol', 'admin')
          .eq('empresa_id', target.empresa_id)
          .neq('id', id);
        if (countErr) return json({ error: countErr.message }, 400);
        if (!count) return json({ error: 'No puedes eliminar al último administrador de la empresa.' }, 400);
      }

      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) return json({ error: delErr.message }, 400);

      return json({ ok: true });
    }

    if (action === 'set_password') {
      const id = String(body.id ?? '');
      const password = String(body.password ?? '');
      if (!id) return json({ error: 'Falta el id del usuario.' }, 400);
      if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);

      if (!esSuperAdmin) {
        const { data: target, error: targetErr } = await admin
          .from('perfiles')
          .select('empresa_id')
          .eq('id', id)
          .single();
        if (targetErr || !target) return json({ error: 'Usuario no encontrado.' }, 404);
        if (target.empresa_id !== callerPerfil.empresa_id) {
          return json({ error: 'No puedes cambiar la contraseña de usuarios de otra empresa.' }, 403);
        }
      }

      const { error: pwErr } = await admin.auth.admin.updateUserById(id, { password });
      if (pwErr) return json({ error: pwErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: 'Acción no soportada.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
});
