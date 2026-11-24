// Envío del presupuesto al cliente. Lo llama la app (con la sesión del usuario) al pulsar «Enviar al cliente»:
// garantiza que el cliente tiene enlace a su portal, marca el presupuesto como enviado (desde ese momento el
// cliente puede aceptarlo o rechazarlo allí) y, si se pide, le manda el correo con el enlace.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';
import { perfilTieneModulo, mensajeSinModulo } from '../_shared/modulos.ts';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { initSentry, conSentry } from '../_shared/sentry.ts';
import { construirCorreoPresupuesto, ESTADOS_PRESUPUESTABLES, motivoNoEnviable } from './logic.ts';

initSentry('presupuesto-enviar');

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

async function enviarCorreo(nombreTaller: string, replyTo: string | null, destinatario: string, asunto: string, html: string) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${nombreTaller.replace(/[<>"]/g, '').trim() || 'Taller'} <${RESEND_FROM_EMAIL}>`,
      to: [destinatario], subject: asunto, html,
      ...(replyTo && CORREO_VALIDO.test(replyTo) ? { reply_to: replyTo } : {}),
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

async function manejarEnviar(admin: SupabaseClient, req: Request, otId: string, porCorreo: boolean) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return json({ error: 'Sesión inválida' }, 401);
  if (await falta2Factor(admin, token, caller.user.id)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: perfil } = await admin.from('perfiles').select('empresa_id, rol, modulos, activo').eq('id', caller.user.id).single();
  if (!perfil?.empresa_id) return json({ error: 'No autorizado' }, 403);
  if (!perfilTieneModulo(perfil, 'taller')) return json({ error: mensajeSinModulo('Taller') }, 403);
  if (!otId) return json({ error: 'Falta la orden.' }, 400);

  const { data: ot } = await admin.from('ordenes_trabajo')
    .select('id, empresa_id, numero, estado, total, cliente_id, vehiculo_id, presupuesto_estado, presupuesto_aprobado, aceptacion_presupuesto_en, presupuesto_enviado_en, presupuesto_recordatorios, presupuesto_recordado_en')
    .eq('id', otId).maybeSingle();
  if (!ot) return json({ error: 'Orden no encontrada.' }, 404);
  if (ot.empresa_id !== perfil.empresa_id) return json({ error: 'No autorizado' }, 403);

  const { data: empresa } = await admin.from('empresas')
    .select('id, nombre, brand_color, logo_url, correo, telefono, acceso_hasta').eq('id', ot.empresa_id).single();
  if (!empresa) return json({ error: 'Empresa no encontrada.' }, 404);
  // Las funciones con service role se saltan el bloqueo de solo lectura de la base: aquí se respeta igual.
  if (empresa.acceso_hasta && new Date(empresa.acceso_hasta) < new Date()) {
    return json({ error: 'Tu periodo de prueba o tu suscripción ha terminado. Suscríbete desde el botón «Suscripción» para enviar presupuestos.' }, 403);
  }

  const motivo = motivoNoEnviable(ot);
  if (motivo) return json({ error: motivo }, 400);

  const { data: cliente } = await admin.from('clientes').select('id, nombre, correo, portal_token').eq('id', ot.cliente_id).single();
  if (!cliente) return json({ error: 'Cliente no encontrado.' }, 404);
  if (porCorreo && !(cliente.correo && CORREO_VALIDO.test(cliente.correo))) {
    return json({ error: 'El cliente no tiene un correo válido en su ficha. Envíale el enlace de otra forma o corrige el correo.' }, 400);
  }

  let portalToken: string = cliente.portal_token ?? '';
  if (!portalToken) {
    portalToken = crypto.randomUUID();
    const { error } = await admin.from('clientes').update({ portal_token: portalToken }).eq('id', cliente.id);
    if (error) return json({ error: 'No se pudo crear el enlace del cliente.' }, 500);
  }
  const enlace = `${APP_URL}/portal/${portalToken}`;

  // Se marca como enviado ANTES de mandar el correo (y solo si seguía igual): dos clics seguidos no envían dos veces.
  const anterior = {
    presupuesto_estado: ot.presupuesto_estado, presupuesto_aprobado: ot.presupuesto_aprobado,
    presupuesto_enviado_en: ot.presupuesto_enviado_en, presupuesto_recordatorios: ot.presupuesto_recordatorios, presupuesto_recordado_en: ot.presupuesto_recordado_en,
  };
  const { data: marcada, error: marcarErr } = await admin.from('ordenes_trabajo')
    // Cada envío (o reenvío) reinicia la cuenta de los recordatorios automáticos.
    .update({ presupuesto_estado: 'enviado', presupuesto_aprobado: null, presupuesto_enviado_en: new Date().toISOString(), presupuesto_recordatorios: 0, presupuesto_recordado_en: null })
    .eq('id', otId).in('estado', ESTADOS_PRESUPUESTABLES).is('aceptacion_presupuesto_en', null).select('id');
  if (marcarErr || !marcada?.length) return json({ error: 'No se pudo marcar el presupuesto como enviado.' }, 409);

  if (porCorreo) {
    const { data: veh } = await admin.from('vehiculos').select('marca, modelo, matricula').eq('id', ot.vehiculo_id).single();
    const vehiculo = veh ? `${veh.marca} ${veh.modelo} (${veh.matricula})` : 'vehículo';
    const { data: lineas } = await admin.from('lineas_ot').select('tipo, descripcion, cantidad, subtotal').eq('ot_id', otId).order('posicion');
    const { asunto, html } = construirCorreoPresupuesto(empresa, cliente, vehiculo, ot.numero, lineas ?? [], Number(ot.total), enlace);
    try {
      await enviarCorreo(empresa.nombre, empresa.correo, cliente.correo!, asunto, html);
    } catch (e) {
      // Si el correo no sale, el presupuesto vuelve a como estaba para poder reintentarlo.
      await admin.from('ordenes_trabajo').update(anterior).eq('id', otId);
      console.error(JSON.stringify({ presupuestoEnviar: 'correo_fallido', mensaje: e instanceof Error ? e.message : String(e) }));
      return json({ error: 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.' }, 502);
    }
  }

  await admin.from('eventos_ot').insert({
    ot_id: otId,
    descripcion: porCorreo ? `Presupuesto enviado al cliente por correo (${cliente.correo}).` : 'Presupuesto marcado como enviado al cliente (enlace compartido a mano).',
  });
  return json({ ok: true, enlace, correo: porCorreo });
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido.' }, 400); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return manejarEnviar(admin, req, String(body.otId ?? ''), body.porCorreo === true);
}, CORS_HEADERS));
