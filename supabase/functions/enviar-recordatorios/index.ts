// Recordatorios automáticos por email — dos caminos posibles:
// 1) Lote diario: lo llama pg_cron/pg_net (ver cron.schedule('recordatorios-
//    diarios', ...) en la migración), sin usuario interactivo — se autoriza
//    con un secreto compartido (x-cron-secret), no con un JWT de usuario.
// 2) Forzado puntual: lo llama la app cuando un miembro del taller pulsa
//    "Enviar ahora" sobre una alerta concreta desde el monitor de Alertas —
//    se autoriza igual que admin-users/manage-empresas (Authorization:
//    Bearer <token de usuario>), y no respeta la ventana de aviso ni el
//    filtro de "ya enviado" (es una orden explícita, puede reenviar).
//    Sirve para una alerta (alertaId) o para un aviso personalizado (avisoId).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  TipoAlerta, TIPO_EVENTO, DIAS_AVISO_VENCIMIENTO, DIAS_ULTIMO_AVISO, DIAS_RESUMEN_ENTREGA, construirEmail, construirEmailResumen, construirEmailPersonalizado,
  vencimientoToca, avisoAceite, avisoPersonalizadoToca, siguienteRepeticion, diasHasta, resumenTieneContenido,
  type Aviso, type AvisoPersonalizado, type EmpresaEmail, type FiltrosOrden,
} from './logic.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';
import { perfilTieneModulo, mensajeSinModulo } from '../_shared/modulos.ts';

initSentry('enviar-recordatorios');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Nunca se usa logo_base64 aquí: incrustar un logo en base64 en el HTML del
// correo es una señal clásica de spam para Gmail y similares — se usa la
// URL pública de Storage (logo_url) en su lugar, o directamente sin logo.
/** Columnas de la empresa que hacen falta para enviar: textos, marca, ajustes de avisos y reserva online. */
const EMPRESA_COLS = 'id, nombre, plantillas_recordatorios, logo_url, brand_color, correo, telefono, web, avisos_antelacion_dias, avisos_itv, avisos_seguro, avisos_impuesto, reservas_activas, reservas_slug';
type EmpresaFila = Omit<EmpresaEmail, 'reserva_url'> & {
  avisos_antelacion_dias: number; avisos_itv: boolean; avisos_seguro: boolean; avisos_impuesto: boolean;
  reservas_activas: boolean; reservas_slug: string | null;
};
/** La empresa lista para los correos: con el enlace de reserva si la tiene activa. */
type Empresa = EmpresaEmail & Pick<EmpresaFila, 'avisos_antelacion_dias' | 'avisos_itv' | 'avisos_seguro' | 'avisos_impuesto'>;
const conEnlaceReserva = (e: EmpresaFila): Empresa => ({ ...e, reserva_url: e.reservas_activas && e.reservas_slug ? `${APP_URL}/reservar/${e.reservas_slug}` : null });
type Vehiculo = { id: string; marca: string; modelo: string; matricula: string; kilometraje: number };
type Cliente = { id: string; nombre: string; apellidos: string; correo: string | null; no_avisar?: boolean | null };
type Alerta = {
  id: string; tipo: string; fecha_limite: string | null; kilometraje_limite: number | null;
  recordatorio_enviado_en?: string | null; ultimo_aviso_enviado_en?: string | null;
};

/** Hoy en Madrid, «AAAA-MM-DD»: los avisos se cuentan en días del taller, no en UTC. */
function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function enviarCorreo(empresa: Empresa, destinatario: string, asunto: string, html: string): Promise<void> {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Resend rechaza un remitente con «<», «>» o comillas en el nombre visible.
      from: `${empresa.nombre.replace(/[<>"]/g, '').trim() || 'Taller'} <${RESEND_FROM_EMAIL}>`,
      to: [destinatario],
      subject: asunto,
      html,
      // Las respuestas del cliente van al taller, no al buzón de envío. Si el correo del taller
      // no es válido se omite: Resend rechazaría el envío entero.
      ...(empresa.correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empresa.correo) ? { reply_to: empresa.correo } : {}),
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

