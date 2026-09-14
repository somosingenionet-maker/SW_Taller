// Portal del Mecánico — enlace público, sin login, que ve el técnico del
// taller (no un usuario de la app). La seguridad no viene de un JWT de
// usuario (no existe: el técnico no tiene cuenta), sino de que `token`
// coincida con tecnicos.portal_token — a partir de ahí se usa la service
// role para leer/escribir solo los datos de ESE técnico, nunca vía RLS.
//
// Nota: la asignación de técnico en una OT se guarda por nombre
// (ordenes_trabajo.tecnico_asignado), no por id — se respeta ese mismo
// criterio aquí para no introducir un segundo modelo de asignación.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

type Tecnico = { id: string; empresa_id: string; nombre: string };

async function manejarGet(admin: SupabaseClient, tecnico: Tecnico) {
  const { data: empresa } = await admin
    .from('empresas')
    .select('nombre, brand_color, logo_url')
    .eq('id', tecnico.empresa_id)
    .single();

  type OtRow = {
    id: string; numero: string; vehiculo_id: string; estado: string; descripcion_problema: string;
  };
  const { data: ordenesData } = await admin
    .from('ordenes_trabajo')
    .select('id, numero, vehiculo_id, estado, descripcion_problema')
    .eq('empresa_id', tecnico.empresa_id)
    .eq('tecnico_asignado', tecnico.nombre)
    .in('estado', ['recibido', 'en_reparacion'])
    .order('created_at', { ascending: false });
  const ordenes = (ordenesData ?? []) as OtRow[];

  const vehiculoIds = [...new Set(ordenes.map(o => o.vehiculo_id))];
  const { data: vehiculos } = vehiculoIds.length
    ? await admin.from('vehiculos').select('id, marca, modelo, matricula').in('id', vehiculoIds)
    : { data: [] };

  const otIds = ordenes.map(o => o.id);
  const { data: lineas } = otIds.length
    ? await admin
        .from('lineas_ot')
        .select('id, ot_id, descripcion, completado, posicion')
        .in('ot_id', otIds)
        .eq('tipo', 'mano_de_obra')
        .order('posicion')
    : { data: [] };

  return json({
    empresa: empresa ? { nombre: empresa.nombre, brandColor: empresa.brand_color, logoUrl: empresa.logo_url } : null,
    tecnico: { nombre: tecnico.nombre },
    ordenes: ordenes.map(o => {
      const v = (vehiculos ?? []).find(x => x.id === o.vehiculo_id);
      return {
        id: o.id,
        numero: o.numero,
        estado: o.estado,
        descripcionProblema: o.descripcion_problema,
        vehiculo: v ? { marca: v.marca, modelo: v.modelo, matricula: v.matricula } : null,
        tareas: (lineas ?? [])
          .filter(l => l.ot_id === o.id)
          .map(l => ({ id: l.id, descripcion: l.descripcion, completado: l.completado })),
      };
    }),
  });
}

async function manejarMarcarTarea(admin: SupabaseClient, tecnico: Tecnico, lineaId: string, completado: boolean) {
  const { data: linea, error: lErr } = await admin
    .from('lineas_ot')
    .select('id, ot_id')
    .eq('id', lineaId)
    .maybeSingle();
  if (lErr || !linea) return json({ error: 'Tarea no encontrada.' }, 404);

  const { data: ot, error: otErr } = await admin
    .from('ordenes_trabajo')
    .select('id, empresa_id, tecnico_asignado')
    .eq('id', linea.ot_id)
    .maybeSingle();
  if (otErr || !ot) return json({ error: 'Orden no encontrada.' }, 404);
  if (ot.empresa_id !== tecnico.empresa_id || ot.tecnico_asignado !== tecnico.nombre) {
    return json({ error: 'No autorizado.' }, 403);
  }

  const { error: updErr } = await admin.from('lineas_ot').update({ completado }).eq('id', lineaId);
  if (updErr) return json({ error: 'No se pudo guardar.' }, 500);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de la petición inválido.' }, 400);
  }

  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'Falta el enlace.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: tecnico, error: tecnicoErr } = await admin
    .from('tecnicos')
    .select('id, empresa_id, nombre')
    .eq('portal_token', token)
    .maybeSingle();
  if (tecnicoErr) return json({ error: 'Error interno.' }, 500);
  if (!tecnico) return json({ error: 'Este enlace no es válido.' }, 404);

  if (body.action === 'marcar_tarea') {
    return manejarMarcarTarea(admin, tecnico, String(body.lineaId ?? ''), Boolean(body.completado));
  }

  return manejarGet(admin, tecnico);
});
