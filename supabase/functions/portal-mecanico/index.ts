// Portal del Mecánico — enlace público, sin login, que ve el técnico del
// taller (no un usuario de la app). La seguridad no viene de un JWT de
// usuario (no existe: el técnico no tiene cuenta), sino de que `token`
// coincida con tecnicos.portal_token — a partir de ahí se usa la service
// role para leer/escribir solo los datos de ESE técnico, nunca vía RLS.
//
// Nota: la asignación de técnico en una OT se guarda por nombre
// (ordenes_trabajo.tecnico_asignado), no por id — se respeta ese mismo
// criterio aquí para no introducir un segundo modelo de asignación.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  Tecnico, OtRow, AccionEstado, puedeMarcarTarea, debeIniciarReparacion, formatearOrdenesPortal,
  transicionMecanico, normalizarDuracion, limpiarNota, EVENTOS, ESTADOS_VISIBLES, ESTADOS_EDITABLES, NOTA_MAX,
  esFiltro, normalizarEstadoFiltro, fechaValida, normalizarKm,
} from './logic.ts';
import { extraerIp, permitirPeticion } from '../_shared/rateLimit.ts';
import { initSentry, conSentry } from '../_shared/sentry.ts';

initSentry('portal-mecanico');

// Límite por IP: generoso para un uso normal (un técnico recargando o
// marcando varias tareas), suficiente para frenar fuerza bruta del token o
// abuso automatizado del endpoint.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_VENTANA_SEGUNDOS = 60;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

async function manejarGet(admin: SupabaseClient, tecnico: Tecnico) {
  const { data: empresa } = await admin
    .from('empresas')
    .select('nombre, brand_color, logo_url')
    .eq('id', tecnico.empresa_id)
    .single();

  const { data: ordenesData } = await admin
    .from('ordenes_trabajo')
    .select('id, numero, vehiculo_id, estado, descripcion_problema, diagnostico, kilometraje_entrada, fecha_estimada_entrega, created_at, ' +
      'es_cambio_aceite, aceite_anotado_en, filtro_aire, filtro_aceite, filtro_combustible, filtro_habitaculo')
    .eq('empresa_id', tecnico.empresa_id)
    .eq('tecnico_asignado', tecnico.nombre)
    .in('estado', [...ESTADOS_VISIBLES]);
  const ordenes = (ordenesData ?? []) as unknown as OtRow[];

  const vehiculoIds = [...new Set(ordenes.map(o => o.vehiculo_id))];
  const otIds = ordenes.map(o => o.id);
  const [{ data: vehiculos }, { data: lineas }, { data: eventos }] = await Promise.all([
    vehiculoIds.length
      ? admin.from('vehiculos').select('id, marca, modelo, matricula, aceite_proxima_fecha, aceite_proximo_km').in('id', vehiculoIds)
      : Promise.resolve({ data: [] }),
    otIds.length
      ? admin.from('lineas_ot').select('id, ot_id, descripcion, completado, duracion_min, posicion')
          .in('ot_id', otIds).eq('tipo', 'mano_de_obra').order('posicion')
      : Promise.resolve({ data: [] }),
    // Del historial solo hacen falta el ingreso al taller y las notas de este técnico.
    otIds.length
      ? admin.from('eventos_ot').select('ot_id, fecha, descripcion').in('ot_id', otIds)
          .or(`descripcion.ilike.*recibido en taller*,descripcion.like.Nota de *`).order('fecha')
      : Promise.resolve({ data: [] }),
  ]);

  return json({
    empresa: empresa ? { nombre: empresa.nombre, brandColor: empresa.brand_color, logoUrl: empresa.logo_url } : null,
    tecnico: { nombre: tecnico.nombre },
    ordenes: formatearOrdenesPortal(ordenes, vehiculos ?? [], lineas ?? [], eventos ?? [], tecnico.nombre),
  });
}

type OtAccion = { id: string; empresa_id: string; tecnico_asignado: string | null; estado: string; es_cambio_aceite: boolean };