/**
 * Construye el email, lo envía por Resend, registra la notificación y marca la alerta. Lanza si algo
 * falla. `aviso` distingue el recordatorio del «último aviso» de un cambio de aceite ya vencido.
 */
async function enviarRecordatorioAlerta(
  admin: SupabaseClient,
  empresa: Empresa,
  alerta: Alerta,
  vehiculo: Vehiculo,
  cliente: Cliente,
  aviso: Aviso = 'recordatorio',
  origen: 'automatico' | 'manual' = 'automatico',
): Promise<void> {
  if (!cliente.correo) throw new Error('El cliente no tiene correo registrado.');
  const tipo = alerta.tipo as TipoAlerta;
  const { asunto, html } = construirEmail(tipo, empresa, cliente, vehiculo, alerta, aviso);

  await enviarCorreo(empresa, cliente.correo, asunto, html);

  const vencido = tipo === 'aceite' && aviso === 'vencido';
  await admin.from('notificaciones_cliente').insert({
    empresa_id: empresa.id,
    cliente_id: cliente.id,
    vehiculo_id: vehiculo.id,
    tipo_envio: 'email',
    asunto,
    mensaje: html,
    leido: false,
    tipo_evento: vencido ? 'aceite_vencido' : TIPO_EVENTO[tipo],
    origen,
  });
  const ahora = new Date().toISOString();
  // El último aviso cierra también el recordatorio: si este no llegó a salir, ya no tiene sentido.
  await admin.from('alertas')
    .update(vencido ? { ultimo_aviso_enviado_en: ahora, recordatorio_enviado_en: alerta.recordatorio_enviado_en ?? ahora } : { recordatorio_enviado_en: ahora })
    .eq('id', alerta.id);
}

type AvisoFila = AvisoPersonalizado & { id: string; cliente_id: string; vehiculo_id: string | null; enviado_en: string | null; canal?: string | null };

/**
 * Envía un aviso personalizado por correo. Se reserva ANTES de enviar (estado → enviado, solo si seguía programado): si dos lotes o un
 * clic coinciden, solo uno lo consigue. Si el correo no sale, vuelve a como estaba. Si se repite, se reprograma para la siguiente vez.
 * Devuelve false si otro lo había reservado ya.
 */
async function enviarAvisoPersonalizado(
  admin: SupabaseClient, empresa: Empresa, aviso: AvisoFila, vehiculo: Vehiculo | null, cliente: Cliente, hoy: string,
  origen: 'automatico' | 'manual',
): Promise<boolean> {
  if (!cliente.correo) throw new Error('El cliente no tiene correo registrado.');
  const ahora = new Date().toISOString();
  const { data: reservado } = await admin.from('avisos_cliente')
    .update({ estado: 'enviado', enviado_en: ahora, canal: 'email' })
    .eq('id', aviso.id).eq('estado', 'programado').select('id');
  if (!reservado?.length) return false;

  const { asunto, html } = construirEmailPersonalizado(empresa, cliente, vehiculo, aviso);
  try {
    await enviarCorreo(empresa, cliente.correo, asunto, html);
  } catch (e) {
    await admin.from('avisos_cliente').update({ estado: 'programado', enviado_en: aviso.enviado_en, canal: aviso.canal ?? null }).eq('id', aviso.id);
    throw e;
  }
  // Ya salió: lo que falle a partir de aquí no debe deshacer el envío ni repetirlo.
  const { error: histErr } = await admin.from('notificaciones_cliente').insert({
    empresa_id: empresa.id, cliente_id: cliente.id, vehiculo_id: vehiculo?.id ?? null, tipo_envio: 'email',
    asunto, mensaje: html, leido: false, tipo_evento: 'aviso_personalizado', origen,
  });
  if (histErr) Sentry.captureException(histErr);
  if (aviso.repetir_meses && aviso.avisar_en) {
    const { error: repErr } = await admin.from('avisos_cliente')
      .update({ estado: 'programado', avisar_en: siguienteRepeticion(aviso.avisar_en, aviso.repetir_meses, hoy) }).eq('id', aviso.id);
    if (repErr) Sentry.captureException(repErr);
  }
  return true;
}

