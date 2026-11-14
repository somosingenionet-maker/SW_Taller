// Envío del informe de inspección al cliente. Lo llama la app (con la sesión del usuario) cuando recepción
// revisa y pulsa «Enviar al cliente». Marca la inspección como enviada (desde ese momento nadie la edita),
// garantiza que el cliente tiene enlace a su portal y, si se pide, le manda el correo con ese enlace.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';
import { perfilTieneModulo, mensajeSinModulo } from '../_shared/modulos.ts';
import { resumenPuntos } from '../_shared/inspeccion.ts';
import { initSentry, conSentry } from '../_shared/sentry.ts';
import { CORREO_VALIDO, construirCorreoInforme, motivoNoEnviable } from './logic.ts';

initSentry('inspeccion-enviar');

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

async function manejarEnviar(admin: SupabaseClient, req: Request, inspeccionId: string, porCorreo: boolean) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return json({ error: 'Sesión inválida' }, 401);
  if (await falta2Factor(admin, token, caller.user.id)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: perfil } = await admin.from('perfiles').select('empresa_id, rol, modulos, activo').eq('id', caller.user.id).single();
  if (!perfil?.empresa_id) return json({ error: 'No autorizado' }, 403);
  if (!perfilTieneModulo(perfil, 'taller')) return json({ error: mensajeSinModulo('Taller') }, 403);
  if (!inspeccionId) return json({ error: 'Falta la inspección.' }, 400);

  const { data: insp } = await admin.from('inspecciones')
    .select('id, empresa_id, orden_id, vehiculo_id, cliente_id, estado').eq('id', inspeccionId).maybeSingle();
  if (!insp) return json({ error: 'Inspección no encontrada.' }, 404);
  if (insp.empresa_id !== perfil.empresa_id) return json({ error: 'No autorizado' }, 403);

  const { data: empresa } = await admin.from('empresas')
    .select('id, nombre, brand_color, logo_url, correo, telefono, acceso_hasta').eq('id', insp.empresa_id).single();
  if (!empresa) return json({ error: 'Empresa no encontrada.' }, 404);
  // Las funciones con service role se saltan el bloqueo de solo lectura de la base: aquí se respeta igual.
  if (empresa.acceso_hasta && new Date(empresa.acceso_hasta) < new Date()) {
    return json({ error: 'Tu periodo de prueba o tu suscripción ha terminado. Suscríbete desde el botón «Suscripción» para enviar informes.' }, 403);
  }

  const { data: puntos } = await admin.from('inspeccion_puntos').select('estado, precio').eq('inspeccion_id', inspeccionId);
  const filas = (puntos ?? []) as { estado: never; precio: number | null }[];
  const motivo = motivoNoEnviable(insp.estado, filas);
  if (motivo) return json({ error: motivo }, 400);

  const { data: cliente } = await admin.from('clientes').select('id, nombre, correo, portal_token').eq('id', insp.cliente_id).single();
  if (!cliente) return json({ error: 'Cliente no encontrado.' }, 404);
  if (porCorreo && !(cliente.correo && CORREO_VALIDO.test(cliente.correo))) {
    return json({ error: 'El cliente no tiene un correo válido en su ficha. Envíale el enlace de otra forma o corrige el correo.' }, 400);
  }

  // Enlace al portal del cliente: se crea si no tenía.
  let portalToken: string = cliente.portal_token ?? '';
  if (!portalToken) {
    portalToken = crypto.randomUUID();
    const { error } = await admin.from('clientes').update({ portal_token: portalToken }).eq('id', cliente.id);
    if (error) return json({ error: 'No se pudo crear el enlace del cliente.' }, 500);
  }
  const enlace = `${APP_URL}/portal/${portalToken}`;

  // Se marca como enviada ANTES de mandar el correo y solo si seguía «terminada»: dos clics seguidos no envían dos veces.
  const { data: marcada, error: marcarErr } = await admin.from('inspecciones')
    .update({ estado: 'enviada', enviada_en: new Date().toISOString() })
    .eq('id', inspeccionId).eq('estado', 'terminada').select('id');
  if (marcarErr || !marcada?.length) return json({ error: 'Esta inspección ya se envió al cliente.' }, 409);

  if (porCorreo) {
    const { data: veh } = await admin.from('vehiculos').select('marca, modelo, matricula').eq('id', insp.vehiculo_id).single();
    const vehiculo = veh ? `${veh.marca} ${veh.modelo} (${veh.matricula})` : 'vehículo';
    const r = resumenPuntos(filas);
    const { asunto, html } = construirCorreoInforme(empresa, cliente, vehiculo, r, enlace);
    try {
      await enviarCorreo(empresa.nombre, empresa.correo, cliente.correo!, asunto, html);
    } catch (e) {
      // Si el correo no sale, la inspección vuelve a «terminada» para poder reintentarlo.
      await admin.from('inspecciones').update({ estado: 'terminada', enviada_en: null }).eq('id', inspeccionId);
      console.error(JSON.stringify({ inspeccionEnviar: 'correo_fallido', mensaje: e instanceof Error ? e.message : String(e) }));
      return json({ error: 'No se pudo enviar el correo. Inténtalo de nuevo en unos minutos.' }, 502);
    }
  }

  await admin.from('eventos_ot').insert({
    ot_id: insp.orden_id,
    descripcion: porCorreo ? `Inspección enviada al cliente por correo (${cliente.correo}).` : 'Inspección marcada como enviada al cliente (enlace compartido a mano).',
  });
  return json({ ok: true, enlace, correo: porCorreo });
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido.' }, 400); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return manejarEnviar(admin, req, String(body.inspeccionId ?? ''), body.porCorreo === true);
}, CORS_HEADERS));
