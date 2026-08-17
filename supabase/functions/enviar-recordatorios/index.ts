// Recordatorios automáticos por email — la llama pg_cron/pg_net (ver
// cron.schedule('recordatorios-diarios', ...) en la migración), una vez al
// día, no un usuario interactivo. Por eso no hay Authorization: Bearer
// <token de usuario> como en admin-users/manage-empresas — la autoriza un
// secreto compartido (x-cron-secret) que solo conoce el propio proyecto.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Ventanas de aviso: cuántos días/km antes del vencimiento se manda el recordatorio.
const DIAS_AVISO_VENCIMIENTO = 14;
const KM_AVISO_MANTENIMIENTO = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

type TipoAlerta = 'itv' | 'seguro' | 'impuesto' | 'mantenimiento';
type TipoEvento = 'itv_proxima' | 'vencimiento_seguro' | 'impuesto_proximo' | 'mantenimiento_preventivo';

const TIPO_EVENTO: Record<TipoAlerta, TipoEvento> = {
  itv: 'itv_proxima',
  seguro: 'vencimiento_seguro',
  impuesto: 'impuesto_proximo',
  mantenimiento: 'mantenimiento_preventivo',
};

const ASUNTO: Record<TipoAlerta, string> = {
  itv: 'Recordatorio: ITV próxima a vencer',
  seguro: 'Recordatorio: su seguro está próximo a vencer',
  impuesto: 'Recordatorio: impuesto de circulación próximo a vencer',
  mantenimiento: 'Recordatorio: mantenimiento preventivo recomendado',
};

// Textos por defecto — duplicado en src/utils/recordatorioTemplates.ts
// (Deno no puede importar código del frontend). Mantener ambos en sincronía.
const PLANTILLA_DEFAULT: Record<TipoAlerta, string> = {
  itv: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que la ITV de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
  seguro: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el seguro de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros si necesitas ayuda con la renovación.',
  impuesto: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el impuesto de circulación de tu vehículo {{vehiculo}} vence el {{fecha}}.',
  mantenimiento: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que tu vehículo {{vehiculo}} tiene una revisión de mantenimiento preventivo recomendada a los {{km}} km.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
};

function sustituirVariables(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => valores[key] ?? match);
}

function construirEmail(
  tipo: TipoAlerta,
  empresa: { nombre: string; plantillas_recordatorios: Partial<Record<TipoAlerta, string>> | null },
  cliente: { nombre: string; apellidos: string },
  vehiculo: { marca: string; modelo: string; matricula: string },
  alerta: { fecha_limite: string | null; kilometraje_limite: number | null },
): { asunto: string; html: string } {
  const vehiculoDesc = `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})`;
  const plantilla = empresa.plantillas_recordatorios?.[tipo]?.trim() || PLANTILLA_DEFAULT[tipo];

  const cuerpo = sustituirVariables(plantilla, {
    cliente: cliente.nombre,
    vehiculo: vehiculoDesc,
    empresa: empresa.nombre,
    fecha: alerta.fecha_limite ? new Date(alerta.fecha_limite).toLocaleDateString('es-ES') : '',
    km: alerta.kilometraje_limite != null ? alerta.kilometraje_limite.toLocaleString('es-ES') : '',
  });

  const html = `
    <div style="font-family: sans-serif; color: #1e293b; max-width: 480px; margin: 0 auto; white-space: pre-line;">
      ${cuerpo}
      <p style="color:#64748b; font-size: 12px; margin-top: 24px; white-space: normal;">
        Este es un recordatorio automático de ${empresa.nombre}.
      </p>
    </div>
  `.trim();

  return { asunto: `${ASUNTO[tipo]} — ${vehiculoDesc}`, html };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  if (req.headers.get('x-cron-secret') !== CRON_SHARED_SECRET) {
    return json({ error: 'No autorizado' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const resumen = { empresas: 0, alertasEvaluadas: 0, enviados: 0, fallidos: 0, errores: [] as string[] };

  try {
    const { data: empresas, error: empresasErr } = await admin
      .from('empresas')
      .select('id, nombre, plantillas_recordatorios')
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
          let dentroDeVentana = false;
          if (tipo === 'mantenimiento') {
            if (alerta.kilometraje_limite == null) continue;
            dentroDeVentana = alerta.kilometraje_limite - vehiculo.kilometraje <= KM_AVISO_MANTENIMIENTO;
          } else {
            if (!alerta.fecha_limite) continue;
            dentroDeVentana = new Date(alerta.fecha_limite) <= limiteFecha;
          }
          if (!dentroDeVentana) continue;

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
          resumen.enviados++;
        } catch (e) {
          resumen.fallidos++;
          resumen.errores.push(`alerta ${alerta.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return json(resumen);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error inesperado', ...resumen }, 500);
  }
});