/** Camino 2: un miembro del taller fuerza el envío de una alerta o de un aviso personalizado ya mismo. */
async function manejarForzado(admin: SupabaseClient, req: Request, ref: { alertaId: string; avisoId: string }) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData.user) return json({ error: 'Sesión inválida' }, 401);
  if (await falta2Factor(admin, token, callerData.user.id)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: callerPerfil, error: perfilErr } = await admin
    .from('perfiles')
    .select('empresa_id, rol, modulos, activo')
    .eq('id', callerData.user.id)
    .single();
  if (perfilErr || !callerPerfil?.empresa_id) return json({ error: 'No autorizado' }, 403);
  // Enviar un aviso a un cliente a mano es del módulo Avisos (id interno «alertas»).
  if (!perfilTieneModulo(callerPerfil, 'alertas')) return json({ error: mensajeSinModulo('Avisos') }, 403);

  if (!ref.alertaId && !ref.avisoId) return json({ error: 'Falta el aviso.' }, 400);
  return ref.avisoId ? forzarAviso(admin, callerPerfil.empresa_id, ref.avisoId) : forzarAlerta(admin, callerPerfil.empresa_id, ref.alertaId);
}

async function forzarAviso(admin: SupabaseClient, empresaId: string, avisoId: string) {
  const { data: aviso } = await admin.from('avisos_cliente')
    .select('id, empresa_id, cliente_id, vehiculo_id, motivo, mensaje, avisar_en, avisar_km, repetir_meses, estado, enviado_en, canal')
    .eq('id', avisoId).single();
  if (!aviso) return json({ error: 'Aviso no encontrado.' }, 404);
  if (aviso.empresa_id !== empresaId) return json({ error: 'No autorizado' }, 403);
  if (aviso.estado !== 'programado') return json({ error: 'Este aviso ya no está programado.' }, 400);

  const { data: empresa } = await admin.from('empresas').select(EMPRESA_COLS).eq('id', empresaId).single();
  if (!empresa) return json({ error: 'Empresa no encontrada.' }, 404);
  const { data: cliente } = await admin.from('clientes').select('id, nombre, apellidos, correo, no_avisar').eq('id', aviso.cliente_id).single();
  if (!cliente?.correo) return json({ error: 'El cliente no tiene correo registrado.' }, 400);
  if (cliente.no_avisar) return json({ error: 'Este cliente pidió no recibir avisos. Quita la marca «No enviarle avisos» en su ficha si ha cambiado de opinión.' }, 400);
  const { data: vehiculo } = aviso.vehiculo_id
    ? await admin.from('vehiculos').select('id, marca, modelo, matricula, kilometraje').eq('id', aviso.vehiculo_id).single()
    : { data: null };

  try {
    const enviado = await enviarAvisoPersonalizado(admin, conEnlaceReserva(empresa as EmpresaFila), aviso as AvisoFila, vehiculo, cliente, hoyMadrid(), 'manual');
    return enviado ? json({ ok: true }) : json({ error: 'Este aviso ya se estaba enviando.' }, 409);
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: e instanceof Error ? e.message : 'Error inesperado enviando el aviso.' }, 500);
  }
}