/** La orden, solo si es de este técnico (misma empresa y asignada a él). */
async function ordenDelTecnico(admin: SupabaseClient, tecnico: Tecnico, otId: string): Promise<OtAccion | Response> {
  if (!otId) return json({ error: 'Orden no encontrada.' }, 404);
  const { data: ot, error } = await admin
    .from('ordenes_trabajo')
    .select('id, empresa_id, tecnico_asignado, estado, es_cambio_aceite')
    .eq('id', otId)
    .maybeSingle();
  if (error || !ot) return json({ error: 'Orden no encontrada.' }, 404);
  if (!puedeMarcarTarea(tecnico, ot)) return json({ error: 'No autorizado.' }, 403);
  return ot as OtAccion;
}

/** Anota en el historial y avisa a la pantalla del taller de que el mecánico tocó la orden. */
async function registrar(admin: SupabaseClient, otId: string, descripcion: string, cambios: Record<string, unknown> = {}) {
  const ahora = new Date().toISOString();
  await admin.from('eventos_ot').insert({ ot_id: otId, fecha: ahora, descripcion });
  await admin.from('ordenes_trabajo').update({ ...cambios, mecanico_actualizado_en: ahora }).eq('id', otId);
}

const SOLO_EN_TALLER = 'Esta orden ya no está en reparación. Si hay que cambiar algo, pulsa «Reabrir» o avisa al taller.';

async function manejarMarcarTarea(
  admin: SupabaseClient, tecnico: Tecnico, lineaId: string, completado: boolean, duracion: unknown, soloDuracion: boolean,
) {
  const { data: linea, error: lErr } = await admin
    .from('lineas_ot')
    .select('id, ot_id, tipo, descripcion, completado')
    .eq('id', lineaId)
    .maybeSingle();
  if (lErr || !linea || linea.tipo !== 'mano_de_obra') return json({ error: 'Tarea no encontrada.' }, 404);

  const ot = await ordenDelTecnico(admin, tecnico, linea.ot_id);
  if (ot instanceof Response) return ot;
  if (!(ESTADOS_EDITABLES as readonly string[]).includes(ot.estado)) return json({ error: SOLO_EN_TALLER }, 409);

  const d = normalizarDuracion(duracion);
  if (!d.ok) return json({ error: 'El tiempo debe estar entre 5 minutos y 24 horas.' }, 400);

  if (soloDuracion) {
    if (!linea.completado || d.minutos === null) return json({ error: 'Marca la tarea como hecha para anotar su tiempo.' }, 400);
    const { error } = await admin.from('lineas_ot').update({ duracion_min: d.minutos }).eq('id', lineaId);
    if (error) return json({ error: 'No se pudo guardar.' }, 500);
    await registrar(admin, ot.id, EVENTOS.duracion(tecnico.nombre, linea.descripcion, d.minutos));
    return json({ ok: true });
  }

  // Al desmarcar se borra también el tiempo: ya no corresponde a una tarea hecha.
  const { error: updErr } = await admin
    .from('lineas_ot')
    .update({ completado, duracion_min: completado ? d.minutos : null })
    .eq('id', lineaId);
  if (updErr) return json({ error: 'No se pudo guardar.' }, 500);

  // El técnico marcando una tarea es la prueba de que el trabajo ya empezó
  // — si la OT seguía en "recibido" (nadie la había avanzado a mano
  // todavía), se adelanta sola a "en_reparacion" en cuanto llega la primera
  // marca. «Listo» lo decide él con su botón; entregar es cosa del taller.
  const inicia = debeIniciarReparacion(ot.estado, completado);
  if (linea.completado !== completado) {
    await registrar(
      admin, ot.id,
      completado ? EVENTOS.tareaHecha(tecnico.nombre, linea.descripcion, d.minutos) : EVENTOS.tareaDeshecha(tecnico.nombre, linea.descripcion),
    );
  }
  if (inicia) {
    await admin.from('ordenes_trabajo').update({ estado: 'en_reparacion' }).eq('id', ot.id).eq('estado', 'recibido');
    await registrar(admin, ot.id, EVENTOS.primeraTarea(tecnico.nombre));
  }

  return json({ ok: true, estado: inicia ? 'en_reparacion' : ot.estado });
}

