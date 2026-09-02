import { supabase } from '../supabase';
import type { NotificacionCliente } from '../../types';

const COLS = 'id, cliente_id, vehiculo_id, tipo_envio, asunto, mensaje, fecha_envio, leido, tipo_evento, origen';

type NotificacionRow = {
  id: string; cliente_id: string; vehiculo_id: string | null; tipo_envio: string;
  asunto: string | null; mensaje: string; fecha_envio: string; leido: boolean; tipo_evento: string;
  origen: string;
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
    origen: r.origen as NotificacionCliente['origen'],
  };
}

export async function listNotificaciones(): Promise<NotificacionCliente[]> {
  const { data, error } = await supabase.from('notificaciones_cliente').select(COLS).order('fecha_envio', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapNotificacion(r as NotificacionRow));
}

export async function deleteNotificacion(id: string): Promise<void> {
  const { error } = await supabase.from('notificaciones_cliente').delete().eq('id', id);
  if (error) throw error;
}
