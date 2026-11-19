import { supabase } from '../supabase';
import type { Database } from '../database.types';
import type { NotificacionCliente } from '../../types';

type NotificacionInsert = Database['public']['Tables']['notificaciones_cliente']['Insert'];

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
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapNotificacion(r as NotificacionRow));
}

export async function deleteNotificacion(id: string): Promise<void> {
  const { error } = await supabase.from('notificaciones_cliente').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Anota en el historial un aviso que mandó una persona del taller (WhatsApp asistido). Los automáticos los anota el servidor. */
export async function registrarNotificacionManual(n: {
  clienteId: string; vehiculoId?: string; asunto: string; mensaje: string; tipoEvento: NotificacionCliente['tipoEvento']; tipoEnvio?: 'whatsapp' | 'email';
}): Promise<void> {
  const { error } = await supabase.from('notificaciones_cliente').insert({
    cliente_id: n.clienteId,
    vehiculo_id: n.vehiculoId ?? null,
    tipo_envio: n.tipoEnvio ?? 'whatsapp',
    asunto: n.asunto,
    mensaje: n.mensaje,
    leido: false,
    tipo_evento: n.tipoEvento,
    origen: 'manual',
  } as NotificacionInsert);
  if (error) throw new Error(error.message);
}
