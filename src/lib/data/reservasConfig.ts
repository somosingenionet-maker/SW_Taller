import { supabase } from '../supabase';
import { normalizarHorario, type HorarioReservas } from '../../utils/horarioReservas';

export interface ConfigReservas {
  activas: boolean;
  slug: string;
  horario: HorarioReservas;
  /** Días cerrados («AAAA-MM-DD»). */
  cierres: string[];
  capacidad: number;
  antelacionHoras: number;
  diasMax: number;
  confirmacion: 'automatica' | 'manual';
}

export interface TipoCita { id: string; nombre: string; duracionMin: number; activo: boolean }

const COLUMNAS = 'reservas_activas, reservas_slug, reservas_horario, reservas_cierres, reservas_capacidad, reservas_antelacion_horas, reservas_dias_max, reservas_confirmacion';

function mensaje(m: string): string {
  if (/empresas_reservas_slug_uq|duplicate key/i.test(m)) return 'Esa dirección ya está en uso por otro taller. Elige otra.';
  if (/no está disponible/i.test(m)) return 'Esa dirección no está disponible. Elige otra.';
  if (/empresas_reservas_activas_slug_chk/i.test(m)) return 'Para activar las reservas hace falta una dirección pública.';
  if (/row-level security|permission denied/i.test(m)) return 'Solo un administrador del taller puede cambiar las reservas online.';
  if (/tipos_cita_nombre_uq/i.test(m)) return 'Ya tienes un tipo de cita con ese nombre.';
  return m;
}

export async function getConfigReservas(empresaId: string): Promise<ConfigReservas> {
  const { data, error } = await supabase.from('empresas').select(COLUMNAS).eq('id', empresaId).single();
  if (error) throw new Error(mensaje(error.message));
  return {
    activas: data.reservas_activas, slug: data.reservas_slug ?? '', horario: normalizarHorario(data.reservas_horario),
    cierres: [...(data.reservas_cierres ?? [])].sort(), capacidad: data.reservas_capacidad, antelacionHoras: data.reservas_antelacion_horas,
    diasMax: data.reservas_dias_max, confirmacion: data.reservas_confirmacion === 'manual' ? 'manual' : 'automatica',
  };
}

export async function guardarConfigReservas(empresaId: string, c: ConfigReservas): Promise<void> {
  const { error } = await supabase.from('empresas').update({
    reservas_activas: c.activas, reservas_slug: c.slug || null, reservas_horario: c.horario, reservas_cierres: c.cierres,
    reservas_capacidad: c.capacidad, reservas_antelacion_horas: c.antelacionHoras, reservas_dias_max: c.diasMax, reservas_confirmacion: c.confirmacion,
  }).eq('id', empresaId);
  if (error) throw new Error(mensaje(error.message));
}

type Fila = { id: string; nombre: string; duracion_minutos: number; activo: boolean };
const mapTipo = (f: Fila): TipoCita => ({ id: f.id, nombre: f.nombre, duracionMin: f.duracion_minutos, activo: f.activo });

export async function listTiposCita(): Promise<TipoCita[]> {
  const { data, error } = await supabase.from('tipos_cita').select('id, nombre, duracion_minutos, activo').order('posicion').order('nombre');
  if (error) throw new Error(mensaje(error.message));
  return (data as Fila[]).map(mapTipo);
}

export async function crearTipoCita(nombre: string, duracionMin: number): Promise<void> {
  const { error } = await supabase.from('tipos_cita').insert({ nombre, duracion_minutos: duracionMin } as never);
  if (error) throw new Error(mensaje(error.message));
}

export async function actualizarTipoCita(id: string, cambios: { nombre?: string; duracionMin?: number; activo?: boolean }): Promise<void> {
  const fila: { nombre?: string; duracion_minutos?: number; activo?: boolean } = {};
  if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
  if (cambios.duracionMin !== undefined) fila.duracion_minutos = cambios.duracionMin;
  if (cambios.activo !== undefined) fila.activo = cambios.activo;
  const { error } = await supabase.from('tipos_cita').update(fila).eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}

export async function borrarTipoCita(id: string): Promise<void> {
  const { error } = await supabase.from('tipos_cita').delete().eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}
