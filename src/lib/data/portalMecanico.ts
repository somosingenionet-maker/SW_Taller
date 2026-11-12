import { supabase } from '../supabase';

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
  vehiculo: { marca: string; modelo: string; matricula: string } | null;
  tareas: PortalMecanicoTarea[];
  /** Notas que dejó este mismo técnico en la orden. */
  notas: { fecha: string; texto: string }[];
}

export interface PortalMecanicoData {
  empresa: { nombre: string; brandColor: string; logoUrl: string | null } | null;
  tecnico: { nombre: string };
  ordenes: PortalMecanicoOrden[];
}

const SIN_CONEXION = 'No hay conexión. Comprueba tu internet y vuelve a intentarlo.';

/** Mensaje para el mecánico: nunca el texto técnico en inglés de la librería. */
export function mensajePortal(mensaje: string): string {
  return /failed to send a request|failed to fetch|networkerror|load failed|relay error/i.test(mensaje) ? SIN_CONEXION : mensaje;
}

async function invokePortalMecanico<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-mecanico', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context && typeof context.clone === 'function') {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // el cuerpo de error no era JSON; se mantiene el mensaje genérico
      }
    }
    throw new Error(mensajePortal(message));
  }
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

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
