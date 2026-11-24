// Webhook de Stripe: mantiene el estado de la suscripción de cada empresa.
//
// Se despliega SIN verificación de JWT (Stripe no envía ninguno): la autenticidad la da la firma
// `Stripe-Signature` con el secreto del webhook (STRIPE_WEBHOOK_SECRET). Sin firma válida no se hace nada.
//
// Garantías:
//  - Idempotente: cada evento se registra en `stripe_eventos`; un reenvío se ignora.
//  - Si algo falla, se devuelve 500 y se borra el registro del evento: Stripe reintenta durante días.
//    Caso típico: `invoice.paid` llega antes que `checkout.session.completed` y aún no sabemos de quién
//    es el cliente de Stripe → 500 → reintento cuando ya está enlazado.
//  - El acceso (`acceso_hasta`) solo se prolonga, nunca se acorta; el orden de los eventos no puede
//    dejar a un cliente que paga sin acceso. `estado_suscripcion` es informativo.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verificarFirmaStripe } from '../_shared/stripe.ts';
import { EVENTOS_ATENDIDOS, planificarEvento } from './logic.ts';
import { avisoInternoDelEvento, construirCorreoSuscripcion, correoDelEvento, type CorreoPendiente } from './correos.ts';
import { enviarAvisoPlataforma } from '../_shared/avisoPlataforma.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';

initSentry('stripe-webhook');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Avisa por correo a los administradores del taller (activada, cancelación, terminada). Nunca lanza:
 * un fallo aquí no debe hacer que Stripe reintente el evento, que ya se aplicó a la base de datos.
 */
// deno-lint-ignore no-explicit-any
async function avisarPorCorreo(admin: any, correo: CorreoPendiente, empresaIdConocida: string | undefined): Promise<void> {
  try {
    if (!RESEND_API_KEY) return;
    let empresaId = empresaIdConocida ?? correo.empresaId;
    if (!empresaId && correo.clienteStripe) {
      const { data } = await admin.from('empresas').select('id').eq('stripe_customer_id', correo.clienteStripe).maybeSingle();
      empresaId = data?.id;
    }
    if (!empresaId) return;
    const { data: empresa } = await admin.from('empresas').select('nombre').eq('id', empresaId).maybeSingle();
    const { data: admins } = await admin.from('perfiles').select('email')
      .eq('empresa_id', empresaId).eq('rol', 'admin').eq('activo', true);
    const destinatarios = [...new Set(((admins ?? []) as { email: string | null }[]).map((a) => (a.email ?? '').trim()).filter(Boolean))];
    if (!empresa || destinatarios.length === 0) return;

    const { asunto, html } = construirCorreoSuscripcion(correo, empresa.nombre, APP_URL);
    for (const to of destinatarios) {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `Doonty Motor <${RESEND_FROM_EMAIL}>`, to: [to], subject: asunto, html, reply_to: 'send@doonty.com' }),
      });
      if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
    }
    console.log(JSON.stringify({ correoSuscripcion: correo.tipo, empresaId, enviados: destinatarios.length }));
  } catch (e) {
    console.error('No se pudo enviar el correo de suscripción:', e instanceof Error ? e.message : e);
    Sentry.captureException(e);
  }
}

/** Aviso interno al dueño de la plataforma (nueva suscripción, cancelación, baja, cobro fallido). Nunca lanza. */
// deno-lint-ignore no-explicit-any
async function avisarPlataforma(admin: any, evento: Record<string, unknown>, empresaId: string): Promise<void> {
  try {
    if (!avisoInternoDelEvento(evento, '')) return; // este evento no avisa: ni siquiera consultar
    const { data: empresa } = await admin.from('empresas').select('nombre').eq('id', empresaId).maybeSingle();
    const aviso = avisoInternoDelEvento(evento, empresa?.nombre ?? empresaId);
    if (aviso) await enviarAvisoPlataforma(aviso);
  } catch (e) {
    console.error('Aviso interno fallido:', e instanceof Error ? e.message : e);
  }
}

Deno.serve(conSentry(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (!WEBHOOK_SECRET) return json({ error: 'Webhook sin configurar' }, 500);

  // El cuerpo exacto (sin reinterpretar) es lo que se firma.
  const cuerpo = await req.text();
  if (!(await verificarFirmaStripe(cuerpo, req.headers.get('Stripe-Signature'), WEBHOOK_SECRET))) {
    return json({ error: 'Firma no válida' }, 400);
  }

  let evento: { id?: string; type?: string };
  try {
    evento = JSON.parse(cuerpo);
  } catch {
    return json({ error: 'Cuerpo inválido' }, 400);
  }
  if (!evento.id || !evento.type) return json({ error: 'Evento inválido' }, 400);
  if (!(EVENTOS_ATENDIDOS as readonly string[]).includes(evento.type)) return json({ ok: true, ignorado: evento.type });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Idempotencia: si ya está registrado, ya se procesó.
  const { error: dupErr } = await admin.from('stripe_eventos').insert({ id: evento.id, tipo: evento.type });
  if (dupErr) {
    if (dupErr.code === '23505') return json({ ok: true, duplicado: true });
    return json({ error: dupErr.message }, 500);
  }

  try {
    const plan = planificarEvento(evento);
    // Rastro para diagnóstico (sin datos personales): qué evento llegó y qué se decidió.
    console.log(JSON.stringify({ stripeEvento: evento.id, tipo: evento.type, plan }));
    if (plan) {
      let empresaId = plan.empresaId;
      if (!empresaId && plan.clienteStripe) {
        const { data } = await admin.from('empresas').select('id').eq('stripe_customer_id', plan.clienteStripe).maybeSingle();
        empresaId = data?.id;
      }
      if (!empresaId) throw new Error(`Cliente de Stripe sin empresa asociada todavía (${plan.clienteStripe}); se reintentará.`);

      const { error: updErr } = await admin.from('empresas').update(plan.campos).eq('id', empresaId);
      if (updErr) throw new Error(updErr.message);

      if (plan.extenderHasta) {
        const { error: extErr } = await admin.rpc('extender_acceso', { p_empresa_id: empresaId, p_hasta: plan.extenderHasta });
        if (extErr) throw new Error(extErr.message);
      }

      // Solo después de aplicar el cambio: así un reintento de Stripe (por un fallo de arriba) no
      // manda el correo dos veces, porque este punto solo se alcanza una vez por evento.
      const correo = correoDelEvento(evento);
      if (correo) await avisarPorCorreo(admin, correo, empresaId);
      await avisarPlataforma(admin, evento, empresaId);
    }
    return json({ ok: true });
  } catch (e) {
    // Liberar el evento para que el reintento de Stripe lo procese.
    await admin.from('stripe_eventos').delete().eq('id', evento.id);
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: e instanceof Error ? e.message : 'Error inesperado' }, 500);
  }
}, {})); // sin CORS: lo llama Stripe desde su servidor, no un navegador
