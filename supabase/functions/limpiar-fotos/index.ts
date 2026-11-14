// Borrado diario de fotos caducadas — lo dispara un cron (pg_cron → pg_net), sin usuario: se autoriza con
// el secreto compartido (x-cron-secret), como limpiar-empresas y enviar-recordatorios.
//
// En orden de seguridad:
//   1. Interruptor general apagado (o ilegible) → no hace nada.
//   2. Nunca se borra antes de `plataforma_config.fotos_borrado_no_antes_de` (margen para avisar a los talleres).
//   3. Se borra por orden entera: primero los archivos y SOLO si todo salió bien se vacían las listas de la
//      base de datos. Un fallo a medias deja la orden intacta para el día siguiente.
//   4. Límites por ejecución y modo `{"simular": true}` que solo devuelve el plan.
//   5. Aviso semanal por correo a los administradores cuando faltan 30 días o menos.
//   6. Archivos huérfanos (nadie los referencia, más de 3 días): se borran; si salen demasiados, no se borra ninguno.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { rutaDeUrlPublica } from '../_shared/inspeccion.ts';
import {
  agruparPorEmpresa, avisoDebido, construirAvisoFotos, fechaEfectiva, huerfanos, planificar, rutasDeOrden,
  type ArchivoAlmacen, type OrdenConFotos,
} from './logic.ts';

initSentry('limpiar-fotos');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://motor.doonty.com';

const BUCKET_RECEPCION = 'fotos-recepcion';
const BUCKET_INSPECCION = 'inspecciones';
const MAX_AVISOS_POR_EJECUCION = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

async function quitar(admin: SupabaseClient, bucket: string, rutas: string[]): Promise<void> {
  for (let i = 0; i < rutas.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(rutas.slice(i, i + 100));
    if (error) throw new Error(`No se pudieron borrar archivos de «${bucket}»: ${error.message}`);
  }
}

interface Entrada { name: string; id: string | null; created_at?: string | null }

/** Todos los archivos del bucket (recursivo), con su fecha de creación. */
async function listarConFecha(admin: SupabaseClient, bucket: string, prefijo = ''): Promise<ArchivoAlmacen[]> {
  const salida: ArchivoAlmacen[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(prefijo, { limit: 1000, offset });
    if (error) throw new Error(`No se pudo listar «${bucket}/${prefijo}»: ${error.message}`);
    const entradas = (data ?? []) as Entrada[];
    for (const e of entradas) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id === null) salida.push(...(await listarConFecha(admin, bucket, ruta)));
      else salida.push({ ruta, creado: e.created_at ?? null });
    }
    if (entradas.length < 1000) break;
  }
  return salida;
}

/** Todas las rutas que la base de datos referencia hoy (paginado: 1.000 filas por vuelta). */
async function rutasReferenciadas(admin: SupabaseClient): Promise<{ recepcion: Set<string>; inspeccion: Set<string> }> {
  const recepcion = new Set<string>();
  const inspeccion = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from('ordenes_trabajo').select('fotos_recepcion').order('id').range(desde, desde + 999);
    if (error) throw new Error(`ordenes_trabajo: ${error.message}`);
    for (const f of (data ?? []) as { fotos_recepcion: string[] }[]) for (const u of f.fotos_recepcion) { const r = rutaDeUrlPublica(u, BUCKET_RECEPCION); if (r) recepcion.add(r); }
    if ((data ?? []).length < 1000) break;
  }
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from('inspeccion_puntos').select('fotos').order('id').range(desde, desde + 999);
    if (error) throw new Error(`inspeccion_puntos: ${error.message}`);
    for (const f of (data ?? []) as { fotos: string[] }[]) for (const r of f.fotos) inspeccion.add(r);
    if ((data ?? []).length < 1000) break;
  }
  return { recepcion, inspeccion };
}

