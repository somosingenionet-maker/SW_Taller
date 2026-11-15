// Reserva de cita online — función PÚBLICA (sin login): la usa la página /reservar/<dirección-del-taller> y la
// página /cita/<token> donde el cliente revisa o cancela su cita. La seguridad viene de:
//   · solo expone lo mínimo del taller (nombre, logo, color, contacto, tipos de cita) y solo si tiene las reservas activas;
//   · los huecos los calcula SIEMPRE el servidor; lo que mande el navegador se vuelve a comprobar;
//   · reservar es atómico en la base de datos (un bloqueo por taller) y está limitado por IP, por teléfono y por correo;
//   · captcha (Cloudflare Turnstile) y campo señuelo contra robots; falla cerrado si no hay clave configurada.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { extraerIp, permitirPeticion } from '../_shared/rateLimit.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { verificarTurnstile } from '../_shared/turnstile.ts';
import { CORREO_VALIDO } from '../_shared/correo.ts';
import { construirCorreoCita, type TipoCorreoCita } from '../_shared/correoCitas.ts';
import { construirIcs, enlaceGoogleCalendar } from '../_shared/ics.ts';
import {
  descripcionVehiculo, disponibilidad, fechaHoraLarga, fechaValida, horaValida, huecosDelDia, instanteMadrid, sumarDias, ultimoDia, validarSolicitud,
  type ConfigReservas, type Ocupada,
} from './logic.ts';

initSentry('reservas-publicas');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
const TURNSTILE_SECRET_KEY = Deno.env.get('TURNSTILE_SECRET_KEY');
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

interface EmpresaFila {
  id: string; nombre: string; brand_color: string | null; logo_url: string | null; correo: string | null; telefono: string | null; ciudad: string | null; direccion_fiscal: string | null;
  reservas_activas: boolean; reservas_horario: ConfigReservas['horario']; reservas_cierres: string[]; reservas_capacidad: number;
  reservas_antelacion_horas: number; reservas_dias_max: number; reservas_confirmacion: 'automatica' | 'manual';
}
const COLUMNAS_EMPRESA = 'id, nombre, brand_color, logo_url, correo, telefono, ciudad, direccion_fiscal, reservas_activas, reservas_horario, reservas_cierres, reservas_capacidad, reservas_antelacion_horas, reservas_dias_max, reservas_confirmacion';

const configDe = (e: EmpresaFila): ConfigReservas => ({
  horario: e.reservas_horario, cierres: e.reservas_cierres ?? [], capacidad: e.reservas_capacidad,
  antelacionHoras: e.reservas_antelacion_horas, diasMax: e.reservas_dias_max,
});

async function empresaPorSlug(admin: SupabaseClient, slug: unknown): Promise<EmpresaFila | null> {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return null;
  const { data } = await admin.from('empresas').select(COLUMNAS_EMPRESA).eq('reservas_slug', slug).eq('reservas_activas', true).eq('activo', true).maybeSingle();
  return (data as EmpresaFila | null) ?? null;
}

async function tiposDe(admin: SupabaseClient, empresaId: string) {
  const { data } = await admin.from('tipos_cita').select('id, nombre, duracion_minutos').eq('empresa_id', empresaId).eq('activo', true).order('posicion').order('nombre');
  return (data ?? []) as { id: string; nombre: string; duracion_minutos: number }[];
}

/** Citas no canceladas que pueden tocar el rango [desde, hasta) — con su fin calculado. */
async function ocupadasEntre(admin: SupabaseClient, empresaId: string, desde: number, hasta: number, excluirCitaId?: string): Promise<Ocupada[]> {
  let q = admin.from('citas').select('fecha_hora, duracion_minutos').eq('empresa_id', empresaId).neq('estado', 'cancelada');
  if (excluirCitaId) q = q.neq('id', excluirCitaId);
  const { data } = await q
    .gte('fecha_hora', new Date(desde - 6 * 3600_000).toISOString()).lt('fecha_hora', new Date(hasta).toISOString());
  return ((data ?? []) as { fecha_hora: string; duracion_minutos: number }[]).map((c) => {
    const inicio = new Date(c.fecha_hora).getTime();
    return { inicio, fin: inicio + c.duracion_minutos * 60_000 };
  });
}

