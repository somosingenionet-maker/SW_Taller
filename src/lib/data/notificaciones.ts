import { supabase } from '../supabase';
import type { NotificacionCliente } from '../../types';

export type NuevaNotificacion = Omit<NotificacionCliente, 'id'>;

const COLS = 'id, cliente_id, vehiculo_id, tipo_envio, asunto, mensaje, fecha_envio, leido, tipo_evento';

type NotificacionRow = {
  id: string; cliente_id: string; vehiculo_id: string | null; tipo_envio: string;
  asunto: string | null; mensaje: string; fecha_envio: string; leido: boolean; tipo_evento: string;
};

function mapNotificacion(r: NotificacionRow): NotificacionCliente {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    vehiculoId: r.vehiculo_id ?? undefined,
    tipoEnvio: r.tipo_envio as NotificacionCliente['tipoEnvio'],
    asunto: r.asunto ?? undefined,
    mensaje: r.mensaje,
    fechaEnvio: r.fecha_envio,
    leido: r.leido,
    tipoEvento: r.tipo_evento as NotificacionCliente['tipoEvento'],
  };
}

function toRow(n: NuevaNotificacion) {
  return {
    cliente_id: n.clienteId,
    vehiculo_id: n.vehiculoId || null,
    tipo_envio: n.tipoEnvio,
    asunto: n.asunto || null,
    mensaje: n.mensaje,
    fecha_envio: n.fechaEnvio,
    leido: n.leido,
    tipo_evento: n.tipoEvento,
  };
}

export async function listNotificaciones(): Promise<NotificacionCliente[]> {
  const { data, error } = await supabase.from('notificaciones_cliente').select(COLS).order('fecha_envio', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapNotificacion(r as NotificacionRow));
}

export async function createNotificacion(input: NuevaNotificacion): Promise<NotificacionCliente> {
  const { data, error } = await supabase.from('notificaciones_cliente').insert(toRow(input)).select(COLS).single();
  if (error) throw error;
  return mapNotificacion(data as NotificacionRow);
}

export async function deleteNotificacion(id: string): Promise<void> {
  const { error } = await supabase.from('notificaciones_cliente').delete().eq('id', id);
  if (error) throw error;
}
