import { supabase } from '../supabase';

// Llamadas a las funciones públicas de los portales (cliente y mecánico), con los fallos clasificados
// para que quien abre el enlace entienda qué pasa: sin conexión, enlace que no vale, o un fallo
// pasajero del servidor. Nunca llegan al usuario los textos técnicos en inglés de la librería.

export type TipoErrorPortal = 'conexion' | 'enlace' | 'temporal';

export const SIN_CONEXION = 'No hay conexión. Comprueba tu internet y vuelve a intentarlo.';
const FALLO_TEMPORAL = 'No se pudo cargar en este momento. Inténtalo de nuevo en unos segundos.';

export class ErrorPortal extends Error {
  tipo: TipoErrorPortal;
  constructor(mensaje: string, tipo: TipoErrorPortal) {
    super(mensaje);
    this.name = 'ErrorPortal';
    this.tipo = tipo;
  }
}

const PATRON_CONEXION = /failed to send a request|failed to fetch|networkerror|load failed|network request failed|relay error|err_internet/i;

/**
 * Clasifica un fallo de la función. `status` es el código HTTP si el servidor llegó a responder;
 * `mensajeServidor` es el texto en español que mandó la función (si mandó alguno).
 *   · sin respuesta del servidor → conexión
 *   · 404 → el enlace no existe, está revocado o caducó
 *   · 429, 5xx y demás → fallo pasajero (el enlace puede ser bueno)
 *   · 400/401/403/409 → mensaje del servidor tal cual: es una validación o un permiso, para enseñarlo.
 */
export function clasificarErrorPortal(mensaje: string, status?: number, mensajeServidor?: string): ErrorPortal {
  if (status === undefined) {
    return PATRON_CONEXION.test(mensaje) ? new ErrorPortal(SIN_CONEXION, 'conexion') : new ErrorPortal(FALLO_TEMPORAL, 'temporal');
  }
  if (status === 404) return new ErrorPortal(mensajeServidor || 'Este enlace no es válido.', 'enlace');
  if (status === 429) return new ErrorPortal(mensajeServidor || 'Demasiadas peticiones. Espera un momento y vuelve a intentarlo.', 'temporal');
  if (status >= 500) return new ErrorPortal(FALLO_TEMPORAL, 'temporal');
  return new ErrorPortal(mensajeServidor || FALLO_TEMPORAL, 'temporal');
}

/** Llama a la función de un portal. Lanza siempre `ErrorPortal`. */
export async function invocarPortal<T>(funcion: 'portal-cliente' | 'portal-mecanico', body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcion, { body });
  if (error) {
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.clone === 'function' && typeof contexto.status === 'number') {
      let mensajeServidor: string | undefined;
      try {
        const parsed = await contexto.clone().json();
        if (typeof parsed?.error === 'string') mensajeServidor = parsed.error;
      } catch { /* el cuerpo de error no era JSON */ }
      throw clasificarErrorPortal(error.message, contexto.status, mensajeServidor);
    }
    throw clasificarErrorPortal(error.message);
  }
  if (data?.error) throw new ErrorPortal(String(data.error), 'temporal');
  return data as T;
}
