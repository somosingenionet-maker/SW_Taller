// Portal del Cliente — enlace público, sin login, que ve el cliente del
// taller (no un usuario de la app). La seguridad no viene de un JWT de
// usuario (no existe: el cliente no tiene cuenta), sino de que `token`
// coincida con clientes.portal_token — a partir de ahí se usa la service
// role para leer/escribir solo los datos de ESE cliente, nunca vía RLS.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

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

type Cliente = { id: string; empresa_id: string; nombre: string; apellidos: string };

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
  type OtCliente = {
    id: string; vehiculo_id: string; estado: string; fecha_estimada_entrega: string | null; created_at: string;
    total: number; presupuesto_estado: string | null; presupuesto_aprobado: boolean | null;
  };
  const { data: ordenesCliente } = await admin
    .from('ordenes_trabajo')
    .select('id, vehiculo_id, estado, fecha_estimada_entrega, created_at, total, presupuesto_estado, presupuesto_aprobado')
    .eq('cliente_id', cliente.id)
    .order('created_at', { ascending: false });
  const ordenes = (ordenesCliente ?? []) as OtCliente[];

  const activasEstados = new Set(['presupuesto', 'recibido', 'en_reparacion', 'listo']);
  const activasVehiculoIds = ordenes.filter(o => activasEstados.has(o.estado)).map(o => o.vehiculo_id);
  const vehiculoIds = [...new Set([...asociadosIds, ...activasVehiculoIds])];

  const { data: vehiculos } = vehiculoIds.length
    ? await admin.from('vehiculos').select('id, marca, modelo, matricula').in('id', vehiculoIds)
    : { data: [] };

  // Solo la OT activa más reciente por vehículo (ordenes ya viene ordenado desc).
  const otPorVehiculo = new Map<string, OtCliente>();
  for (const ot of ordenes) {
    if (activasEstados.has(ot.estado) && !otPorVehiculo.has(ot.vehiculo_id)) otPorVehiculo.set(ot.vehiculo_id, ot);
  }

  const presupuestosOt = ordenes.filter(o => o.presupuesto_estado === 'enviado' && o.presupuesto_aprobado == null);

  const presupuestos = [];
  for (const ot of presupuestosOt) {
    const { data: lineas } = await admin
      .from('lineas_ot')
      .select('descripcion, cantidad, precio_unitario, subtotal')
      .eq('ot_id', ot.id)
      .order('posicion');
    const vehiculo = (vehiculos ?? []).find(v => v.id === ot.vehiculo_id);
    presupuestos.push({
      otId: ot.id,
      vehiculo: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})` : '',
      total: ot.total,
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

  return json({
    empresa: empresa ? { nombre: empresa.nombre, brandColor: empresa.brand_color, logoUrl: empresa.logo_url } : null,
    cliente: { nombre: cliente.nombre, apellidos: cliente.apellidos },
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

async function manejarResponderPresupuesto(admin: SupabaseClient, cliente: Cliente, otId: string, aprobado: boolean) {
  const { data: ot, error: otErr } = await admin
    .from('ordenes_trabajo')
    .select('id, cliente_id, presupuesto_estado')
    .eq('id', otId)
    .maybeSingle();
  if (otErr || !ot) return json({ error: 'Presupuesto no encontrado.' }, 404);
  if (ot.cliente_id !== cliente.id) return json({ error: 'No autorizado.' }, 403);
  if (ot.presupuesto_estado !== 'enviado') return json({ error: 'Este presupuesto ya no está pendiente de respuesta.' }, 400);

  const { error: updErr } = await admin.from('ordenes_trabajo').update({ presupuesto_aprobado: aprobado }).eq('id', otId);
  if (updErr) return json({ error: 'No se pudo guardar la respuesta.' }, 500);

  await admin.from('eventos_ot').insert({
    ot_id: otId,
    descripcion: aprobado ? 'Presupuesto aprobado por el cliente desde el portal.' : 'Presupuesto rechazado por el cliente desde el portal.',
  });

  return json({ ok: true });
}

Deno.serve(async (req) => {
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

  const { data: cliente, error: clienteErr } = await admin
    .from('clientes')
    .select('id, empresa_id, nombre, apellidos')
    .eq('portal_token', token)
    .maybeSingle();
  if (clienteErr) return json({ error: 'Error interno.' }, 500);
  if (!cliente) return json({ error: 'Este enlace no es válido.' }, 404);

  if (body.action === 'responder_presupuesto') {
    return manejarResponderPresupuesto(admin, cliente, String(body.otId ?? ''), Boolean(body.aprobado));
  }

  return manejarGet(admin, cliente);
});
