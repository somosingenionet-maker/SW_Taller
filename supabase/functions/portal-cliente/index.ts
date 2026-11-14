// Portal del Cliente — enlace público, sin login, que ve el cliente del
// taller (no un usuario de la app). La seguridad no viene de un JWT de
// usuario (no existe: el cliente no tiene cuenta), sino de que `token`
// coincida con clientes.portal_token — a partir de ahí se usa la service
// role para leer/escribir solo los datos de ESE cliente, nunca vía RLS.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  Cliente,
  puedeResponderPresupuesto,
  calcularVehiculosAMostrar,
  otActivaPorVehiculo,
  presupuestosPendientes,
  puedeResponderInspeccion,
  formatearInforme,
  type OtCliente,
  type InspeccionCliente,
  type PuntoCliente,
  textoAceptacion,
  validarAceptacion,
  dispositivoDe,
  ipDeCabecera,
  puntosElegibles,
  validarAceptacionInspeccion,
  textoAceptacionInspeccion,
} from './logic.ts';
import { extraerIp, permitirPeticion } from '../_shared/rateLimit.ts';
import { initSentry, conSentry } from '../_shared/sentry.ts';

initSentry('portal-cliente');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Límite por IP: generoso para un uso normal (un cliente consultando su
// estado o respondiendo un presupuesto), suficiente para frenar fuerza
// bruta del token o abuso automatizado del endpoint.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_VENTANA_SEGUNDOS = 60;

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

const BUCKET_INSPECCIONES = 'inspecciones';
const CADUCIDAD_FOTOS = 3600; // los enlaces de las fotos caducan a la hora: cada visita pide los suyos

/** Informes de inspección que el taller le ha enviado a este cliente (los 5 más recientes). */
async function cargarInformes(admin: SupabaseClient, cliente: Cliente) {
  const { data: insps } = await admin.from('inspecciones')
    .select('id, orden_id, vehiculo_id, cliente_id, estado, nota_general, enviada_en, respondida_en, fotos_borradas_en')
    .eq('cliente_id', cliente.id).in('estado', ['enviada', 'respondida'])
    .order('enviada_en', { ascending: false }).limit(5);
  const lista = (insps ?? []) as InspeccionCliente[];
  if (!lista.length) return [];

  const [{ data: puntos }, { data: vehiculos }] = await Promise.all([
    admin.from('inspeccion_puntos')
      .select('id, inspeccion_id, categoria, nombre, posicion, estado, nota, fotos, reparacion, precio, decision')
      .in('inspeccion_id', lista.map((i) => i.id)),
    admin.from('vehiculos').select('id, marca, modelo, matricula').in('id', [...new Set(lista.map((i) => i.vehiculo_id))]),
  ]);
  const filas = (puntos ?? []) as (PuntoCliente & { inspeccion_id: string })[];

  const rutas = [...new Set(filas.filter((p) => p.estado === 'urgente' || p.estado === 'atencion').flatMap((p) => p.fotos))];
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await admin.storage.from(BUCKET_INSPECCIONES).createSignedUrls(rutas, CADUCIDAD_FOTOS);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }

  return lista.map((i) => {
    const v = (vehiculos ?? []).find((x) => x.id === i.vehiculo_id);
    return formatearInforme(i, v ? `${v.marca} ${v.modelo} (${v.matricula})` : '', filas.filter((p) => p.inspeccion_id === i.id), urls);
  });
}

