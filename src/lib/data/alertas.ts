import { supabase } from '../supabase';
import type { Alerta, AlertaTipo } from '../../types';

export type NuevaAlerta = Omit<Alerta, 'id'>;

const COLS = 'id, vehiculo_id, tipo, descripcion, estado, fecha_limite, kilometraje_limite';

type AlertaRow = {
  id: string; vehiculo_id: string; tipo: string; descripcion: string;
  estado: string; fecha_limite: string | null; kilometraje_limite: number | null;
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
  const { data, error } = await supabase.from('alertas').insert(toRow(input)).select(COLS).single();
  if (error) throw error;
  return mapAlerta(data as AlertaRow);
}

/** Marca una alerta como atendida. */
export async function resolveAlerta(id: string): Promise<void> {
  const { error } = await supabase.from('alertas').update({ estado: 'atendida' }).eq('id', id);
  if (error) throw error;
}
