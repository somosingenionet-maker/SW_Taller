// Gestión de las citas online por el taller (con la sesión del usuario): confirmar una cita pendiente o cancelarla.
// Además de cambiar el estado, avisa por correo al cliente. Las citas que no son online se cambian desde la Agenda
// como siempre.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';
import { perfilTieneModulo, mensajeSinModulo } from '../_shared/modulos.ts';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { construirCorreoCita } from '../_shared/correoCitas.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { fechaHoraLarga } from '../reservas-publicas/logic.ts';

initSentry('reservas-gestion');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

async function manejar(admin: SupabaseClient, req: Request, accion: string, citaId: string) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return json({ error: 'Sesión inválida' }, 401);
  if (await falta2Factor(admin, token, caller.user.id)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: perfil } = await admin.from('perfiles').select('empresa_id, rol, modulos, activo').eq('id', caller.user.id).single();
  if (!perfil?.empresa_id) return json({ error: 'No autorizado' }, 403);
  if (!perfilTieneModulo(perfil, 'citas')) return json({ error: mensajeSinModulo('Agenda') }, 403);
  if (accion !== 'confirmar' && accion !== 'cancelar') return json({ error: 'Acción no reconocida.' }, 400);
  if (!citaId) return json({ error: 'Falta la cita.' }, 400);

  const { data: cita } = await admin.from('citas')
    .select('id, empresa_id, fecha_hora, duracion_minutos, estado, origen, contacto_nombre, contacto_correo, vehiculo_descripcion, motivo, token_cliente, tipo_cita_id')
    .eq('id', citaId).maybeSingle();
  if (!cita) return json({ error: 'Cita no encontrada.' }, 404);
  if (cita.empresa_id !== perfil.empresa_id) return json({ error: 'No autorizado' }, 403);

  const { data: empresa } = await admin.from('empresas').select('nombre, brand_color, logo_url, correo, telefono, acceso_hasta').eq('id', cita.empresa_id).single();
  if (!empresa) return json({ error: 'Empresa no encontrada.' }, 404);
  // Las funciones con service role se saltan el bloqueo de solo lectura de la base: aquí se respeta igual.
  if (empresa.acceso_hasta && new Date(empresa.acceso_hasta) < new Date()) {
    return json({ error: 'Tu periodo de prueba o tu suscripción ha terminado. Suscríbete desde el botón «Suscripción».' }, 403);
  }

  if (accion === 'confirmar') {
    if (cita.estado !== 'pendiente') return json({ error: 'Solo se pueden confirmar las citas pendientes.' }, 400);
  } else if (cita.estado === 'cancelada' || cita.estado === 'convertida') {
    return json({ error: cita.estado === 'cancelada' ? 'Esta cita ya está cancelada.' : 'Esta cita ya se convirtió en una orden.' }, 400);
  }

  const cambios = accion === 'confirmar' ? { estado: 'confirmada' } : { estado: 'cancelada', cancelada_por: 'taller' };
  const { data: hecha, error } = await admin.from('citas').update(cambios).eq('id', cita.id).eq('estado', cita.estado).select('id');
  if (error || !hecha?.length) return json({ error: 'No se pudo actualizar la cita. Recarga la Agenda.' }, 409);

  // Aviso al cliente solo si hay correo (las citas del taller sin correo se gestionan por teléfono).
  let avisado = false;
  const correo = cita.contacto_correo as string | null;
  if (correo && CORREO_VALIDO.test(correo)) {
    const tipo = cita.tipo_cita_id ? (await admin.from('tipos_cita').select('nombre').eq('id', cita.tipo_cita_id).maybeSingle()).data?.nombre ?? null : null;
    const { asunto, html } = construirCorreoCita(accion === 'confirmar' ? 'cliente_confirmada_taller' : 'cliente_cancelada_taller', {
      empresa, nombre: cita.contacto_nombre ?? 'cliente', cuando: fechaHoraLarga(new Date(cita.fecha_hora).getTime()), tipo,
      vehiculo: cita.vehiculo_descripcion, motivo: cita.motivo, duracionMin: cita.duracion_minutos,
      enlace: accion === 'confirmar' && cita.token_cliente ? `${APP_URL}/cita/${cita.token_cliente}` : null,
    });
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${empresa.nombre.replace(/[<>"]/g, '').trim() || 'Taller'} <${RESEND_FROM_EMAIL}>`, to: [correo], subject: asunto, html,
          ...(empresa.correo && CORREO_VALIDO.test(empresa.correo) ? { reply_to: empresa.correo } : {}),
        }),
      });
      avisado = r.ok;
      if (!r.ok) Sentry.captureException(new Error(`Resend ${r.status}`));
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
    }
  }
  return json({ ok: true, avisado });
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido.' }, 400); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return manejar(admin, req, String(body.action ?? ''), String(body.citaId ?? ''));
}, CORS_HEADERS));
