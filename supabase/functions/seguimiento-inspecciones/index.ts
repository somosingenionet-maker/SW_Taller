// Seguimiento automático de inspecciones — lo dispara un cron diario (pg_cron → pg_net), sin usuario: se autoriza
// con el secreto compartido (x-cron-secret), como enviar-recordatorios. Un correo, una sola vez por informe:
//   · «sin_responder»: a los 5 días de enviarlo, si el cliente no ha respondido.
//   · «pendientes»: a los 30 días de la respuesta, si quedaron urgentes rechazados o puntos en «atención» sin resolver.
// Solo para talleres con los recordatorios automáticos activados; nunca a clientes con «No enviarle avisos».
// `{"simular": true}` solo devuelve a quién se enviaría.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { construirCorreoSeguimiento, puntosPendientesDe, type TipoSeguimiento } from './logic.ts';

initSentry('seguimiento-inspecciones');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');
const MAX_POR_EJECUCION = 50;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

interface Candidato {
  inspeccion_id: string; tipo: TipoSeguimiento; empresa_id: string; cliente_id: string; vehiculo_id: string; orden_id: string;
  enviada_en: string | null; respondida_en: string | null; puntos: unknown;
}

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

async function procesar(admin: SupabaseClient, c: Candidato, simular: boolean): Promise<{ resultado: string }> {
  const [{ data: empresa }, { data: cliente }, { data: veh }] = await Promise.all([
    admin.from('empresas').select('nombre, brand_color, logo_url, correo, telefono').eq('id', c.empresa_id).single(),
    admin.from('clientes').select('nombre, correo, no_avisar, portal_token').eq('id', c.cliente_id).single(),
    admin.from('vehiculos').select('marca, modelo, matricula').eq('id', c.vehiculo_id).single(),
  ]);
  if (!empresa || !cliente || !veh) return { resultado: 'omitido: faltan datos' };
  if (cliente.no_avisar) return { resultado: 'omitido: el cliente pidió no recibir avisos' };
  if (!(cliente.correo && CORREO_VALIDO.test(cliente.correo))) return { resultado: 'omitido: el cliente no tiene correo válido' };
  if (c.tipo === 'sin_responder' && !cliente.portal_token) return { resultado: 'omitido: el cliente no tiene enlace al portal' };

  const fechaInforme = (c.tipo === 'sin_responder' ? c.enviada_en : c.enviada_en ?? c.respondida_en) ?? new Date().toISOString();
  const puntos = c.tipo === 'pendientes' ? puntosPendientesDe(c.puntos) : [];
  if (c.tipo === 'pendientes' && puntos.length === 0) return { resultado: 'omitido: ya no hay nada pendiente' };
  const enlace = c.tipo === 'sin_responder' ? `${APP_URL}/portal/${cliente.portal_token}` : null;
  const vehiculo = `${veh.marca} ${veh.modelo} (${veh.matricula})`;
  if (simular) return { resultado: 'se enviaría (simulación)' };

  const { asunto, html } = construirCorreoSeguimiento(c.tipo, empresa, cliente, vehiculo, puntos, enlace, fechaInforme);
  await enviarCorreo(empresa.nombre, empresa.correo, cliente.correo, asunto, html);

  // Solo se anota si el correo salió, y solo si seguía sin anotar: no se envía dos veces.
  const columna = c.tipo === 'sin_responder' ? 'seguimiento_sin_responder_en' : 'seguimiento_pendientes_en';
  await admin.from('inspecciones').update({ [columna]: new Date().toISOString() }).eq('id', c.inspeccion_id).is(columna, null);
  await admin.from('eventos_ot').insert({
    ot_id: c.orden_id,
    descripcion: c.tipo === 'sin_responder'
      ? `Recordatorio automático enviado al cliente: informe de inspección sin responder (${cliente.correo}).`
      : `Seguimiento automático enviado al cliente: ${puntos.length} punto(s) de la inspección sin resolver (${cliente.correo}).`,
  });
  return { resultado: 'enviado' };
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) return json({ error: 'No autorizado' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío: válido para el cron */ }
  const simular = body.simular === true;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await admin.rpc('seguimientos_inspeccion_pendientes');
  if (error) throw new Error(`seguimientos_inspeccion_pendientes: ${error.message}`);
  const candidatos = (data ?? []) as Candidato[];

  const resultados: { inspeccion: string; tipo: string; resultado: string }[] = [];
  let enviados = 0;
  for (const c of candidatos) {
    if (enviados >= MAX_POR_EJECUCION) { resultados.push({ inspeccion: c.inspeccion_id, tipo: c.tipo, resultado: 'aplazado: límite por ejecución' }); continue; }
    try {
      const { resultado } = await procesar(admin, c, simular);
      if (resultado === 'enviado') enviados++;
      resultados.push({ inspeccion: c.inspeccion_id, tipo: c.tipo, resultado });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      Sentry.captureException(e instanceof Error ? e : new Error(mensaje));
      resultados.push({ inspeccion: c.inspeccion_id, tipo: c.tipo, resultado: `error: ${mensaje}` });
    }
  }
  return json({ simular, candidatos: candidatos.length, enviados, resultados });
}, CORS_HEADERS));
