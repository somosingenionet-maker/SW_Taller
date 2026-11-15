// Recordatorio del día anterior a una cita — lo dispara un cron diario (pg_cron → pg_net), sin usuario: se autoriza
// con el secreto compartido (x-cron-secret). Solo para citas CONFIRMADAS de mañana (hora de Madrid) con correo
// conocido, de talleres con los recordatorios automáticos activados y clientes que no pidieron no recibir avisos
// (todo eso lo filtra `citas_para_recordar`). Un recordatorio por cita. `{"simular": true}` solo lista a quién.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { construirCorreoCita } from '../_shared/correoCitas.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { fechaHoraLarga } from '../reservas-publicas/logic.ts';

initSentry('reservas-recordatorios');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');
const MAX_POR_EJECUCION = 100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

interface Fila {
  cita_id: string; empresa_id: string; fecha_hora: string; duracion_minutos: number; nombre: string | null; correo: string | null;
  vehiculo: string | null; motivo: string | null; token_cliente: string | null;
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) return json({ error: 'No autorizado' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío: válido para el cron */ }
  const simular = body.simular === true;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data, error } = await admin.rpc('citas_para_recordar');
  if (error) throw new Error(`citas_para_recordar: ${error.message}`);
  const filas = (data ?? []) as Fila[];

  const resultados: { cita: string; resultado: string }[] = [];
  let enviados = 0;
  for (const f of filas) {
    if (enviados >= MAX_POR_EJECUCION) { resultados.push({ cita: f.cita_id, resultado: 'aplazado: límite por ejecución' }); continue; }
    try {
      if (!f.correo || !CORREO_VALIDO.test(f.correo)) { resultados.push({ cita: f.cita_id, resultado: 'omitido: sin correo válido' }); continue; }
      if (simular) { resultados.push({ cita: f.cita_id, resultado: 'se enviaría (simulación)' }); continue; }
      const { data: empresa } = await admin.from('empresas').select('nombre, brand_color, logo_url, correo, telefono').eq('id', f.empresa_id).single();
      if (!empresa) { resultados.push({ cita: f.cita_id, resultado: 'omitido: sin empresa' }); continue; }
      const { asunto, html } = construirCorreoCita('cliente_recordatorio', {
        empresa, nombre: f.nombre ?? 'cliente', cuando: fechaHoraLarga(new Date(f.fecha_hora).getTime()), vehiculo: f.vehiculo, motivo: f.motivo,
        duracionMin: f.duracion_minutos, enlace: f.token_cliente ? `${APP_URL}/cita/${f.token_cliente}` : null,
      });
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `${empresa.nombre.replace(/[<>"]/g, '').trim() || 'Taller'} <${RESEND_FROM_EMAIL}>`, to: [f.correo], subject: asunto, html,
          ...(empresa.correo && CORREO_VALIDO.test(empresa.correo) ? { reply_to: empresa.correo } : {}),
        }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      // Solo se anota si el correo salió, y solo si seguía sin anotar: nunca dos recordatorios para la misma cita.
      await admin.from('citas').update({ recordatorio_enviado_en: new Date().toISOString() }).eq('id', f.cita_id).is('recordatorio_enviado_en', null);
      enviados++;
      resultados.push({ cita: f.cita_id, resultado: 'enviado' });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      Sentry.captureException(e instanceof Error ? e : new Error(mensaje));
      resultados.push({ cita: f.cita_id, resultado: `error: ${mensaje}` });
    }
  }
  return json({ simular, candidatas: filas.length, enviados, resultados });
}, CORS_HEADERS));
