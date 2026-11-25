import { supabase } from '../supabase';
import { renumerar } from '../../utils/inspeccion';

export interface PlantillaResumen { id: string; nombre: string; esDefecto: boolean }

/**
 * Plantilla Pre-ITV del sistema (no es del taller ni se edita): se elige con este id al iniciar una inspección o
 * como origen de una plantilla propia. Sus puntos están en la base de datos (`plantilla_inspeccion_pre_itv`).
 */
export const PLANTILLA_PRE_ITV = 'pre-itv';
export const PUNTOS_PRE_ITV = 55;

export interface PlantillaPunto {
  id: string;
  plantillaId: string;
  categoria: string;
  nombre: string;
  posicion: number;
  servicioId: string | null;
}

type FilaPunto = { id: string; plantilla_id: string; categoria: string; nombre: string; posicion: number; servicio_id: string | null; empresa_id: string };
const mapPunto = (f: FilaPunto): PlantillaPunto => ({
  id: f.id, plantillaId: f.plantilla_id, categoria: f.categoria, nombre: f.nombre, posicion: f.posicion, servicioId: f.servicio_id,
});

function mensaje(m: string): string {
  if (/plantillas_inspeccion_nombre_uq|Ya tienes una plantilla/i.test(m)) return 'Ya tienes una plantilla con ese nombre.';
  if (/row-level security/i.test(m)) return 'Solo un administrador del taller puede cambiar las plantillas y los servicios.';
  return m;
}

export async function listPlantillas(): Promise<PlantillaResumen[]> {
  const { data, error } = await supabase.from('plantillas_inspeccion').select('id, nombre, es_defecto').order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, esDefecto: p.es_defecto }));
}

export async function getPuntosPlantilla(plantillaId: string): Promise<PlantillaPunto[]> {
  const { data, error } = await supabase.from('plantilla_inspeccion_puntos')
    .select('id, plantilla_id, categoria, nombre, posicion, servicio_id, empresa_id').eq('plantilla_id', plantillaId).order('posicion');
  if (error) throw new Error(error.message);
  return (data as FilaPunto[]).map(mapPunto);
}

/** Crea una plantilla a partir de la estándar (sin `origenId`), de la Pre-ITV (`PLANTILLA_PRE_ITV`) o duplicando otra del taller. */
export async function crearPlantilla(nombre: string, origenId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('crear_plantilla_inspeccion', { p_nombre: nombre, p_origen: origenId });
  if (error) throw new Error(mensaje(error.message));
  return String(data);
}

export async function renombrarPlantilla(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('plantillas_inspeccion').update({ nombre }).eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}

export async function borrarPlantilla(id: string): Promise<void> {
  const { error } = await supabase.from('plantillas_inspeccion').delete().eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}

export async function establecerDefecto(id: string): Promise<void> {
  const { error } = await supabase.rpc('establecer_plantilla_defecto', { p_plantilla_id: id });
  if (error) throw new Error(mensaje(error.message));
}

/**
 * Añade un punto al final de su categoría (o al final de la plantilla si la categoría es nueva) y deja las
 * posiciones seguidas. `actuales` son los puntos que hay ahora en la plantilla.
 */
export async function anadirPunto(plantillaId: string, categoria: string, nombre: string, actuales: PlantillaPunto[]): Promise<void> {
  const { data, error } = await supabase.from('plantilla_inspeccion_puntos')
    .insert({ plantilla_id: plantillaId, categoria, nombre, posicion: actuales.length + 1 } as never)
    .select('id, plantilla_id, categoria, nombre, posicion, servicio_id, empresa_id').single();
  if (error) throw new Error(mensaje(error.message));
  const nuevo = mapPunto(data as FilaPunto);
  const orden = [...actuales].sort((a, b) => a.posicion - b.posicion);
  let ultimo = -1;
  orden.forEach((p, i) => { if (p.categoria === categoria) ultimo = i; });
  const resultado = ultimo < 0 ? [...orden, nuevo] : [...orden.slice(0, ultimo + 1), nuevo, ...orden.slice(ultimo + 1)];
  await guardarOrden([...actuales, nuevo], resultado);
}

export async function actualizarPunto(id: string, cambios: { nombre?: string; categoria?: string; servicioId?: string | null }): Promise<void> {
  const fila: { nombre?: string; categoria?: string; servicio_id?: string | null } = {};
  if (cambios.nombre !== undefined) fila.nombre = cambios.nombre;
  if (cambios.categoria !== undefined) fila.categoria = cambios.categoria;
  if (cambios.servicioId !== undefined) fila.servicio_id = cambios.servicioId;
  const { error } = await supabase.from('plantilla_inspeccion_puntos').update(fila).eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}

export async function borrarPuntoPlantilla(id: string): Promise<void> {
  const { error } = await supabase.from('plantilla_inspeccion_puntos').delete().eq('id', id);
  if (error) throw new Error(mensaje(error.message));
}

/** Guarda el orden de los puntos (solo escribe los que cambiaron de posición). */
export async function guardarOrden(antes: PlantillaPunto[], despues: PlantillaPunto[]): Promise<void> {
  const previa = new Map(antes.map((p) => [p.id, p.posicion]));
  for (const p of renumerar(despues)) {
    if (previa.get(p.id) === p.posicion) continue;
    const { error } = await supabase.from('plantilla_inspeccion_puntos').update({ posicion: p.posicion }).eq('id', p.id);
    if (error) throw new Error(mensaje(error.message));
  }
}
