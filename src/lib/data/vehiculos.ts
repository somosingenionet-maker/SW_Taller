import { supabase } from '../supabase';
import type { Vehiculo } from '../../types';
import type { Database } from '../database.types';

// empresa_id es NOT NULL sin default en el tipo generado (lo rellena el
// trigger set_empresa_id() en el servidor si no se envía) — el cliente nunca
// lo gestiona, por eso no aparece en NuevoVehiculo/toRow.
type VehiculoInsert = Database['public']['Tables']['vehiculos']['Insert'];

/** Datos para dar de alta un vehículo (el id y la fecha los pone la BD). */
export type NuevoVehiculo = Omit<Vehiculo, 'id' | 'fechaRegistro'>;

const COLS =
  'id, marca, modelo, anio, color, combustible, matricula, bastidor, kilometraje, itv_vencimiento, seguro_vencimiento, impuesto_vencimiento, fecha_registro';

// La BD usa snake_case; el dominio (frontend) usa camelCase. Aquí está el mapeo.
type VehiculoRow = {
  id: string; marca: string; modelo: string; anio: number | null; color: string | null;
  combustible: string | null; matricula: string; bastidor: string; kilometraje: number;
  itv_vencimiento: string | null; seguro_vencimiento: string | null;
  impuesto_vencimiento: string | null; fecha_registro: string;
};

function mapVehiculo(r: VehiculoRow): Vehiculo {
  return {
    id: r.id,
    marca: r.marca,
    modelo: r.modelo,
    anio: r.anio ?? undefined,
    color: r.color ?? undefined,
    combustible: (r.combustible ?? undefined) as Vehiculo['combustible'],
    matricula: r.matricula,
    bastidor: r.bastidor,
    kilometraje: r.kilometraje,
    itvVencimiento: r.itv_vencimiento ?? '',
    seguroVencimiento: r.seguro_vencimiento ?? '',
    impuestoVencimiento: r.impuesto_vencimiento ?? '',
    fechaRegistro: r.fecha_registro,
  };
}

function toRow(v: NuevoVehiculo) {
  return {
    marca: v.marca,
    modelo: v.modelo,
    anio: v.anio ?? null,
    color: v.color || null,
    combustible: v.combustible ?? null,
    matricula: v.matricula,
    bastidor: v.bastidor,
    kilometraje: v.kilometraje ?? 0,
    itv_vencimiento: v.itvVencimiento || null,
    seguro_vencimiento: v.seguroVencimiento || null,
    impuesto_vencimiento: v.impuestoVencimiento || null,
  };
}

export async function listVehiculos(): Promise<Vehiculo[]> {
  const { data, error } = await supabase
    .from('vehiculos')
    .select(COLS)
    .order('fecha_registro', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapVehiculo(r as VehiculoRow));
}

export async function createVehiculo(input: NuevoVehiculo): Promise<Vehiculo> {
  const { data, error } = await supabase.from('vehiculos').insert(toRow(input) as VehiculoInsert).select(COLS).single();
  if (error) throw new Error(error.message);
  return mapVehiculo(data as VehiculoRow);
}

export async function updateVehiculo(v: Vehiculo): Promise<Vehiculo> {
  const { data, error } = await supabase.from('vehiculos').update(toRow(v)).eq('id', v.id).select(COLS).single();
  if (error) throw new Error(error.message);
  return mapVehiculo(data as VehiculoRow);
}

export async function deleteVehiculo(id: string): Promise<void> {
  const { error } = await supabase.from('vehiculos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
