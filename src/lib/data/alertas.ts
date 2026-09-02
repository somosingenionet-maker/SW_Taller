import { supabase } from '../supabase';
import type { Alerta, AlertaTipo } from '../../types';

const COLS = 'id, vehiculo_id, tipo, descripcion, estado, fecha_limite, kilometraje_limite, recordatorio_enviado_en';

type AlertaRow = {
  id: string; vehiculo_id: string; tipo: string; descripcion: string;
  estado: string; fecha_limite: string | null; kilometraje_limite: number | null;
  recordatorio_enviado_en: string | null;
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
  };
}

export async function listAlertas(): Promise<Alerta[]> {
  const { data, error } = await supabase.from('alertas').select(COLS).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapAlerta(r as AlertaRow));
}

/** Renueva una alerta de mantenimiento a un nuevo kilometraje límite (p.ej. +15.000 km tras la revisión). */
export async function renovarAlertaMantenimiento(id: string, nuevoKilometrajeLimite: number): Promise<void> {
  const { error } = await supabase
    .from('alertas')
    .update({ kilometraje_limite: nuevoKilometrajeLimite, estado: 'activa' })
    .eq('id', id);
  if (error) throw error;
}

/** Fuerza el envío inmediato del recordatorio automático de una alerta (Edge Function, cualquier miembro de la empresa). */
export async function forzarRecordatorio(alertaId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('enviar-recordatorios', { body: { action: 'forzar', alertaId } });
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
