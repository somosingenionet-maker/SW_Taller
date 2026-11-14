import { invocarPortal } from './invocarPortal';
import type { EstadoFiltro, FiltroAceite, FiltrosAceite } from '../../types';
import { supabase } from '../supabase';
import { comprimirImagen, OPCIONES_FOTO } from '../../utils/imagen';
import type { EstadoInspeccion, EstadoPunto } from '../../utils/inspeccion';

export interface PortalMecanicoTarea {
  id: string;
  descripcion: string;
  completado: boolean;
  /** Minutos reales anotados al terminar la tarea; null si no se anotó. */
  duracionMin: number | null;
}

export type EstadoMecanico = 'recibido' | 'en_reparacion' | 'listo';

export interface PortalMecanicoOrden {
  id: string;
  numero: string;
  estado: EstadoMecanico;
  descripcionProblema: string;
  diagnostico: string | null;
  kilometrajeEntrada: number | null;
  fechaEstimadaEntrega: string | null;
  /** Momento real en que el coche entró al taller (ISO). */
  ingreso: string | null;
  /** Solo en los coches «listos»: cuándo se marcaron como listos. Nulo con una versión antigua de la función. */
  listoEn?: string | null;
  vehiculo: { marca: string; modelo: string; matricula: string } | null;
  tareas: PortalMecanicoTarea[];
  /** Notas que dejó este mismo técnico en la orden. */
  notas: { fecha: string; texto: string }[];
  /** Cambio de aceite: interruptor, check list de filtros y próximo cambio anotado en esta orden. */
  esCambioAceite: boolean;
  filtros: FiltrosAceite;
  aceiteProximo: { fecha: string; km: number | null } | null;
}

export interface PortalInspeccionPunto {
  id: string;
  categoria: string;
  nombre: string;
  estado: EstadoPunto | null;
  nota: string | null;
  reparacion: string | null;
  /** `url` es un enlace de lectura que caduca a la hora; null si no se pudo generar. */
  fotos: { ruta: string; url: string | null }[];
}

export interface PortalInspeccion {
  id: string;
  estado: EstadoInspeccion;
  notaGeneral: string | null;
  puntos: PortalInspeccionPunto[];
}

export interface PortalMecanicoData {
  empresa: { nombre: string; brandColor: string; logoUrl: string | null } | null;
  tecnico: { nombre: string };
  ordenes: PortalMecanicoOrden[];
  /** Inspecciones abiertas (en curso o terminadas sin enviar), por id de orden. */
  inspecciones?: Record<string, PortalInspeccion>;
}

const invokePortalMecanico = <T,>(body: Record<string, unknown>) => invocarPortal<T>('portal-mecanico', body);

export async function getPortalMecanicoData(token: string): Promise<PortalMecanicoData> {
  return invokePortalMecanico<PortalMecanicoData>({ token });
}

/** Marca o desmarca una tarea. Al marcarla se envía el tiempo real que llevó (minutos). */
export async function marcarTareaMecanico(token: string, lineaId: string, completado: boolean, duracionMin?: number | null): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'marcar_tarea', lineaId, completado, duracionMin: duracionMin ?? null });
}

/** Corrige el tiempo de una tarea ya hecha. */
export async function cambiarDuracionMecanico(token: string, lineaId: string, duracionMin: number): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'duracion', lineaId, duracionMin });
}

/** Empezar la reparación, dejar el coche listo o reabrirlo. */
export async function cambiarEstadoMecanico(token: string, otId: string, accion: 'empezar' | 'listo' | 'reabrir'): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: accion, otId });
}

export async function dejarNotaMecanico(token: string, otId: string, texto: string): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'nota', otId, texto });
}

/** Marca o quita «es un cambio de aceite» en la orden. */
export async function marcarCambioAceiteMecanico(token: string, otId: string, activo: boolean): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'aceite', otId, activo });
}

/** Marca un filtro como cambiado / no cambiado, o lo deja sin revisar (null). */
export async function marcarFiltroMecanico(token: string, otId: string, filtro: FiltroAceite, estado: EstadoFiltro): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'filtro', otId, filtro, estado });
}

/** Anota el próximo cambio de aceite (fecha y, si se quiere, km) en la ficha del vehículo. */
export async function anotarProximoCambioMecanico(token: string, otId: string, fecha: string, km: number | null): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'aceite_proximo', otId, fecha, km });
}

// ---- Inspección digital ----

/** Abre la inspección de la orden (con la plantilla estándar) o devuelve la que ya tiene. */
export async function crearInspeccionMecanico(token: string, otId: string): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_crear', otId });
}

/** Marca un punto (estado null = sin revisar). Nota y reparación solo cuentan en «atención» y «urgente». */
export async function marcarPuntoMecanico(
  token: string, inspeccionId: string, puntoId: string, estado: EstadoPunto | null, nota?: string | null, reparacion?: string | null,
): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_punto', inspeccionId, puntoId, estado, nota: nota ?? null, reparacion: reparacion ?? null });
}

/**
 * Sube una foto de un punto: la reduce en el móvil, pide una URL de subida de un solo uso, sube directamente
 * al almacenamiento y registra la ruta. Si algo falla, no queda registrada ninguna foto a medias.
 */
export async function subirFotoInspeccionMecanico(token: string, inspeccionId: string, puntoId: string, archivo: File): Promise<void> {
  const { blob, tipo } = await comprimirImagen(archivo, OPCIONES_FOTO);
  const { ruta, token: tokenSubida } = await invokePortalMecanico<{ ok: true; ruta: string; token: string }>({
    token, action: 'inspeccion_foto_url', inspeccionId, puntoId, mime: tipo,
  });
  const { error } = await supabase.storage.from('inspecciones').uploadToSignedUrl(ruta, tokenSubida, blob, { contentType: tipo });
  if (error) throw new Error('No se pudo subir la foto. Comprueba la cobertura e inténtalo de nuevo.');
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_foto_registrar', inspeccionId, puntoId, ruta });
}

export async function borrarFotoInspeccionMecanico(token: string, inspeccionId: string, puntoId: string, ruta: string): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_foto_borrar', inspeccionId, puntoId, ruta });
}

export async function terminarInspeccionMecanico(token: string, inspeccionId: string, notaGeneral?: string | null): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_terminar', inspeccionId, notaGeneral: notaGeneral ?? null });
}

export async function reabrirInspeccionMecanico(token: string, inspeccionId: string): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'inspeccion_reabrir', inspeccionId });
}