type Adjunto = { nombre: string; contenido: string; tipo: string };
const aBase64 = (texto: string) => btoa(String.fromCharCode(...new TextEncoder().encode(texto)));

async function enviarCorreo(empresa: Pick<EmpresaFila, 'nombre' | 'correo'>, destinatario: string, asunto: string, html: string, replyTo = true, adjunto?: Adjunto) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${empresa.nombre.replace(/[<>"]/g, '').trim() || 'Taller'} <${RESEND_FROM_EMAIL}>`,
      to: [destinatario], subject: asunto, html,
      ...(adjunto ? { attachments: [{ filename: adjunto.nombre, content: aBase64(adjunto.contenido), content_type: adjunto.tipo }] } : {}),
      ...(replyTo && empresa.correo && CORREO_VALIDO.test(empresa.correo) ? { reply_to: empresa.correo } : {}),
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

/** Un correo que no sale NO deshace la reserva: se anota y se sigue. */
async function enviarSeguro(empresa: EmpresaFila, destinatario: string | null | undefined, tipo: TipoCorreoCita, datos: Parameters<typeof construirCorreoCita>[1], adjunto?: Adjunto) {
  if (!destinatario || !CORREO_VALIDO.test(destinatario)) return;
  try {
    const { asunto, html } = construirCorreoCita(tipo, datos);
    await enviarCorreo(empresa, destinatario, asunto, html, true, adjunto);
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
  }
}

/** Archivo .ics y enlace de Google Calendar de una cita. El UID es el id de la cita: al reprogramar, el calendario actualiza el evento. */
function calendarioDe(e: EmpresaFila, c: { id: string; inicio: number; duracionMin: number; tipo: string | null; vehiculo: string | null; motivo: string | null; estado: string; reprogramaciones: number; token: string }) {
  const datos = {
    uid: c.id, inicio: c.inicio, fin: c.inicio + c.duracionMin * 60_000, resumen: `${c.tipo ?? 'Cita'} · ${e.nombre}`,
    descripcion: [c.vehiculo && `Vehículo: ${c.vehiculo}`, c.motivo && `Motivo: ${c.motivo}`, `Ver, cambiar o cancelar la cita: ${APP_URL}/cita/${c.token}`, e.telefono && `Teléfono del taller: ${e.telefono}`].filter(Boolean).join('\n'),
    ubicacion: [e.direccion_fiscal, e.ciudad].filter(Boolean).join(', ') || null,
    secuencia: c.reprogramaciones, confirmada: c.estado === 'confirmada',
  };
  const ics = construirIcs(datos);
  return { ics, google: enlaceGoogleCalendar(datos), adjunto: { nombre: 'cita.ics', contenido: ics, tipo: 'text/calendar; method=PUBLISH' } satisfies Adjunto };
}

const publicoDe = (e: EmpresaFila) => ({ nombre: e.nombre, brandColor: e.brand_color, logoUrl: e.logo_url, telefono: e.telefono, correo: e.correo, ciudad: e.ciudad });

async function manejarInfo(admin: SupabaseClient, slug: unknown) {
  const e = await empresaPorSlug(admin, slug);
  if (!e) return json({ error: 'Este taller no tiene las reservas online activadas.' }, 404);
  const tipos = await tiposDe(admin, e.id);
  return json({
    empresa: publicoDe(e),
    tipos: tipos.map((t) => ({ id: t.id, nombre: t.nombre, duracionMin: t.duracion_minutos })),
    confirmacion: e.reservas_confirmacion,
    antelacionHoras: e.reservas_antelacion_horas,
    diasMax: e.reservas_dias_max,
  });
}

async function manejarDisponibilidad(admin: SupabaseClient, slug: unknown, tipoId: unknown) {
  const e = await empresaPorSlug(admin, slug);
  if (!e) return json({ error: 'Este taller no tiene las reservas online activadas.' }, 404);
  const tipo = (await tiposDe(admin, e.id)).find((t) => t.id === tipoId);
  if (!tipo) return json({ error: 'Ese servicio no está disponible.' }, 404);
  const cfg = configDe(e);
  const ahora = Date.now();
  const ocupadas = await ocupadasEntre(admin, e.id, ahora, instanteMadrid(sumarDias(ultimoDia(cfg, ahora), 1), '00:00'));
  return json({ dias: disponibilidad(cfg, tipo.duracion_minutos, ocupadas, ahora), duracionMin: tipo.duracion_minutos });
}

async function manejarReservar(admin: SupabaseClient, req: Request, body: Record<string, unknown>, ip: string) {
  // Campo señuelo: un humano no lo ve ni lo rellena. A un robot se le dice que fue bien y no se hace nada.
  if (typeof body.web === 'string' && body.web.trim() !== '') return json({ ok: true, estado: 'confirmada', cuando: '', enlace: '' });

  if (!(await permitirPeticion(admin, `reservar:${ip}`, 6, 3600))) return json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }, 429);
  const v = validarSolicitud(body);
  if (!v.ok) return json({ error: v.error }, 400);
  const d = v.datos;

  if (!TURNSTILE_SECRET_KEY) {
    console.error(JSON.stringify({ reservas: 'sin_clave_turnstile' }));
    return json({ error: 'Las reservas online no están disponibles en este momento. Llama al taller, por favor.' }, 503);
  }
  if (!(await verificarTurnstile(body.captchaToken, ip === 'desconocida' ? null : ip, TURNSTILE_SECRET_KEY))) {
    return json({ error: 'No hemos podido verificar que eres una persona. Recarga la página e inténtalo de nuevo.' }, 400);
  }

  const e = await empresaPorSlug(admin, d.slug);
  if (!e) return json({ error: 'Este taller no tiene las reservas online activadas.' }, 404);
  const tipo = (await tiposDe(admin, e.id)).find((t) => t.id === d.tipoId);
  if (!tipo) return json({ error: 'Ese servicio no está disponible.' }, 404);

  // El hueco se vuelve a calcular aquí: lo que diga el navegador no vale.
  const cfg = configDe(e);
  const ahora = Date.now();
  const inicio = instanteMadrid(d.fecha, d.hora);
  if (d.fecha > ultimoDia(cfg, ahora) || !fechaValida(d.fecha)) return json({ error: 'Ese día aún no se puede reservar.' }, 409);
  const ocupadas = await ocupadasEntre(admin, e.id, inicio - 12 * 3600_000, inicio + 36 * 3600_000);
  if (!huecosDelDia(d.fecha, cfg, tipo.duracion_minutos, ocupadas, ahora).includes(d.hora)) {
    return json({ error: 'Ese hueco ya no está disponible. Elige otra hora.' }, 409);
  }

  const estado = e.reservas_confirmacion === 'manual' ? 'pendiente' : 'confirmada';
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { data: citaId, error } = await admin.rpc('reservar_cita_online', {
    p_empresa_id: e.id, p_fecha_hora: new Date(inicio).toISOString(), p_duracion: tipo.duracion_minutos, p_tipo_id: tipo.id,
    p_nombre: d.nombre, p_apellidos: d.apellidos, p_telefono: d.telefono, p_correo: d.correo, p_vehiculo: descripcionVehiculo(d.vehiculo, d.matricula),
    p_motivo: d.motivo, p_estado: estado, p_token: token,
  });
  if (error) {
    const m = error.message;
    if (m.includes('HUECO_OCUPADO')) return json({ error: 'Ese hueco acaba de ocuparse. Elige otra hora.' }, 409);
    if (m.includes('LIMITE_CLIENTE')) return json({ error: 'Ya tienes 2 citas abiertas con este taller. Cancela una o llámanos.' }, 429);
    if (m.includes('HUECO_PASADO')) return json({ error: 'Esa hora ya ha pasado.' }, 409);
    if (m.includes('RESERVAS_CERRADAS')) return json({ error: 'Este taller no tiene las reservas online activadas.' }, 404);
    Sentry.captureException(new Error(`reservar_cita_online: ${m}`));
    return json({ error: 'No se pudo guardar la reserva. Inténtalo de nuevo o llama al taller.' }, 500);
  }

  const cuando = fechaHoraLarga(inicio);
  const enlace = `${APP_URL}/cita/${token}`;
  const datos = { empresa: e, nombre: d.nombre, apellidos: d.apellidos, cuando, tipo: tipo.nombre, vehiculo: descripcionVehiculo(d.vehiculo, d.matricula), motivo: d.motivo, telefono: d.telefono, correo: d.correo, duracionMin: tipo.duracion_minutos };
  const cal = calendarioDe(e, { id: String(citaId), inicio, duracionMin: tipo.duracion_minutos, tipo: tipo.nombre, vehiculo: datos.vehiculo, motivo: d.motivo, estado, reprogramaciones: 0, token });
  const confirmada = estado === 'confirmada';
  await enviarSeguro(e, d.correo, confirmada ? 'cliente_confirmada' : 'cliente_pendiente',
    { ...datos, enlace, ...(confirmada ? { calendario: cal.google, conAdjunto: true } : {}) }, confirmada ? cal.adjunto : undefined);
  await enviarSeguro(e, e.correo, 'taller_nueva', datos);
  return json({ ok: true, estado, cuando, enlace, tipo: tipo.nombre, ics: cal.ics });
}

interface CitaPublica {
  id: string; empresa_id: string; fecha_hora: string; duracion_minutos: number; estado: string; contacto_nombre: string | null; contacto_apellidos: string | null;
  contacto_telefono: string | null; contacto_correo: string | null; origen: string; reprogramaciones: number;
  vehiculo_descripcion: string | null; motivo: string; tipo_cita_id: string | null; token_cliente: string;
}
const MAX_REPROGRAMACIONES = 3;
/** Se puede cambiar mientras esté abierta y en el futuro, y no se haya gastado el límite de cambios. */
const abierta = (c: CitaPublica) => (c.estado === 'pendiente' || c.estado === 'confirmada') && new Date(c.fecha_hora).getTime() > Date.now();

async function citaPorToken(admin: SupabaseClient, token: unknown): Promise<CitaPublica | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 80) return null;
  const { data } = await admin.from('citas').select('id, empresa_id, fecha_hora, duracion_minutos, estado, contacto_nombre, contacto_apellidos, contacto_telefono, contacto_correo, origen, reprogramaciones, vehiculo_descripcion, motivo, tipo_cita_id, token_cliente').eq('token_cliente', token).maybeSingle();
  return (data as CitaPublica | null) ?? null;
}

