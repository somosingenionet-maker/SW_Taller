import { supabase } from '../supabase';
import type { Database } from '../database.types';
import type { AvisoCliente } from '../../types';
import { siguienteRepeticion } from '../../utils/avisos';

type AvisoRow = Database['public']['Tables']['avisos_cliente']['Row'];
type AvisoInsert = Database['public']['Tables']['avisos_cliente']['Insert'];

const COLS = 'id, cliente_id, vehiculo_id, motivo, mensaje, nota, avisar_en, avisar_km, repetir_meses, estado, enviado_en, canal, orden_id';

function mapAviso(r: Pick<AvisoRow, 'id' | 'cliente_id' | 'vehiculo_id' | 'motivo' | 'mensaje' | 'nota' | 'avisar_en' | 'avisar_km' | 'repetir_meses' | 'estado' | 'enviado_en' | 'canal' | 'orden_id'>): AvisoCliente {
  return {
    id: r.id,
    clienteId: r.cliente_id,
    vehiculoId: r.vehiculo_id ?? undefined,
    motivo: r.motivo,
    mensaje: r.mensaje,
    nota: r.nota ?? undefined,
    avisarEn: r.avisar_en ?? undefined,
    avisarKm: r.avisar_km ?? undefined,
    repetirMeses: r.repetir_meses ?? undefined,
    estado: r.estado as AvisoCliente['estado'],
    enviadoEn: r.enviado_en ?? undefined,
    canal: (r.canal as AvisoCliente['canal']) ?? undefined,
    ordenId: r.orden_id ?? undefined,
  };
}

export async function listAvisos(): Promise<AvisoCliente[]> {
  const { data, error } = await supabase.from('avisos_cliente').select(COLS).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapAviso(r));
}

export type NuevoAviso = Pick<AvisoCliente, 'clienteId' | 'motivo' | 'mensaje'> & Partial<Pick<AvisoCliente, 'vehiculoId' | 'nota' | 'avisarEn' | 'avisarKm' | 'repetirMeses' | 'ordenId'>>;

export async function crearAviso(a: NuevoAviso): Promise<AvisoCliente> {
  const row = {
    cliente_id: a.clienteId,
    vehiculo_id: a.vehiculoId ?? null,
    motivo: a.motivo.trim(),
    mensaje: a.mensaje.trim(),
    nota: a.nota?.trim() || null,
    avisar_en: a.avisarEn ?? null,
    avisar_km: a.avisarKm ?? null,
    repetir_meses: a.avisarEn ? a.repetirMeses ?? null : null,
    orden_id: a.ordenId ?? null,
  };
  const { data, error } = await supabase.from('avisos_cliente').insert(row as AvisoInsert).select(COLS).single();
  if (error) throw new Error(error.message);
  return mapAviso(data);
}

/** Lo deja de lado sin borrarlo (queda en el historial del cliente). */
export async function descartarAviso(id: string): Promise<void> {
  const { error } = await supabase.from('avisos_cliente').update({ estado: 'descartado' }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Anota que se avisó (por WhatsApp, a mano). Si el aviso se repite, vuelve a quedar programado para la siguiente vez;
 * si no, se da por enviado.
 */
export async function registrarEnvioAviso(a: AvisoCliente, canal: 'email' | 'whatsapp', hoy: string): Promise<void> {
  const cambios = a.repetirMeses && a.avisarEn
    ? { estado: 'programado', avisar_en: siguienteRepeticion(a.avisarEn, a.repetirMeses, hoy), enviado_en: new Date().toISOString(), canal }
    : { estado: 'enviado', enviado_en: new Date().toISOString(), canal };
  const { error } = await supabase.from('avisos_cliente').update(cambios).eq('id', a.id).eq('estado', 'programado');
  if (error) throw new Error(error.message);
}
