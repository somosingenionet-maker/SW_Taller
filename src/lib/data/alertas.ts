import { supabase } from '../supabase';
import type { Alerta, AlertaTipo } from '../../types';
import type { Database } from '../database.types';

export type NuevaAlerta = Omit<Alerta, 'id'>;

// empresa_id lo rellena el trigger set_empresa_id() en el servidor.
type AlertaInsert = Database['public']['Tables']['alertas']['Insert'];

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

function toRow(a: NuevaAlerta) {
  return {
    vehiculo_id: a.vehiculoId,
    tipo: a.tipo,
    descripcion: a.descripcion,
    estado: a.estado,
    fecha_limite: a.fechaLimite || null,
    kilometraje_limite: a.kilometrajeLimite ?? null,
  };
}

export async function listAlertas(): Promise<Alerta[]> {
  const { data, error } = await supabase.from('alertas').select(COLS).order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapAlerta(r as AlertaRow));
}

export async function createAlerta(input: NuevaAlerta): Promise<Alerta> {
  const { data, error } = await supabase.from('alertas').insert(toRow(input) as AlertaInsert).select(COLS).single();
  if (error) throw error;
  return mapAlerta(data as AlertaRow);
}

/** Marca una alerta como atendida. */
export async function resolveAlerta(id: string): Promise<void> {
  const { error } = await supabase.from('alertas').update({ estado: 'atendida' }).eq('id', id);
  if (error) throw error;
}

/** Renueva una alerta de mantenimiento a un nuevo kilometraje límite (p.ej. +15.000 km tras la revisión). */
export async function renovarAlertaMantenimiento(id: string, nuevoKilometrajeLimite: number): Promise<void> {
  const { error } = await supabase
    .from('alertas')
    .update({ kilometraje_limite: nuevoKilometrajeLimite, estado: 'activa' })
    .eq('id', id);
  if (error) throw error;
}
