// Borrado automático de cuentas abandonadas — lo dispara un cron diario (pg_cron → pg_net), sin
// usuario: se autoriza con el secreto compartido (x-cron-secret), igual que enviar-recordatorios.
//
// Qué hace, por orden de seguridad:
//   1. Si el interruptor general está apagado, no hace nada.
//   2. Reinicia los avisos de las cuentas que han vuelto a tener acceso.
//   3. Para cada cuenta terminada decide (logic.ts) si toca: nada, primer aviso, último aviso o borrar.
//   4. Un aviso solo cuenta si Resend lo aceptó. Sin los dos avisos enviados no se borra nunca.
//   5. Antes de borrar vuelve a consultar la cuenta y repite la decisión con datos frescos.
//   6. Límites por ejecución (3 borrados, 20 avisos) para que un fallo no arrase muchas cuentas.
//
// `{"simular": true}` solo devuelve el plan, sin enviar correos ni escribir nada.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { borrarEmpresaCompleta, idEmpresaSeguro } from '../_shared/borradoEmpresa.ts';
import { construirAviso, planificarCuenta, type Accion, type Cuenta } from './logic.ts';

initSentry('limpiar-empresas');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://motor.doonty.com';

const MAX_BORRADOS = 3;
const MAX_AVISOS = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

