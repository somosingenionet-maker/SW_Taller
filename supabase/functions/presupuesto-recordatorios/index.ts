// Recordatorios automáticos de presupuestos sin respuesta — lo dispara un cron diario (pg_cron → pg_net), sin usuario: se autoriza
// con el secreto compartido (x-cron-secret), como seguimiento-inspecciones. A los 3 días de enviar el presupuesto, si el cliente no
// lo ha aceptado ni rechazado, se le recuerda; a los 7 días, un último aviso. Como mucho dos por envío.
// Solo para talleres con los recordatorios automáticos activados; nunca a clientes con «No enviarle avisos».
// `{"simular": true}` solo devuelve a quién se enviaría.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { construirCorreoRecordatorioPresupuesto } from './logic.ts';

initSentry('presupuesto-recordatorios');

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
  orden_id: string; empresa_id: string; cliente_id: string; vehiculo_id: string; numero: string; total: number;
  enviado_en: string; avisos: number;
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
  if (!cliente.portal_token) return { resultado: 'omitido: el cliente no tiene enlace al portal' };
  if (simular) return { resultado: 'se enviaría (simulación)' };

  // Se reserva el aviso ANTES de mandar el correo, y solo si el presupuesto seguía igual (sin respuesta y con los mismos avisos):
  // dos ejecuciones a la vez no envían dos veces, y una respuesta del cliente a mitad de camino lo detiene.
  const aviso = (c.avisos + 1) as 1 | 2;
  const { data: reservada } = await admin.from('ordenes_trabajo')
    .update({ presupuesto_recordatorios: aviso, presupuesto_recordado_en: new Date().toISOString() })
    .eq('id', c.orden_id).eq('presupuesto_recordatorios', c.avisos).eq('presupuesto_estado', 'enviado')
    .is('presupuesto_aprobado', null).is('aceptacion_presupuesto_en', null).select('id');
  if (!reservada?.length) return { resultado: 'omitido: el presupuesto cambió mientras tanto' };

  const vehiculo = `${veh.marca} ${veh.modelo} (${veh.matricula})`;
  const enlace = `${APP_URL}/portal/${cliente.portal_token}`;
  const { asunto, html } = construirCorreoRecordatorioPresupuesto(aviso, empresa, cliente, vehiculo, c.numero, Number(c.total), enlace, c.enviado_en);
  try {
    await enviarCorreo(empresa.nombre, empresa.correo, cliente.correo, asunto, html);
  } catch (e) {
    // Si el correo no sale, el aviso se devuelve para reintentarlo mañana.
    await admin.from('ordenes_trabajo').update({ presupuesto_recordatorios: c.avisos }).eq('id', c.orden_id).eq('presupuesto_recordatorios', aviso);
    throw e;
  }
  await admin.from('eventos_ot').insert({
    ot_id: c.orden_id,
    descripcion: `Recordatorio automático ${aviso} de 2 enviado al cliente: presupuesto sin respuesta (${cliente.correo}).`,
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

  const { data, error } = await admin.rpc('presupuestos_recordatorio_pendientes');
  if (error) throw new Error(`presupuestos_recordatorio_pendientes: ${error.message}`);
  const candidatos = (data ?? []) as Candidato[];

  const resultados: { orden: string; aviso: number; resultado: string }[] = [];
  let enviados = 0;
  for (const c of candidatos) {
    if (enviados >= MAX_POR_EJECUCION) { resultados.push({ orden: c.orden_id, aviso: c.avisos + 1, resultado: 'aplazado: límite por ejecución' }); continue; }
    try {
      const { resultado } = await procesar(admin, c, simular);
      if (resultado === 'enviado') enviados++;
      resultados.push({ orden: c.orden_id, aviso: c.avisos + 1, resultado });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      Sentry.captureException(e instanceof Error ? e : new Error(mensaje));
      resultados.push({ orden: c.orden_id, aviso: c.avisos + 1, resultado: `error: ${mensaje}` });
    }
  }
  return json({ simular, candidatos: candidatos.length, enviados, resultados });
}, CORS_HEADERS));
