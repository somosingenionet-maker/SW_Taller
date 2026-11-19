import { supabase } from '../supabase';
import type { Alerta, AlertaTipo } from '../../types';

const COLS = 'id, vehiculo_id, tipo, descripcion, estado, fecha_limite, kilometraje_limite, recordatorio_enviado_en, ultimo_aviso_enviado_en';

type AlertaRow = {
  id: string; vehiculo_id: string; tipo: string; descripcion: string;
  estado: string; fecha_limite: string | null; kilometraje_limite: number | null;
  recordatorio_enviado_en: string | null;
  ultimo_aviso_enviado_en?: string | null;
};

function mapAlerta(r: AlertaRow): Alerta {
  return {
    id: r.id,
    vehiculoId: r.vehiculo_id,
    tipo: r.tipo as AlertaTipo,
    descripcion: r.descripcion,
    estado: r.estado as Alerta['estado'],
    fechaLimite: r.fecha_limite ?? undefined,
    kilometrajeLimite: r.kilometraje_limite ?? undefined,
    recordatorioEnviadoEn: r.recordatorio_enviado_en ?? undefined,
    ultimoAvisoEnviadoEn: r.ultimo_aviso_enviado_en ?? undefined,
  };
}

export async function listAlertas(): Promise<Alerta[]> {
  const { data, error } = await supabase.from('alertas').select(COLS).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapAlerta(r as unknown as AlertaRow));
}

/** Deja una alerta de lado sin cambiar la fecha del vehículo («no aplica»: vendido, lo lleva otro…). */
export async function descartarAlerta(id: string): Promise<void> {
  const { error } = await supabase.from('alertas').update({ estado: 'atendida' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Anota que se avisó al cliente a mano (WhatsApp). Igual que el envío automático: el «último aviso» de un aceite vencido
 * cierra también el recordatorio, que ya no tiene sentido.
 */
export async function registrarAvisoAlerta(alerta: Alerta, aviso: 'recordatorio' | 'vencido'): Promise<void> {
  const ahora = new Date().toISOString();
  const cambios = aviso === 'vencido'
    ? { ultimo_aviso_enviado_en: ahora, recordatorio_enviado_en: alerta.recordatorioEnviadoEn ?? ahora }
    : { recordatorio_enviado_en: ahora };
  const { error } = await supabase.from('alertas').update(cambios).eq('id', alerta.id);
  if (error) throw new Error(error.message);
}

/** Fuerza el envío inmediato por correo de una alerta o de un aviso personalizado (Edge Function, cualquier miembro de la empresa). */
export async function forzarRecordatorio(ref: { alertaId?: string; avisoId?: string }): Promise<void> {
  const { data, error } = await supabase.functions.invoke('enviar-recordatorios', { body: { action: 'forzar', ...ref } });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // el cuerpo de error no era JSON; se mantiene el mensaje genérico
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error as string);
}