async function manejarEstado(admin: SupabaseClient, tecnico: Tecnico, otId: string, accion: AccionEstado) {
  const ot = await ordenDelTecnico(admin, tecnico, otId);
  if (ot instanceof Response) return ot;
  const nuevo = transicionMecanico(ot.estado, accion);
  if (!nuevo) return json({ error: 'La orden ha cambiado de estado. Actualiza la página.' }, 409);

  let pendientes = 0;
  if (accion === 'listo') {
    const { count } = await admin
      .from('lineas_ot')
      .select('*', { count: 'exact', head: true })
      .eq('ot_id', ot.id).eq('tipo', 'mano_de_obra').eq('completado', false);
    pendientes = count ?? 0;
  }

  // Condicionado al estado leído: si el taller la movió entre medias, no se pisa.
  const { data: cambiadas, error } = await admin
    .from('ordenes_trabajo')
    .update({ estado: nuevo })
    .eq('id', ot.id).eq('estado', ot.estado)
    .select('id');
  if (error) return json({ error: 'No se pudo guardar.' }, 500);
  if (!cambiadas?.length) return json({ error: 'La orden ha cambiado de estado. Actualiza la página.' }, 409);

  const texto = accion === 'empezar' ? EVENTOS.empezar(tecnico.nombre)
    : accion === 'listo' ? EVENTOS.listo(tecnico.nombre, pendientes)
    : EVENTOS.reabrir(tecnico.nombre);
  // Al reabrir, el aviso «vehículo listo» al cliente deja de ser cierto: se vuelve a poder enviar.
  await registrar(admin, ot.id, texto, accion === 'reabrir' ? { notificacion_enviada: false } : {});
  return json({ ok: true, estado: nuevo });
}

// ---- Cambio de aceite ----

async function manejarAceite(admin: SupabaseClient, tecnico: Tecnico, otId: string, activo: boolean) {
  const ot = await ordenDelTecnico(admin, tecnico, otId);
  if (ot instanceof Response) return ot;
  if (!(ESTADOS_EDITABLES as readonly string[]).includes(ot.estado)) return json({ error: SOLO_EN_TALLER }, 409);
  if (ot.es_cambio_aceite === activo) return json({ ok: true });
  await registrar(admin, ot.id, EVENTOS.aceite(tecnico.nombre, activo), { es_cambio_aceite: activo });
  return json({ ok: true });
}

async function manejarFiltro(admin: SupabaseClient, tecnico: Tecnico, otId: string, filtro: unknown, estado: unknown) {
  const ot = await ordenDelTecnico(admin, tecnico, otId);
  if (ot instanceof Response) return ot;
  if (!(ESTADOS_EDITABLES as readonly string[]).includes(ot.estado)) return json({ error: SOLO_EN_TALLER }, 409);
  if (!ot.es_cambio_aceite) return json({ error: 'Esta orden no está marcada como cambio de aceite.' }, 409);
  const e = normalizarEstadoFiltro(estado);
  if (!esFiltro(filtro) || !e.ok) return json({ error: 'Filtro no reconocido.' }, 400);
  // `filtro` viene de una lista cerrada: el nombre de columna nunca sale del texto del cliente.
  await registrar(admin, ot.id, EVENTOS.filtro(tecnico.nombre, filtro, e.estado), { [`filtro_${filtro}`]: e.estado });
  return json({ ok: true });
}