async function manejarCita(admin: SupabaseClient, token: unknown) {
  const c = await citaPorToken(admin, token);
  if (!c) return json({ error: 'Este enlace no es válido.' }, 404);
  const { data: emp } = await admin.from('empresas').select(COLUMNAS_EMPRESA).eq('id', c.empresa_id).single();
  const e = emp as EmpresaFila | null;
  if (!e) return json({ error: 'Este enlace no es válido.' }, 404);
  const tipo = c.tipo_cita_id ? (await admin.from('tipos_cita').select('nombre').eq('id', c.tipo_cita_id).maybeSingle()).data?.nombre ?? null : null;
  const inicio = new Date(c.fecha_hora).getTime();
  return json({
    empresa: publicoDe(e),
    cita: {
      cuando: fechaHoraLarga(inicio), estado: c.estado, tipo, vehiculo: c.vehiculo_descripcion, motivo: c.motivo, duracionMin: c.duracion_minutos,
      cancelable: abierta(c),
      reprogramable: abierta(c) && c.origen === 'online' && c.reprogramaciones < MAX_REPROGRAMACIONES,
      ics: c.estado === 'cancelada' ? null : calendarioDe(e, { id: c.id, inicio, duracionMin: c.duracion_minutos, tipo, vehiculo: c.vehiculo_descripcion, motivo: c.motivo, estado: c.estado, reprogramaciones: c.reprogramaciones, token: c.token_cliente }).ics,
    },
  });
}