async function forzarAlerta(admin: SupabaseClient, empresaId: string, alertaId: string) {
  const { data: alerta, error: alertaErr } = await admin
    .from('alertas')
    .select('id, empresa_id, vehiculo_id, tipo, estado, fecha_limite, kilometraje_limite, recordatorio_enviado_en, ultimo_aviso_enviado_en')
    .eq('id', alertaId)
    .single();
  if (alertaErr || !alerta) return json({ error: 'Alerta no encontrada.' }, 404);
  if (alerta.empresa_id !== empresaId) return json({ error: 'No autorizado' }, 403);
  if (alerta.estado === 'atendida') return json({ error: 'Esta alerta ya está atendida.' }, 400);

  const { data: empresa, error: empresaErr } = await admin
    .from('empresas')
    .select(EMPRESA_COLS)
    .eq('id', alerta.empresa_id)
    .single();
  if (empresaErr || !empresa) return json({ error: 'Empresa no encontrada.' }, 404);

  const { data: vehiculo } = await admin
    .from('vehiculos')
    .select('id, marca, modelo, matricula, kilometraje')
    .eq('id', alerta.vehiculo_id)
    .single();
  if (!vehiculo) return json({ error: 'Vehículo no encontrado.' }, 404);

  const { data: rel } = await admin
    .from('cliente_vehiculo')
    .select('cliente_id')
    .eq('vehiculo_id', vehiculo.id)
    .maybeSingle();
  if (!rel) return json({ error: 'Este vehículo no tiene un cliente asociado.' }, 400);

  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nombre, apellidos, correo, no_avisar')
    .eq('id', rel.cliente_id)
    .single();
  if (!cliente?.correo) return json({ error: 'El cliente asociado no tiene correo registrado.' }, 400);
  if (cliente.no_avisar) return json({ error: 'Este cliente pidió no recibir avisos. Quita la marca «No enviarle avisos» en su ficha si ha cambiado de opinión.' }, 400);

  // Un cambio de aceite ya vencido hace una semana o más se envía con el texto de «pendiente».
  const aviso: Aviso = alerta.tipo === 'aceite' && alerta.fecha_limite && diasHasta(alerta.fecha_limite, hoyMadrid()) <= -DIAS_ULTIMO_AVISO
    ? 'vencido' : 'recordatorio';

  try {
    await enviarRecordatorioAlerta(admin, conEnlaceReserva(empresa as EmpresaFila), alerta, vehiculo, cliente, aviso, 'manual');
    return json({ ok: true });
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: e instanceof Error ? e.message : 'Error inesperado enviando el recordatorio.' }, 500);
  }
}

/** Avisos personalizados de la empresa que tocan hoy y tienen un cliente con correo. */
async function enviarAvisosPersonalizados(
  admin: SupabaseClient, empresa: Empresa, hoy: string,
  resumen: { enviados: number; fallidos: number; personalizados: number; errores: string[] },
) {
  const { data: avisos, error } = await admin.from('avisos_cliente')
    .select('id, cliente_id, vehiculo_id, motivo, mensaje, avisar_en, avisar_km, repetir_meses, enviado_en, canal')
    .eq('empresa_id', empresa.id).eq('estado', 'programado');
  if (error) { resumen.errores.push(`empresa ${empresa.id} (avisos personalizados): ${error.message}`); return; }

  for (const aviso of avisos ?? []) {
    try {
      const { data: vehiculo } = aviso.vehiculo_id
        ? await admin.from('vehiculos').select('id, marca, modelo, matricula, kilometraje').eq('id', aviso.vehiculo_id).single()
        : { data: null };
      if (!avisoPersonalizadoToca(aviso, vehiculo?.kilometraje ?? null, hoy)) continue;
      const { data: cliente } = await admin.from('clientes').select('id, nombre, apellidos, correo, no_avisar').eq('id', aviso.cliente_id).single();
      // Sin correo, o si pidió no recibir avisos, no se envía: el taller lo ve en «Para hoy» (WhatsApp) o no se le avisa.
      if (!cliente?.correo || cliente.no_avisar) continue;
      if (await enviarAvisoPersonalizado(admin, empresa, aviso as AvisoFila, vehiculo, cliente, hoy, 'automatico')) {
        resumen.enviados++;
        resumen.personalizados++;
      }
    } catch (e) {
      resumen.fallidos++;
      resumen.errores.push(`aviso ${aviso.id}: ${e instanceof Error ? e.message : String(e)}`);
      Sentry.captureException(e);
    }
  }
}

/**
 * Resumen del cambio de aceite: un correo al cliente de cada orden de aceite ENTREGADA en los
 * últimos días, con los filtros que se cambiaron y cuándo le toca volver. Una sola vez por orden.
 */
