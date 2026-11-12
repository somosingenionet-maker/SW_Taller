import { supabase } from '../supabase';
import type { Vehiculo } from '../../types';
import type { Database } from '../database.types';

// empresa_id es NOT NULL sin default en el tipo generado (lo rellena el
// trigger set_empresa_id() en el servidor si no se envía) — el cliente nunca
// lo gestiona, por eso no aparece en NuevoVehiculo/toRow.
type VehiculoInsert = Database['public']['Tables']['vehiculos']['Insert'];

/** Datos para dar de alta un vehículo (el id y la fecha los pone la BD). */
export type NuevoVehiculo = Omit<Vehiculo, 'id' | 'fechaRegistro'>;

/** Los cuatro datos del cambio de aceite de la ficha. `undefined` = vacío. */
export type AceiteVehiculo = Pick<Vehiculo, 'aceiteUltimaFecha' | 'aceiteUltimoKm' | 'aceiteProximaFecha' | 'aceiteProximoKm'>;

const COLS =
  'id, marca, modelo, anio, color, combustible, matricula, bastidor, kilometraje, itv_vencimiento, seguro_vencimiento, impuesto_vencimiento, fecha_registro, ' +
  'aceite_ultima_fecha, aceite_ultimo_km, aceite_proxima_fecha, aceite_proximo_km';

// La BD usa snake_case; el dominio (frontend) usa camelCase. Aquí está el mapeo.
type VehiculoRow = {
  id: string; marca: string; modelo: string; anio: number | null; color: string | null;
  combustible: string | null; matricula: string; bastidor: string; kilometraje: number;
  itv_vencimiento: string | null; seguro_vencimiento: string | null;
  impuesto_vencimiento: string | null; fecha_registro: string;
  aceite_ultima_fecha?: string | null; aceite_ultimo_km?: number | null;
  aceite_proxima_fecha?: string | null; aceite_proximo_km?: number | null;
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
    aceiteUltimaFecha: r.aceite_ultima_fecha ?? undefined,
    aceiteUltimoKm: r.aceite_ultimo_km ?? undefined,
    aceiteProximaFecha: r.aceite_proxima_fecha ?? undefined,
    aceiteProximoKm: r.aceite_proximo_km ?? undefined,
  };
}

// Los datos del cambio de aceite NO van aquí a propósito: los escribe también el mecánico desde su
// Portal, y guardar la ficha con una copia vieja los pisaría. Tienen su propio guardado (guardarAceite).
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
    // fecha_registro es solo la fecha (sin hora) — para que el más reciente
    // quede primero incluso entre varios dados de alta el mismo día, se
    // ordena por created_at, que sí tiene precisión de segundos.
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapVehiculo(r as unknown as VehiculoRow));
}

/** Traduce los errores de duplicado de la base de datos a un mensaje que el usuario entienda. */
export function mensajeErrorVehiculo(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    if (error.message.includes('matricula')) return 'Ya tienes un vehículo registrado con esa matrícula.';
    if (error.message.includes('bastidor')) return 'Ya tienes un vehículo registrado con ese número de bastidor.';
  }
  return error.message;
}

export async function createVehiculo(input: NuevoVehiculo): Promise<Vehiculo> {
  const { data, error } = await supabase.from('vehiculos').insert(toRow(input) as VehiculoInsert).select(COLS).single();
  if (error) throw new Error(mensajeErrorVehiculo(error));
  return mapVehiculo(data as unknown as VehiculoRow);
}

export async function updateVehiculo(v: Vehiculo): Promise<Vehiculo> {
  const { data, error } = await supabase.from('vehiculos').update(toRow(v)).eq('id', v.id).select(COLS).single();
  if (error) throw new Error(mensajeErrorVehiculo(error));
  return mapVehiculo(data as unknown as VehiculoRow);
}

/** Guarda solo los datos del cambio de aceite de la ficha (corrección a mano desde Vehículos). */
export async function guardarAceite(id: string, a: AceiteVehiculo): Promise<Vehiculo> {
  const { data, error } = await supabase
    .from('vehiculos')
    .update({
      aceite_ultima_fecha: a.aceiteUltimaFecha || null,
      aceite_ultimo_km: a.aceiteUltimoKm ?? null,
      aceite_proxima_fecha: a.aceiteProximaFecha || null,
      aceite_proximo_km: a.aceiteProximoKm ?? null,
    } as never)
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return mapVehiculo(data as unknown as VehiculoRow);
}

export async function deleteVehiculo(id: string): Promise<void> {
  const { error } = await supabase.from('vehiculos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