/** Huecos para cambiar una cita: los mismos que al reservar su servicio, contando como libre el hueco que ya ocupa ella. */
async function manejarDisponibilidadCita(admin: SupabaseClient, token: unknown) {
  const c = await citaPorToken(admin, token);
  if (!c || c.origen !== 'online') return json({ error: 'Este enlace no es válido.' }, 404);
  const { data: emp } = await admin.from('empresas').select(COLUMNAS_EMPRESA).eq('id', c.empresa_id).eq('reservas_activas', true).eq('activo', true).maybeSingle();
  const e = emp as EmpresaFila | null;
  if (!e) return json({ error: 'Este taller no tiene las reservas online activadas. Llama al taller.' }, 404);
  const cfg = configDe(e);
  const ahora = Date.now();
  const ocupadas = await ocupadasEntre(admin, e.id, ahora, instanteMadrid(sumarDias(ultimoDia(cfg, ahora), 1), '00:00'), c.id);
  return json({ dias: disponibilidad(cfg, c.duracion_minutos, ocupadas, ahora), duracionMin: c.duracion_minutos });
}

async function manejarReprogramar(admin: SupabaseClient, body: Record<string, unknown>, ip: string) {
  if (!(await permitirPeticion(admin, `reprogramar:${ip}`, 10, 3600))) return json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }, 429);
  const c = await citaPorToken(admin, body.token);
  if (!c || c.origen !== 'online') return json({ error: 'Este enlace no es válido.' }, 404);
  if (!fechaValida(body.fecha) || !horaValida(body.hora)) return json({ error: 'Elige un día y una hora.' }, 400);
  const fecha = body.fecha as string;
  const hora = body.hora as string;
  if (!abierta(c)) return json({ error: 'Esta cita ya no se puede cambiar desde aquí. Llama al taller.' }, 409);
  if (c.reprogramaciones >= MAX_REPROGRAMACIONES) return json({ error: 'Ya has cambiado esta cita el máximo de veces. Cancélala y reserva otra, o llama al taller.' }, 409);
  const { data: emp } = await admin.from('empresas').select(COLUMNAS_EMPRESA).eq('id', c.empresa_id).eq('reservas_activas', true).eq('activo', true).maybeSingle();
  const e = emp as EmpresaFila | null;
  if (!e) return json({ error: 'Este taller no tiene las reservas online activadas. Llama al taller.' }, 404);

  // El hueco se vuelve a calcular aquí, contando como libre el de la propia cita: lo que diga el navegador no vale.
  const cfg = configDe(e);
  const ahora = Date.now();
  const inicio = instanteMadrid(fecha, hora);
  if (fecha > ultimoDia(cfg, ahora)) return json({ error: 'Ese día aún no se puede reservar.' }, 409);
  const ocupadas = await ocupadasEntre(admin, e.id, inicio - 12 * 3600_000, inicio + 36 * 3600_000, c.id);
  if (!huecosDelDia(fecha, cfg, c.duracion_minutos, ocupadas, ahora).includes(hora)) return json({ error: 'Ese hueco ya no está disponible. Elige otra hora.' }, 409);

  // Con confirmación manual el cambio vuelve a pasar por el taller; con la automática la cita conserva su estado.
  const estado = e.reservas_confirmacion === 'manual' ? 'pendiente' : c.estado;
  const { data, error } = await admin.rpc('reprogramar_cita_online', { p_token: c.token_cliente, p_fecha_hora: new Date(inicio).toISOString(), p_estado: estado });
  if (error) {
    const m = error.message;
    if (m.includes('HUECO_OCUPADO')) return json({ error: 'Ese hueco acaba de ocuparse. Elige otra hora.' }, 409);
    if (m.includes('HUECO_PASADO')) return json({ error: 'Esa hora ya ha pasado.' }, 409);
    if (m.includes('LIMITE_REPROGRAMACIONES')) return json({ error: 'Ya has cambiado esta cita el máximo de veces. Cancélala y reserva otra, o llama al taller.' }, 409);
    if (m.includes('CITA_NO_REPROGRAMABLE')) return json({ error: 'Esta cita ya no se puede cambiar desde aquí. Llama al taller.' }, 409);
    if (m.includes('CITA_NO_ENCONTRADA')) return json({ error: 'Este enlace no es válido.' }, 404);
    if (m.includes('RESERVAS_CERRADAS')) return json({ error: 'Este taller no tiene las reservas online activadas. Llama al taller.' }, 404);
    Sentry.captureException(new Error(`reprogramar_cita_online: ${m}`));
    return json({ error: 'No se pudo cambiar la cita. Inténtalo de nuevo o llama al taller.' }, 500);
  }
  const fila = (data as { reprogramaciones: number }[])[0];
  const tipo = c.tipo_cita_id ? (await admin.from('tipos_cita').select('nombre').eq('id', c.tipo_cita_id).maybeSingle()).data?.nombre ?? null : null;
  const cuando = fechaHoraLarga(inicio);
  const cal = calendarioDe(e, { id: c.id, inicio, duracionMin: c.duracion_minutos, tipo, vehiculo: c.vehiculo_descripcion, motivo: c.motivo, estado, reprogramaciones: fila?.reprogramaciones ?? c.reprogramaciones + 1, token: c.token_cliente });
  const datos = {
    empresa: e, nombre: c.contacto_nombre ?? 'Cliente', apellidos: c.contacto_apellidos, cuando, cuandoAntes: fechaHoraLarga(new Date(c.fecha_hora).getTime()), tipo,
    vehiculo: c.vehiculo_descripcion, motivo: c.motivo, telefono: c.contacto_telefono, correo: c.contacto_correo, duracionMin: c.duracion_minutos,
  };
  await enviarSeguro(e, c.contacto_correo, 'cliente_reprogramada',
    { ...datos, enlace: `${APP_URL}/cita/${c.token_cliente}`, ...(estado === 'confirmada' ? { calendario: cal.google, conAdjunto: true } : {}) }, estado === 'confirmada' ? cal.adjunto : undefined);
  await enviarSeguro(e, e.correo, 'taller_reprogramada', datos);
  return json({ ok: true, estado, cuando, ics: cal.ics });
}