async function enviarCorreo(destinatario: string, asunto: string, html: string): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Doonty Motor <${RESEND_FROM_EMAIL}>`, to: [destinatario], subject: asunto, html, reply_to: 'send@doonty.com' }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) return json({ error: 'No autorizado' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cuerpo vacío: válido para el cron */ }
  const simular = body.simular === true;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1) Interruptor. Ante la duda (no se puede leer), se asume apagado.
  const { data: cfg, error: cfgErr } = await admin.from('plataforma_config')
    .select('fotos_borrado_activo, fotos_borrado_no_antes_de').eq('id', 'global').maybeSingle();
  const activo = !cfgErr && cfg?.fotos_borrado_activo === true;
  if (!activo && !simular) return json({ activo: false, motivo: cfgErr ? `No se pudo leer el interruptor: ${cfgErr.message}` : 'Interruptor apagado' });
  const noAntesDe: string | null = cfg?.fotos_borrado_no_antes_de ?? null;
  if (!noAntesDe && !simular) return json({ activo: false, motivo: 'Sin fecha mínima de borrado: no se hace nada.' });

  const ahora = new Date();
  const { data: filas, error: filasErr } = await admin.rpc('fotos_por_caducar');
  if (filasErr) throw new Error(`fotos_por_caducar: ${filasErr.message}`);
  const ordenes = ((filas ?? []) as OrdenConFotos[]);
  const plan = planificar(ordenes, ahora, noAntesDe);

  const resultado = {
    activo, simular, noAntesDe, candidatas: ordenes.length,
    borradas: [] as { orden: string; archivos: number }[], fallos: [] as { orden: string; error: string }[],
    pendientesDeBorrar: plan.pendientesDeBorrar, avisos: [] as { empresa: string; ordenes: number }[],
    huerfanos: { borrados: 0, total: 0, sospechoso: false },
  };

  // 3) Borrado por orden: archivos primero; la base de datos solo si todo salió bien.
  for (const o of plan.borrar) {
    const rutas = rutasDeOrden(o, (u) => rutaDeUrlPublica(u, BUCKET_RECEPCION));
    if (simular) { resultado.borradas.push({ orden: o.numero, archivos: rutas.recepcion.length + rutas.inspeccion.length }); continue; }
    try {
      await quitar(admin, BUCKET_RECEPCION, rutas.recepcion);
      await quitar(admin, BUCKET_INSPECCION, rutas.inspeccion);
      const ahoraIso = new Date().toISOString();
      const { error: e1 } = await admin.from('ordenes_trabajo').update({ fotos_recepcion: [], fotos_borradas_en: ahoraIso }).eq('id', o.orden_id);
      if (e1) throw new Error(e1.message);
      if (o.inspeccion_id) {
        const { error: e2 } = await admin.from('inspeccion_puntos').update({ fotos: [] }).eq('inspeccion_id', o.inspeccion_id);
        if (e2) throw new Error(e2.message);
        const { error: e3 } = await admin.from('inspecciones').update({ fotos_borradas_en: ahoraIso }).eq('id', o.inspeccion_id);
        if (e3) throw new Error(e3.message);
      }
      await admin.from('eventos_ot').insert({ ot_id: o.orden_id, descripcion: 'Fotos eliminadas automáticamente al cumplirse el plazo de conservación del taller.' });
      resultado.borradas.push({ orden: o.numero, archivos: rutas.recepcion.length + rutas.inspeccion.length });
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      Sentry.captureException(e instanceof Error ? e : new Error(mensaje));
      resultado.fallos.push({ orden: o.numero, error: mensaje });
    }
  }

  // 5) Aviso semanal a los administradores.
  if (activo && plan.avisar.length) {
    const porEmpresa = agruparPorEmpresa(plan.avisar);
    let enviados = 0;
    for (const [empresaId, lista] of porEmpresa) {
      if (enviados >= MAX_AVISOS_POR_EJECUCION) break;
      try {
        const { data: emp } = await admin.from('empresas').select('nombre, fotos_retencion_meses, fotos_aviso_enviado_en, activo').eq('id', empresaId).single();
        if (!emp || emp.activo === false || !avisoDebido(emp.fotos_aviso_enviado_en, ahora)) continue;
        const { data: admins } = await admin.from('perfiles').select('email').eq('empresa_id', empresaId).eq('rol', 'admin').eq('activo', true);
        const correos = [...new Set((admins ?? []).map((a) => a.email as string | null).filter((c): c is string => !!c && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)))];
        if (!correos.length) continue;
        const { asunto, html } = construirAvisoFotos(
          emp.nombre,
          lista.map((o) => ({ numero: o.numero, borrar_en: fechaEfectiva(o.borrar_en, noAntesDe)! })),
          emp.fotos_retencion_meses, APP_URL,
        );
        if (simular) { resultado.avisos.push({ empresa: emp.nombre, ordenes: lista.length }); continue; }
        let alguno = false;
        for (const c of correos) { try { await enviarCorreo(c, asunto, html); alguno = true; } catch (e) { Sentry.captureException(e); } }
        if (!alguno) continue;
        // Solo se anota si al menos un administrador lo recibió: si no, se reintenta mañana.
        await admin.from('empresas').update({ fotos_aviso_enviado_en: new Date().toISOString() }).eq('id', empresaId);
        resultado.avisos.push({ empresa: emp.nombre, ordenes: lista.length });
        enviados++;
      } catch (e) {
        Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  // 6) Huérfanos (con la misma fecha mínima: nada se borra antes).
  const sinMargen = noAntesDe !== null && new Date(noAntesDe).getTime() > ahora.getTime();
  if ((activo && !sinMargen) || simular) {
    try {
      const refs = await rutasReferenciadas(admin);
      for (const [bucket, referenciadas] of [[BUCKET_RECEPCION, refs.recepcion], [BUCKET_INSPECCION, refs.inspeccion]] as const) {
        const archivos = await listarConFecha(admin, bucket);
        const h = huerfanos(archivos, referenciadas, ahora);
        resultado.huerfanos.total += h.total;
        resultado.huerfanos.sospechoso ||= h.sospechoso;
        if (h.sospechoso) Sentry.captureException(new Error(`limpiar-fotos: ${h.total} huérfanos en «${bucket}»: no se borra ninguno`));
        if (!simular && !sinMargen && h.borrar.length) {
          await quitar(admin, bucket, h.borrar.map((a) => a.ruta));
          resultado.huerfanos.borrados += h.borrar.length;
        }
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
    }
  }

  return json(resultado);
}, CORS_HEADERS));