async function manejarResponderInspeccion(
  admin: SupabaseClient, cliente: Cliente, inspeccionId: string,
  entrada: { aprobados: unknown; nombre: unknown; acepta: unknown; totalVisto: unknown }, req: Request,
) {
  const { data: insp } = await admin.from('inspecciones')
    .select('id, orden_id, vehiculo_id, cliente_id, estado, enviada_en').eq('id', inspeccionId).maybeSingle();
  if (!insp) return json({ error: 'Informe no encontrado.' }, 404);
  if (insp.cliente_id !== cliente.id) return json({ error: 'No autorizado.' }, 403);
  if (!puedeResponderInspeccion(cliente, insp)) return json({ error: 'Este informe ya no está pendiente de respuesta.' }, 400);

  const { data: puntos } = await admin.from('inspeccion_puntos').select('id, nombre, estado, precio').eq('inspeccion_id', inspeccionId);
  const elegibles = puntosElegibles(puntos ?? []);
  if (elegibles.length === 0) return json({ error: 'Este informe no tiene reparaciones con precio que responder.' }, 400);

  const v = validarAceptacionInspeccion(entrada, elegibles);
  if (!v.ok) return json({ error: v.error }, v.status);

  // Primero se cierra el informe (solo si seguía «enviada»): dos pulsaciones seguidas no registran dos respuestas.
  const ahora = new Date().toISOString();
  const cambios: Record<string, unknown> = { estado: 'respondida', respondida_en: ahora };
  if (v.aprobados.length > 0) {
    const { data: veh } = await admin.from('vehiculos').select('marca, modelo, matricula').eq('id', insp.vehiculo_id).maybeSingle();
    const descripcionVehiculo = veh ? `${veh.marca} ${veh.modelo} (${veh.matricula})` : 'el vehículo';
    cambios.aceptacion_nombre = v.nombre;
    cambios.aceptacion_en = ahora;
    cambios.aceptacion_total = v.total;
    cambios.aceptacion_texto = textoAceptacionInspeccion(descripcionVehiculo, insp.enviada_en, elegibles.filter((e) => v.aprobados.includes(e.id)), v.total);
    cambios.aceptacion_ip = ipDeCabecera(req.headers.get('x-forwarded-for'));
    cambios.aceptacion_dispositivo = dispositivoDe(req.headers.get('user-agent'));
  }
  const { data: cerrada, error: iErr } = await admin.from('inspecciones').update(cambios).eq('id', inspeccionId).eq('estado', 'enviada').select('id');
  if (iErr) return json({ error: 'No se pudo guardar la respuesta.' }, 500);
  if (!cerrada?.length) return json({ error: 'Este informe ya no está pendiente de respuesta.' }, 400);

  if (v.aprobados.length) {
    const { error } = await admin.from('inspeccion_puntos').update({ decision: 'aprobado' }).in('id', v.aprobados);
    if (error) return json({ error: 'No se pudo guardar la respuesta.' }, 500);
  }
  if (v.rechazados.length) {
    const { error } = await admin.from('inspeccion_puntos').update({ decision: 'rechazado' }).in('id', v.rechazados);
    if (error) return json({ error: 'No se pudo guardar la respuesta.' }, 500);
  }

  const eur = (n: number) => n.toFixed(2).replace('.', ',');
  await admin.from('eventos_ot').insert({
    ot_id: insp.orden_id,
    descripcion: v.aprobados.length
      ? `${v.nombre} aprobó desde el portal ${v.aprobados.length} de ${elegibles.length} reparación(es) de la inspección (${eur(v.total)} € + IVA)${v.rechazados.length ? `; rechazó ${v.rechazados.length}` : ''}. Pendiente de añadirlas a la orden.`
      : `El cliente rechazó desde el portal ${elegibles.length === 1 ? 'la reparación propuesta' : `las ${elegibles.length} reparaciones propuestas`} en la inspección.`,
  });
  await admin.from('ordenes_trabajo').update({ mecanico_actualizado_en: ahora }).eq('id', insp.orden_id);
  return json({ ok: true });
}