async function manejarAceiteProximo(admin: SupabaseClient, tecnico: Tecnico, otId: string, fecha: unknown, km: unknown) {
  const ot = await ordenDelTecnico(admin, tecnico, otId);
  if (ot instanceof Response) return ot;
  if (!(ESTADOS_VISIBLES as readonly string[]).includes(ot.estado)) return json({ error: SOLO_EN_TALLER }, 409);
  const f = fechaValida(fecha);
  const k = normalizarKm(km);
  if (!f) return json({ error: 'Indica la fecha del próximo cambio.' }, 400);
  if (!k.ok) return json({ error: 'Los kilómetros del próximo cambio no son válidos.' }, 400);
  // La función de la base de datos valida los límites y escribe en la ficha del vehículo, en la
  // orden y en el historial de una vez. Sus mensajes de validación (P0001) son para el mecánico.
  const { error } = await admin.rpc('anotar_cambio_aceite', {
    p_ot_id: ot.id, p_proxima_fecha: f, p_proximo_km: k.km, p_autor: tecnico.nombre,
  });
  if (error) return json({ error: error.code === 'P0001' ? error.message : 'No se pudo guardar.' }, error.code === 'P0001' ? 400 : 500);
  await admin.from('ordenes_trabajo').update({ mecanico_actualizado_en: new Date().toISOString() }).eq('id', ot.id);
  return json({ ok: true });
}

async function manejarNota(admin: SupabaseClient, tecnico: Tecnico, otId: string, texto: unknown) {
  const ot = await ordenDelTecnico(admin, tecnico, otId);
  if (ot instanceof Response) return ot;
  if (!(ESTADOS_VISIBLES as readonly string[]).includes(ot.estado)) return json({ error: SOLO_EN_TALLER }, 409);
  const nota = limpiarNota(texto);
  if (!nota) return json({ error: `Escribe una nota de hasta ${NOTA_MAX} caracteres.` }, 400);
  await registrar(admin, ot.id, EVENTOS.nota(tecnico.nombre, nota));
  return json({ ok: true });
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de la petición inválido.' }, 400);
  }

  const token = String(body.token ?? '').trim();
  if (!token) return json({ error: 'Falta el enlace.' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Se limita ANTES de tocar la tabla tecnicos, para que ni la propia
  // búsqueda del token se pueda machacar sin límite.
  const ip = extraerIp(req.headers.get('x-forwarded-for'));
  if (!(await permitirPeticion(admin, `portal-mecanico:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_VENTANA_SEGUNDOS))) {
    return json({ error: 'Demasiadas peticiones. Inténtalo de nuevo en un momento.' }, 429);
  }

  const { data: tecnico, error: tecnicoErr } = await admin
    .from('tecnicos')
    .select('id, empresa_id, nombre, activo')
    .eq('portal_token', token)
    .maybeSingle();
  if (tecnicoErr) return json({ error: 'Error interno.' }, 500);
  // Un técnico dado de baja pierde el acceso aunque conserve el enlace.
  if (!tecnico || tecnico.activo === false) return json({ error: 'Este enlace no es válido.' }, 404);

  const accion = String(body.action ?? '');
  if (accion === 'marcar_tarea') {
    return manejarMarcarTarea(admin, tecnico, String(body.lineaId ?? ''), Boolean(body.completado), body.duracionMin, false);
  }
  if (accion === 'duracion') {
    return manejarMarcarTarea(admin, tecnico, String(body.lineaId ?? ''), true, body.duracionMin, true);
  }
  if (accion === 'empezar' || accion === 'listo' || accion === 'reabrir') {
    return manejarEstado(admin, tecnico, String(body.otId ?? ''), accion);
  }
  if (accion === 'nota') return manejarNota(admin, tecnico, String(body.otId ?? ''), body.texto);
  if (accion === 'aceite') return manejarAceite(admin, tecnico, String(body.otId ?? ''), body.activo === true);
  if (accion === 'filtro') return manejarFiltro(admin, tecnico, String(body.otId ?? ''), body.filtro, body.estado);
  if (accion === 'aceite_proximo') return manejarAceiteProximo(admin, tecnico, String(body.otId ?? ''), body.fecha, body.km);
  if (accion) return json({ error: 'Acción no reconocida.' }, 400);

  return manejarGet(admin, tecnico);
}, CORS_HEADERS));
