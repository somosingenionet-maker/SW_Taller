import { supabase } from '../supabase';
import type { Cita } from '../../types';
import type { Database } from '../database.types';

type CitaInsert = Database['public']['Tables']['citas']['Insert'];
type CitaUpdate = Database['public']['Tables']['citas']['Update'];

const SELECT =
  'id, fecha_hora, duracion_minutos, cliente_id, vehiculo_id, contacto_nombre, contacto_telefono, vehiculo_descripcion, motivo, tecnico_id, estado, notas, ot_id';

type CitaRow = {
  id: string;
  fecha_hora: string;
  duracion_minutos: number;
  cliente_id: string | null;
  vehiculo_id: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  vehiculo_descripcion: string | null;
  motivo: string;
  tecnico_id: string | null;
  estado: string;
  notas: string | null;
  ot_id: string | null;
};

function mapCita(r: CitaRow): Cita {
  return {
    id: r.id,
    fechaHora: r.fecha_hora,
    duracionMinutos: r.duracion_minutos,
    clienteId: r.cliente_id ?? undefined,
    vehiculoId: r.vehiculo_id ?? undefined,
    contactoNombre: r.contacto_nombre ?? undefined,
    contactoTelefono: r.contacto_telefono ?? undefined,
    vehiculoDescripcion: r.vehiculo_descripcion ?? undefined,
    motivo: r.motivo,
    tecnicoId: r.tecnico_id ?? undefined,
    estado: r.estado as Cita['estado'],
    notas: r.notas ?? undefined,
    otId: r.ot_id ?? undefined,
  };
}

function toRow(c: Omit<Cita, 'id'>) {
  return {
    fecha_hora: c.fechaHora,
    duracion_minutos: c.duracionMinutos,
    cliente_id: c.clienteId || null,
    vehiculo_id: c.vehiculoId || null,
    contacto_nombre: c.contactoNombre || null,
    contacto_telefono: c.contactoTelefono || null,
    vehiculo_descripcion: c.vehiculoDescripcion || null,
    motivo: c.motivo,
    tecnico_id: c.tecnicoId || null,
    estado: c.estado,
    notas: c.notas || null,
    ot_id: c.otId || null,
  };
}

export async function listCitas(desde?: string, hasta?: string): Promise<Cita[]> {
  let query = supabase.from('citas').select(SELECT).order('fecha_hora');
  if (desde) query = query.gte('fecha_hora', desde);
  if (hasta) query = query.lte('fecha_hora', hasta);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapCita(r as CitaRow));
}

export async function createCita(c: Omit<Cita, 'id'>): Promise<Cita> {
  const { data, error } = await supabase.from('citas').insert(toRow(c) as CitaInsert).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapCita(data as CitaRow);
}

export async function updateCita(id: string, cambios: Partial<Omit<Cita, 'id'>>): Promise<Cita> {
  const row: CitaUpdate = {};
  if (cambios.fechaHora !== undefined) row.fecha_hora = cambios.fechaHora;
  if (cambios.duracionMinutos !== undefined) row.duracion_minutos = cambios.duracionMinutos;
  if (cambios.clienteId !== undefined) row.cliente_id = cambios.clienteId || null;
  if (cambios.vehiculoId !== undefined) row.vehiculo_id = cambios.vehiculoId || null;
  if (cambios.contactoNombre !== undefined) row.contacto_nombre = cambios.contactoNombre || null;
  if (cambios.contactoTelefono !== undefined) row.contacto_telefono = cambios.contactoTelefono || null;
  if (cambios.vehiculoDescripcion !== undefined) row.vehiculo_descripcion = cambios.vehiculoDescripcion || null;
  if (cambios.motivo !== undefined) row.motivo = cambios.motivo;
  if (cambios.tecnicoId !== undefined) row.tecnico_id = cambios.tecnicoId || null;
  if (cambios.estado !== undefined) row.estado = cambios.estado;
  if (cambios.notas !== undefined) row.notas = cambios.notas || null;
  if (cambios.otId !== undefined) row.ot_id = cambios.otId || null;

  const { data, error } = await supabase.from('citas').update(row).eq('id', id).select(SELECT).single();
  if (error) throw new Error(error.message);
  return mapCita(data as CitaRow);
}

export async function deleteCita(id: string): Promise<void> {
  const { error } = await supabase.from('citas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