async function manejarCancelar(admin: SupabaseClient, token: unknown) {
  const c = await citaPorToken(admin, token);
  if (!c) return json({ error: 'Este enlace no es válido.' }, 404);
  const { data, error } = await admin.rpc('cancelar_cita_online', { p_token: token });
  if (error) {
    if (error.message.includes('CITA_NO_CANCELABLE')) return json({ error: 'Esta cita ya no se puede cancelar. Llama al taller.' }, 409);
    if (error.message.includes('CITA_NO_ENCONTRADA')) return json({ error: 'Este enlace no es válido.' }, 404);
    Sentry.captureException(new Error(`cancelar_cita_online: ${error.message}`));
    return json({ error: 'No se pudo cancelar. Inténtalo de nuevo o llama al taller.' }, 500);
  }
  const fila = (data as { ya_cancelada: boolean; contacto_nombre: string | null; contacto_correo: string | null; fecha_hora: string; vehiculo_descripcion: string | null; motivo: string | null }[])[0];
  if (fila && !fila.ya_cancelada) {
    const { data: emp } = await admin.from('empresas').select(COLUMNAS_EMPRESA).eq('id', c.empresa_id).single();
    const e = emp as EmpresaFila | null;
    if (e) {
      const datos = { empresa: e, nombre: fila.contacto_nombre ?? 'Cliente', apellidos: c.contacto_apellidos, cuando: fechaHoraLarga(new Date(fila.fecha_hora).getTime()), vehiculo: fila.vehiculo_descripcion, motivo: fila.motivo, correo: fila.contacto_correo };
      await enviarSeguro(e, fila.contacto_correo, 'cliente_cancelada', datos);
      await enviarSeguro(e, e.correo, 'taller_cancelada', datos);
    }
  }
  return json({ ok: true });
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido.' }, 400); }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const ip = extraerIp(req.headers.get('x-forwarded-for'));
  if (!(await permitirPeticion(admin, `reservas-publicas:${ip}`, 60, 60))) {
    return json({ error: 'Demasiadas peticiones. Inténtalo de nuevo en un momento.' }, 429);
  }

  switch (String(body.action ?? '')) {
    case 'info': return manejarInfo(admin, body.slug);
    case 'disponibilidad': return manejarDisponibilidad(admin, body.slug, body.tipoId);
    case 'reservar': return manejarReservar(admin, req, body, ip);
    case 'cita': return manejarCita(admin, body.token);
    case 'disponibilidad_cita': return manejarDisponibilidadCita(admin, body.token);
    case 'reprogramar': return manejarReprogramar(admin, body, ip);
    case 'cancelar': return manejarCancelar(admin, body.token);
    default: return json({ error: 'Acción no reconocida.' }, 400);
  }
}, CORS_HEADERS));