async function enviarResumenesAceite(
  admin: SupabaseClient, empresa: Empresa, hoy: string,
  resumen: { enviados: number; fallidos: number; resumenesAceite: number; errores: string[] },
) {
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - DIAS_RESUMEN_ENTREGA * 86_400_000).toISOString().slice(0, 10);
  const { data: ordenes, error } = await admin
    .from('ordenes_trabajo')
    .select('id, vehiculo_id, cliente_id, aceite_anotado_en, filtro_aire, filtro_aceite, filtro_combustible, filtro_habitaculo')
    .eq('empresa_id', empresa.id)
    .eq('es_cambio_aceite', true)
    .eq('estado', 'entregado')
    .is('aceite_resumen_enviado_en', null)
    .gte('fecha_entrega', desde);
  if (error) { resumen.errores.push(`empresa ${empresa.id} (resúmenes): ${error.message}`); return; }

  for (const orden of ordenes ?? []) {
    try {
      const [{ data: vehiculo }, { data: cliente }] = await Promise.all([
        admin.from('vehiculos').select('id, marca, modelo, matricula, kilometraje, aceite_proxima_fecha, aceite_proximo_km').eq('id', orden.vehiculo_id).single(),
        admin.from('clientes').select('id, nombre, apellidos, correo, no_avisar').eq('id', orden.cliente_id).single(),
      ]);
      if (!vehiculo || !cliente?.correo || cliente.no_avisar) continue;

      // El próximo cambio solo se cuenta si se anotó a raíz de ESTA orden.
      const proximo = orden.aceite_anotado_en ? { fecha: vehiculo.aceite_proxima_fecha, km: vehiculo.aceite_proximo_km } : null;
      if (!resumenTieneContenido(orden as FiltrosOrden, proximo)) continue;

      // Se reserva la orden antes de enviar: si dos lotes coinciden, solo uno la consigue.
      const ahora = new Date().toISOString();
      const { data: reservada } = await admin
        .from('ordenes_trabajo')
        .update({ aceite_resumen_enviado_en: ahora })
        .eq('id', orden.id).is('aceite_resumen_enviado_en', null)
        .select('id');
      if (!reservada?.length) continue;

      const { asunto, html } = construirEmailResumen(empresa, cliente, vehiculo, orden as FiltrosOrden, proximo);
      try {
        await enviarCorreo(empresa, cliente.correo, asunto, html);
      } catch (e) {
        // No salió: se libera para reintentarlo mañana (mientras siga dentro del plazo).
        await admin.from('ordenes_trabajo').update({ aceite_resumen_enviado_en: null }).eq('id', orden.id);
        throw e;
      }
      await admin.from('notificaciones_cliente').insert({
        empresa_id: empresa.id, cliente_id: cliente.id, vehiculo_id: vehiculo.id, tipo_envio: 'email',
        asunto, mensaje: html, leido: false, tipo_evento: 'aceite_resumen', origen: 'automatico',
      });
      resumen.enviados++;
      resumen.resumenesAceite++;
    } catch (e) {
      resumen.fallidos++;
      resumen.errores.push(`resumen de la orden ${orden.id}: ${e instanceof Error ? e.message : String(e)}`);
      Sentry.captureException(e);
    }
  }
}