async function manejarGet(admin: SupabaseClient, cliente: Cliente) {
  const { data: empresa } = await admin
    .from('empresas')
    .select('nombre, brand_color, logo_url')
    .eq('id', cliente.empresa_id)
    .single();

  const { data: relaciones } = await admin
    .from('cliente_vehiculo')
    .select('vehiculo_id')
    .eq('cliente_id', cliente.id);
  const asociadosIds = (relaciones ?? []).map(r => r.vehiculo_id as string);

  // Todas las OTs de este cliente — de aquí salen tanto el estado activo por
  // vehículo como los presupuestos pendientes. Importante: un vehículo puede
  // tener una OT a nombre de este cliente sin estar formalmente asociado en
  // cliente_vehiculo (p. ej. un vehículo de flota que factura otro contacto),
  // así que la lista de vehículos a mostrar sale de la UNIÓN de ambas fuentes
  // — nunca solo de cliente_vehiculo, o ese caso se queda sin nombre de vehículo.
  const { data: ordenesCliente } = await admin
    .from('ordenes_trabajo')
    .select('id, numero, vehiculo_id, estado, fecha_estimada_entrega, created_at, total, presupuesto_estado, presupuesto_aprobado')
    .eq('cliente_id', cliente.id)
    .order('created_at', { ascending: false });
  const ordenes = (ordenesCliente ?? []) as OtCliente[];

  const vehiculoIds = calcularVehiculosAMostrar(asociadosIds, ordenes);

  const { data: vehiculos } = vehiculoIds.length
    ? await admin.from('vehiculos').select('id, marca, modelo, matricula').in('id', vehiculoIds)
    : { data: [] };

  const otPorVehiculo = otActivaPorVehiculo(ordenes);

  const presupuestosOt = presupuestosPendientes(ordenes);

  const presupuestos = [];
  for (const ot of presupuestosOt) {
    const { data: lineas } = await admin
      .from('lineas_ot')
      .select('descripcion, cantidad, precio_unitario, subtotal')
      .eq('ot_id', ot.id)
      .order('posicion');
    const vehiculo = (vehiculos ?? []).find(v => v.id === ot.vehiculo_id);
    const descripcionVehiculo = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})` : '';
    presupuestos.push({
      otId: ot.id,
      numero: ot.numero,
      vehiculo: descripcionVehiculo,
      total: ot.total,
      // El texto que se acepta lo escribe el servidor: es exactamente lo que se guardará como prueba.
      textoAceptacion: textoAceptacion(ot.numero, descripcionVehiculo, Number(ot.total)),
      lineas: (lineas ?? []).map(l => ({
        descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precio_unitario, subtotal: l.subtotal,
      })),
    });
  }

  const { data: alertas } = vehiculoIds.length
    ? await admin
        .from('alertas')
        .select('id, vehiculo_id, tipo, fecha_limite, kilometraje_limite, estado')
        .in('vehiculo_id', vehiculoIds)
        .neq('estado', 'atendida')
        .order('fecha_limite')
    : { data: [] };

  const { data: facturas } = await admin
    .from('facturas')
    .select('numero, fecha, estado, total')
    .eq('cliente_id', cliente.id)
    .not('estado', 'in', '(borrador,cancelada)')
    .order('fecha', { ascending: false })
    .limit(10);

  const informes = await cargarInformes(admin, cliente);

  return json({
    empresa: empresa ? { nombre: empresa.nombre, brandColor: empresa.brand_color, logoUrl: empresa.logo_url } : null,
    cliente: { nombre: cliente.nombre, apellidos: cliente.apellidos },
    informes,
    vehiculos: (vehiculos ?? []).map(v => {
      const ot = otPorVehiculo.get(v.id);
      return {
        id: v.id,
        marca: v.marca,
        modelo: v.modelo,
        matricula: v.matricula,
        estadoOt: ot?.estado ?? null,
        fechaEstimadaEntrega: ot?.fecha_estimada_entrega ?? null,
      };
    }),
    presupuestosPendientes: presupuestos,
    alertas: (alertas ?? []).map(a => ({
      tipo: a.tipo, fechaLimite: a.fecha_limite, kilometrajeLimite: a.kilometraje_limite,
    })),
    facturas: (facturas ?? []).map(f => ({ numero: f.numero, fecha: f.fecha, estado: f.estado, total: f.total })),
  });
}

async function manejarResponderPresupuesto(
  admin: SupabaseClient, cliente: Cliente, otId: string, aprobado: boolean,
  aceptacion: { nombre: unknown; acepta: unknown; totalVisto: unknown }, req: Request,
) {
  const { data: ot, error: otErr } = await admin
    .from('ordenes_trabajo')
    .select('id, numero, cliente_id, vehiculo_id, total, presupuesto_estado, presupuesto_aprobado, aceptacion_presupuesto_en')
    .eq('id', otId)
    .maybeSingle();
  if (otErr || !ot) return json({ error: 'Presupuesto no encontrado.' }, 404);
  if (!puedeResponderPresupuesto(cliente, ot)) return json({ error: 'No autorizado.' }, 403);
  if (ot.presupuesto_estado !== 'enviado' || ot.presupuesto_aprobado != null) return json({ error: 'Este presupuesto ya no está pendiente de respuesta.' }, 400);

  const cambios: Record<string, unknown> = { presupuesto_aprobado: aprobado };
  let eventoAceptado = '';
  if (aprobado) {
    // Aceptar exige nombre, casilla y haber visto el importe vigente; el servidor guarda la prueba.
    const v = validarAceptacion(aceptacion, Number(ot.total));
    if (!v.ok) return json({ error: v.error }, v.status);
    const { data: veh } = await admin.from('vehiculos').select('marca, modelo, matricula').eq('id', ot.vehiculo_id).maybeSingle();
    const descripcionVehiculo = veh ? `${veh.marca} ${veh.modelo} (${veh.matricula})` : '';
    const total = Number(ot.total);
    cambios.aceptacion_presupuesto_nombre = v.nombre;
    cambios.aceptacion_presupuesto_en = new Date().toISOString();
    cambios.aceptacion_presupuesto_total = total;
    cambios.aceptacion_presupuesto_texto = textoAceptacion(ot.numero, descripcionVehiculo, total);
    cambios.aceptacion_presupuesto_ip = ipDeCabecera(req.headers.get('x-forwarded-for'));
    cambios.aceptacion_presupuesto_dispositivo = dispositivoDe(req.headers.get('user-agent'));
    eventoAceptado = `Presupuesto aceptado por ${v.nombre} desde el portal (importe ${total.toFixed(2).replace('.', ',')} €).`;
  }

  // Solo si seguía pendiente: dos pulsaciones seguidas no registran dos respuestas.
  const { data: actualizadas, error: updErr } = await admin.from('ordenes_trabajo').update(cambios).eq('id', otId).is('presupuesto_aprobado', null).select('id');
  if (updErr) return json({ error: 'No se pudo guardar la respuesta.' }, 500);
  if (!actualizadas?.length) return json({ error: 'Este presupuesto ya no está pendiente de respuesta.' }, 400);

  await admin.from('eventos_ot').insert({
    ot_id: otId,
    descripcion: aprobado ? eventoAceptado : 'Presupuesto rechazado por el cliente desde el portal.',
  });

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

  // Se limita ANTES de tocar la tabla clientes, para que ni la propia
  // búsqueda del token se pueda machacar sin límite.
  const ip = extraerIp(req.headers.get('x-forwarded-for'));
  if (!(await permitirPeticion(admin, `portal-cliente:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_VENTANA_SEGUNDOS))) {
    return json({ error: 'Demasiadas peticiones. Inténtalo de nuevo en un momento.' }, 429);
  }

  const { data: cliente, error: clienteErr } = await admin
    .from('clientes')
    .select('id, empresa_id, nombre, apellidos')
    .eq('portal_token', token)
    .maybeSingle();
  if (clienteErr) return json({ error: 'Error interno.' }, 500);
  if (!cliente) return json({ error: 'Este enlace no es válido.' }, 404);

  if (body.action === 'responder_presupuesto') {
    return manejarResponderPresupuesto(admin, cliente, String(body.otId ?? ''), body.aprobado === true,
      { nombre: body.nombre, acepta: body.acepta, totalVisto: body.totalVisto }, req);
  }

  if (body.action === 'responder_inspeccion') {
    return manejarResponderInspeccion(admin, cliente, String(body.inspeccionId ?? ''),
      { aprobados: body.aprobados, nombre: body.nombre, acepta: body.acepta, totalVisto: body.totalVisto }, req);
  }

  return manejarGet(admin, cliente);
}, CORS_HEADERS));
