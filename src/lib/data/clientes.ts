import { supabase } from '../supabase';
import type { Cliente, InteraccionCliente } from '../../types';

/** Datos para dar de alta un cliente (id, fecha e interacciones los pone la BD). */
export type NuevoCliente = Omit<Cliente, 'id' | 'fechaRegistro' | 'interacciones'>;

const SELECT =
  'id, nombre, apellidos, nif_nie_pasaporte, correo, telefono, direccion, ciudad, pais, fecha_registro, ' +
  'interacciones_cliente ( id, fecha, tipo, notas ), cliente_vehiculo ( vehiculo_id )';

type ClienteRow = {
  id: string; nombre: string; apellidos: string; nif_nie_pasaporte: string;
  correo: string | null; telefono: string | null; direccion: string | null;
  ciudad: string | null; pais: string | null; fecha_registro: string;
  interacciones_cliente: { id: string; fecha: string; tipo: string; notas: string }[] | null;
  cliente_vehiculo: { vehiculo_id: string }[] | null;
};

function mapCliente(r: ClienteRow): Cliente {
  return {
    id: r.id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    nifNiePasaporte: r.nif_nie_pasaporte,
    correo: r.correo ?? '',
    telefono: r.telefono ?? '',
    direccion: r.direccion ?? '',
    ciudad: r.ciudad ?? undefined,
    pais: r.pais ?? undefined,
    fechaRegistro: r.fecha_registro,
    vehiculosAsociados: (r.cliente_vehiculo ?? []).map((cv) => cv.vehiculo_id),
    interacciones: (r.interacciones_cliente ?? [])
      .map((i) => ({ id: i.id, fecha: i.fecha, tipo: i.tipo as InteraccionCliente['tipo'], notas: i.notas }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)),
  };
}

function toRow(c: NuevoCliente) {
  return {
    nombre: c.nombre,
    apellidos: c.apellidos,
    nif_nie_pasaporte: c.nifNiePasaporte,
    correo: c.correo || null,
    telefono: c.telefono || null,
    direccion: c.direccion || null,
    ciudad: c.ciudad || null,
    pais: c.pais || null,
  };
}

async function getCliente(id: string): Promise<Cliente> {
  const { data, error } = await supabase.from('clientes').select(SELECT).eq('id', id).single();
  if (error) throw error;
  return mapCliente(data as unknown as ClienteRow);
}

export async function listClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from('clientes')
    .select(SELECT)
    .order('fecha_registro', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapCliente(r as unknown as ClienteRow));
}

export async function createCliente(input: NuevoCliente): Promise<Cliente> {
  const { data, error } = await supabase.from('clientes').insert(toRow(input)).select('id').single();
  if (error) throw error;
  const id = (data as { id: string }).id;

  const vids = input.vehiculosAsociados ?? [];
  if (vids.length) {
    const { error: e2 } = await supabase
      .from('cliente_vehiculo')
      .insert(vids.map((v) => ({ cliente_id: id, vehiculo_id: v })));
    if (e2) throw e2;
  }

  // Interacción inicial de registro de ficha.
  await supabase.from('interacciones_cliente').insert({
    cliente_id: id,
    tipo: 'registro_contrato',
    notas: 'Registro de la ficha de cliente en el sistema CRM de Backoffice.',
  });

  return getCliente(id);
}

export async function updateCliente(c: Cliente): Promise<Cliente> {
  const { error } = await supabase.from('clientes').update(toRow(c)).eq('id', c.id);
  if (error) throw error;

  // Sincroniza asociaciones de vehículos (borra y reinserta: simple y correcto).
  const { error: eDel } = await supabase.from('cliente_vehiculo').delete().eq('cliente_id', c.id);
  if (eDel) throw eDel;
  const vids = c.vehiculosAsociados ?? [];
  if (vids.length) {
    const { error: eIns } = await supabase
      .from('cliente_vehiculo')
      .insert(vids.map((v) => ({ cliente_id: c.id, vehiculo_id: v })));
    if (eIns) throw eIns;
  }

  return getCliente(c.id);
}

export async function deleteCliente(id: string): Promise<void> {
  const { error } = await supabase.from('clientes').delete().eq('id', id);
  if (error) throw error;
}

export async function addInteraccion(
  clienteId: string,
  input: { tipo: InteraccionCliente['tipo']; notas: string; fecha?: string }
): Promise<InteraccionCliente> {
  const { data, error } = await supabase
    .from('interacciones_cliente')
    .insert({ cliente_id: clienteId, tipo: input.tipo, notas: input.notas, ...(input.fecha ? { fecha: input.fecha } : {}) })
    .select('id, fecha, tipo, notas')
    .single();
  if (error) throw error;
  const r = data as { id: string; fecha: string; tipo: string; notas: string };
  return { id: r.id, fecha: r.fecha, tipo: r.tipo as InteraccionCliente['tipo'], notas: r.notas };
}
