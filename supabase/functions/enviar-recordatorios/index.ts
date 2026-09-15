// Recordatorios automáticos por email — dos caminos posibles:
// 1) Lote diario: lo llama pg_cron/pg_net (ver cron.schedule('recordatorios-
//    diarios', ...) en la migración), sin usuario interactivo — se autoriza
//    con un secreto compartido (x-cron-secret), no con un JWT de usuario.
// 2) Forzado puntual: lo llama la app cuando un miembro del taller pulsa
//    "Enviar ahora" sobre una alerta concreta desde el monitor de Alertas —
//    se autoriza igual que admin-users/manage-empresas (Authorization:
//    Bearer <token de usuario>), y no respeta la ventana de aviso ni el
//    filtro de "ya enviado" (es una orden explícita, puede reenviar).
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { TipoAlerta, TIPO_EVENTO, DIAS_AVISO_VENCIMIENTO, construirEmail, dentroDeVentanaAviso, type EmpresaEmail } from './logic.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';

initSentry('enviar-recordatorios');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

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
type Empresa = EmpresaEmail;
type Vehiculo = { id: string; marca: string; modelo: string; matricula: string; kilometraje: number };
type Cliente = { id: string; nombre: string; apellidos: string; correo: string | null };
type Alerta = { id: string; tipo: string; fecha_limite: string | null; kilometraje_limite: number | null };

/** Construye el email, lo envía por Resend, registra la notificación y marca la alerta como recordada. Lanza si algo falla. */
async function enviarRecordatorioAlerta(
  admin: SupabaseClient,
  empresa: Empresa,
  alerta: Alerta,
  vehiculo: Vehiculo,
  cliente: Cliente,
): Promise<void> {
  if (!cliente.correo) throw new Error('El cliente no tiene correo registrado.');
  const tipo = alerta.tipo as TipoAlerta;
  const { asunto, html } = construirEmail(tipo, empresa, cliente, vehiculo, alerta);

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${empresa.nombre} <${RESEND_FROM_EMAIL}>`,
      to: [cliente.correo],
      subject: asunto,
      html,
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);

  await admin.from('notificaciones_cliente').insert({
    empresa_id: empresa.id,
    cliente_id: cliente.id,
    vehiculo_id: vehiculo.id,
    tipo_envio: 'email',
    asunto,
    mensaje: html,
    leido: false,
    tipo_evento: TIPO_EVENTO[tipo],
    origen: 'automatico',
  });
  await admin.from('alertas').update({ recordatorio_enviado_en: new Date().toISOString() }).eq('id', alerta.id);
}

/** Camino 2: un miembro del taller fuerza el envío de una alerta concreta ya mismo. */
async function manejarForzado(admin: SupabaseClient, req: Request, alertaId: string) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData.user) return json({ error: 'Sesión inválida' }, 401);

  const { data: callerPerfil, error: perfilErr } = await admin
    .from('perfiles')
    .select('empresa_id')
    .eq('id', callerData.user.id)
    .single();
  if (perfilErr || !callerPerfil?.empresa_id) return json({ error: 'No autorizado' }, 403);

  if (!alertaId) return json({ error: 'Falta el id de la alerta.' }, 400);

  const { data: alerta, error: alertaErr } = await admin
    .from('alertas')
    .select('id, empresa_id, vehiculo_id, tipo, estado, fecha_limite, kilometraje_limite')
    .eq('id', alertaId)
    .single();
  if (alertaErr || !alerta) return json({ error: 'Alerta no encontrada.' }, 404);
  if (alerta.empresa_id !== callerPerfil.empresa_id) return json({ error: 'No autorizado' }, 403);
  if (alerta.estado === 'atendida') return json({ error: 'Esta alerta ya está atendida.' }, 400);

  const { data: empresa, error: empresaErr } = await admin
    .from('empresas')
    .select('id, nombre, plantillas_recordatorios, logo_url, brand_color, correo, telefono, web')
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
    .select('id, nombre, apellidos, correo')
    .eq('id', rel.cliente_id)
    .single();
  if (!cliente?.correo) return json({ error: 'El cliente asociado no tiene correo registrado.' }, 400);

  try {
    await enviarRecordatorioAlerta(admin, empresa, alerta, vehiculo, cliente);
    return json({ ok: true });
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: e instanceof Error ? e.message : 'Error inesperado enviando el recordatorio.' }, 500);
  }
}

/** Camino 1: lote diario disparado por pg_cron para todas las empresas con el opt-in activo. */
async function manejarLote(admin: SupabaseClient) {
  const resumen = { empresas: 0, alertasEvaluadas: 0, enviados: 0, fallidos: 0, errores: [] as string[] };

  try {
    const { data: empresas, error: empresasErr } = await admin
      .from('empresas')
      .select('id, nombre, plantillas_recordatorios, logo_url, brand_color, correo, telefono, web')
      .eq('activo', true)
      .eq('recordatorios_automaticos_activos', true);
    if (empresasErr) throw empresasErr;

    const limiteFecha = new Date();
    limiteFecha.setDate(limiteFecha.getDate() + DIAS_AVISO_VENCIMIENTO);

    for (const empresa of empresas ?? []) {
      resumen.empresas++;

      const { data: alertas, error: alertasErr } = await admin
        .from('alertas')
        .select('id, vehiculo_id, tipo, fecha_limite, kilometraje_limite')
        .eq('empresa_id', empresa.id)
        .neq('estado', 'atendida')
        .is('recordatorio_enviado_en', null);
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
          if (!dentroDeVentanaAviso(tipo, alerta, vehiculo.kilometraje, limiteFecha)) continue;

          const { data: rel } = await admin
            .from('cliente_vehiculo')
            .select('cliente_id')
            .eq('vehiculo_id', vehiculo.id)
            .maybeSingle();
          if (!rel) continue;

          const { data: cliente } = await admin
            .from('clientes')
            .select('id, nombre, apellidos, correo')
            .eq('id', rel.cliente_id)
            .single();
          if (!cliente?.correo) continue;

          await enviarRecordatorioAlerta(admin, empresa, alerta, vehiculo, cliente);
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
    return manejarForzado(admin, req, String(body.alertaId ?? ''));
  }

  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) {
    return json({ error: 'No autorizado' }, 401);
  }
  return manejarLote(admin);
}, CORS_HEADERS));