async function enviarCorreo(destinatario: string, asunto: string, html: string): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Doonty Motor <${RESEND_FROM_EMAIL}>`, to: [destinatario], subject: asunto, html, reply_to: 'send@doonty.com' }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

/** Envía el aviso a todos los administradores. Vale si AL MENOS UNO lo recibió; si ninguno, lanza. */
async function avisar(cuenta: Cuenta, tipo: 'primero' | 'ultimo', borradoPrevisto: string): Promise<number> {
  const { asunto, html } = construirAviso(cuenta, tipo, borradoPrevisto, APP_URL);
  let enviados = 0;
  let ultimoError = '';
  for (const correo of new Set(cuenta.correos_aviso ?? [])) {
    try { await enviarCorreo(correo, asunto, html); enviados++; } catch (e) { ultimoError = e instanceof Error ? e.message : String(e); }
  }
  if (enviados === 0) throw new Error(`No se pudo enviar el aviso a ningún administrador. ${ultimoError}`);
  return enviados;
}

async function cargarCuentas(admin: SupabaseClient): Promise<Cuenta[]> {
  const { data, error } = await admin.rpc('cuentas_terminadas');
  if (error) throw new Error(`cuentas_terminadas: ${error.message}`);
  return ((data ?? []) as Cuenta[]).sort((a, b) => a.fin_conservacion.localeCompare(b.fin_conservacion));
}

interface Resultado { empresa: string; nombre: string; accion: string; ok: boolean; detalle?: string }

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) return json({ error: 'No autorizado' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío: válido para el cron */ }
  const simular = body.simular === true;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1) Interruptor general. Si no se puede leer, se asume APAGADO: ante la duda, no se borra.
  const { data: cfg, error: cfgErr } = await admin.from('plataforma_config').select('borrado_automatico_activo').eq('id', 'global').maybeSingle();
  const activo = !cfgErr && cfg?.borrado_automatico_activo === true;
  if (!activo && !simular) return json({ activo: false, motivo: cfgErr ? `No se pudo leer el interruptor: ${cfgErr.message}` : 'Interruptor apagado' });

  // 2) Cuentas que han vuelto a tener acceso: se limpian sus avisos para que no queden fechas viejas.
  if (!simular) {
    const { error } = await admin.from('empresas')
      .update({ borrado_aviso1_en: null, borrado_aviso2_en: null, borrado_previsto_en: null })
      .gt('acceso_hasta', new Date().toISOString())
      .not('borrado_aviso1_en', 'is', null);
    if (error) Sentry.captureException(new Error(`limpiar-empresas: no se pudieron reiniciar avisos: ${error.message}`));
  }

  const ahora = new Date();
  const cuentas = await cargarCuentas(admin);
  const resultados: Resultado[] = [];
  let avisos = 0;
  let borrados = 0;

  for (const cuenta of cuentas) {
    const nombre = cuenta.nombre;
    const registrar = (accion: string, ok: boolean, detalle?: string) => resultados.push({ empresa: cuenta.empresa_id, nombre, accion, ok, detalle });
    try {
      if (!idEmpresaSeguro(cuenta.empresa_id)) { registrar('nada', false, 'id de empresa no válido'); continue; }
      const accion: Accion = planificarCuenta(cuenta, ahora);

      if (accion.tipo === 'nada') { registrar('nada', true, accion.motivo); continue; }
      if (accion.tipo === 'sin_destinatario') { registrar('sin_destinatario', false, 'ningún administrador con correo válido: no se avisa ni se borra'); continue; }

      if (accion.tipo === 'reiniciar') {
        if (!simular) {
          const { error } = await admin.from('empresas').update({ borrado_aviso1_en: null, borrado_aviso2_en: null, borrado_previsto_en: null }).eq('id', cuenta.empresa_id);
          if (error) throw new Error(error.message);
        }
        registrar('reiniciar', true, 'el acceso se amplió después del aviso');
        continue;
      }

      if (accion.tipo === 'aviso1' || accion.tipo === 'aviso2') {
        if (avisos >= MAX_AVISOS) { registrar(accion.tipo, true, 'aplazado: límite de avisos por ejecución'); continue; }
        if (simular) { registrar(accion.tipo, true, `simulado; borrado previsto ${accion.borradoPrevisto}`); continue; }
        const enviados = await avisar(cuenta, accion.tipo === 'aviso1' ? 'primero' : 'ultimo', accion.borradoPrevisto);
        avisos++;
        // Se anota SOLO tras un envío aceptado. La condición `is null` evita pisar un aviso anotado a la vez.
        const cambios = accion.tipo === 'aviso1'
          ? { borrado_aviso1_en: ahora.toISOString(), borrado_previsto_en: accion.borradoPrevisto }
          : { borrado_aviso2_en: ahora.toISOString() };
        const { error } = await admin.from('empresas').update(cambios).eq('id', cuenta.empresa_id).is(accion.tipo === 'aviso1' ? 'borrado_aviso1_en' : 'borrado_aviso2_en', null);
        if (error) throw new Error(`aviso enviado pero no anotado: ${error.message}`);
        registrar(accion.tipo, true, `enviado a ${enviados} administrador(es)`);
        continue;
      }

      // accion.tipo === 'borrar'
      if (borrados >= MAX_BORRADOS) { registrar('borrar', true, 'aplazado: límite de borrados por ejecución'); continue; }
      if (simular) { registrar('borrar', true, 'simulado'); continue; }

      // 5) Datos frescos: la cuenta pudo cambiar (pago, factura, reactivación) desde que se cargó la lista.
      const fresca = (await cargarCuentas(admin)).find((c) => c.empresa_id === cuenta.empresa_id);
      if (!fresca || planificarCuenta(fresca, new Date()).tipo !== 'borrar') { registrar('borrar', true, 'cancelado: la cuenta cambió al volver a comprobarla'); continue; }

      const { usuarios, archivos } = await borrarEmpresaCompleta(admin, cuenta.empresa_id);
      borrados++;
      const { error: logErr } = await admin.from('empresas_borradas').insert({
        id: cuenta.empresa_id, nombre: cuenta.nombre, creada_en: cuenta.creada_en ?? null, acceso_hasta: cuenta.acceso_hasta, estado: cuenta.estado,
        aviso1_en: cuenta.aviso1_en, aviso2_en: cuenta.aviso2_en, usuarios,
        clientes: Number(cuenta.clientes ?? 0), vehiculos: Number(cuenta.vehiculos ?? 0), ordenes: Number(cuenta.ordenes ?? 0), archivos,
      });
      if (logErr) Sentry.captureException(new Error(`limpiar-empresas: empresa ${cuenta.empresa_id} borrada pero sin constancia: ${logErr.message}`));
      registrar('borrar', true, `borrada (${usuarios} usuarios, ${archivos} archivos)${logErr ? '; SIN constancia en el registro' : ''}`);
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      Sentry.captureException(e instanceof Error ? e : new Error(mensaje));
      registrar('error', false, mensaje);
    }
  }

  return json({ activo, simular, revisadas: cuentas.length, avisos, borrados, resultados });
}, CORS_HEADERS));