/** Camino 1: lote diario disparado por pg_cron para todas las empresas con el opt-in activo. */
async function manejarLote(admin: SupabaseClient) {
  const resumen = { empresas: 0, alertasEvaluadas: 0, enviados: 0, fallidos: 0, resumenesAceite: 0, personalizados: 0, errores: [] as string[] };
  const hoy = hoyMadrid();

  try {
    const { data: filas, error: empresasErr } = await admin
      .from('empresas')
      .select(EMPRESA_COLS)
      .eq('activo', true)
      .eq('recordatorios_automaticos_activos', true);
    if (empresasErr) throw empresasErr;

    for (const fila of (filas ?? []) as EmpresaFila[]) {
      const empresa = conEnlaceReserva(fila);
      const antelacion = fila.avisos_antelacion_dias ?? DIAS_AVISO_VENCIMIENTO;
      // Cada taller elige qué vencimientos vigila; el cambio de aceite y los avisos personalizados siempre están activos.
      const vigila: Record<string, boolean> = { itv: fila.avisos_itv, seguro: fila.avisos_seguro, impuesto: fila.avisos_impuesto, aceite: true };
      resumen.empresas++;

      const { data: alertas, error: alertasErr } = await admin
        .from('alertas')
        .select('id, vehiculo_id, tipo, fecha_limite, kilometraje_limite, recordatorio_enviado_en, ultimo_aviso_enviado_en')
        .eq('empresa_id', empresa.id)
        .neq('estado', 'atendida')
        // Pendientes de recordatorio, más las de aceite que aún pueden necesitar el último aviso.
        .or('recordatorio_enviado_en.is.null,and(tipo.eq.aceite,ultimo_aviso_enviado_en.is.null)');
      if (alertasErr) {
        resumen.errores.push(`empresa ${empresa.id}: ${alertasErr.message}`);
        continue;
      }

      for (const alerta of alertas ?? []) {
        resumen.alertasEvaluadas++;
        try {
          const { data: vehiculo } = await admin
            .from('vehiculos')
            .select('id, marca, modelo, matricula, kilometraje')
            .eq('id', alerta.vehiculo_id)
            .single();
          if (!vehiculo) continue;

          const tipo = alerta.tipo as TipoAlerta;
          if (!vigila[tipo]) continue;
          let aviso: Aviso = 'recordatorio';
          if (tipo === 'aceite') {
            const toca = avisoAceite({
              fecha_limite: alerta.fecha_limite, kilometraje_limite: alerta.kilometraje_limite,
              recordatorio_enviado_en: alerta.recordatorio_enviado_en, ultimo_aviso_enviado_en: alerta.ultimo_aviso_enviado_en,
            }, vehiculo.kilometraje, hoy, antelacion);
            if (!toca) continue;
            aviso = toca;
          } else if (alerta.recordatorio_enviado_en || !vencimientoToca(alerta.fecha_limite, hoy, antelacion)) {
            continue;
          }

          const { data: rel } = await admin
            .from('cliente_vehiculo')
            .select('cliente_id')
            .eq('vehiculo_id', vehiculo.id)
            .maybeSingle();
          if (!rel) continue;

          const { data: cliente } = await admin
            .from('clientes')
            .select('id, nombre, apellidos, correo, no_avisar')
            .eq('id', rel.cliente_id)
            .single();
          if (!cliente?.correo || cliente.no_avisar) continue;

          await enviarRecordatorioAlerta(admin, empresa, alerta, vehiculo, cliente, aviso);
          resumen.enviados++;
        } catch (e) {
          resumen.fallidos++;
          resumen.errores.push(`alerta ${alerta.id}: ${e instanceof Error ? e.message : String(e)}`);
          // Solo se encola aquí (sin flush) para no meter una espera de hasta
          // 2s por cada alerta fallida dentro del bucle del lote — se manda
          // todo junto justo antes de responder.
          Sentry.captureException(e);
        }
      }

      await enviarAvisosPersonalizados(admin, empresa, hoy, resumen);
      await enviarResumenesAceite(admin, empresa, hoy, resumen);
    }

    if (resumen.fallidos > 0) await Sentry.flush(2000);
    return json(resumen);
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: e instanceof Error ? e.message : 'Error inesperado', ...resumen }, 500);
  }
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // cuerpo vacío o inválido — válido para el camino del lote (pg_net manda '{}')
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  if (body.action === 'forzar') {
    return manejarForzado(admin, req, { alertaId: String(body.alertaId ?? ''), avisoId: String(body.avisoId ?? '') });
  }

  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) {
    return json({ error: 'No autorizado' }, 401);
  }
  return manejarLote(admin);
}, CORS_HEADERS));
