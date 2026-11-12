// El servidor bloquea la escritura de una empresa cuya prueba o suscripción ha caducado
// (disparador `exigir_suscripcion_activa`, migración suscripciones) con este mensaje. Muchos
// formularios no capturan los errores de guardado, así que se detecta aquí para enseñarlo desde
// un solo sitio (App) en vez de dejar al usuario sin saber por qué no se guarda.
export const MARCA_SOLO_LECTURA = 'Tu periodo de prueba o tu suscripción ha terminado';

export function mensajeSoloLectura(motivo: unknown): string | null {
  const texto = motivo instanceof Error ? motivo.message
    : typeof motivo === 'string' ? motivo
    : typeof (motivo as { message?: unknown } | null)?.message === 'string' ? (motivo as { message: string }).message
    : '';
  return texto.includes(MARCA_SOLO_LECTURA) ? texto : null;
}

/** Texto de un error venga como venga (Error, texto u objeto con `message`). */
export function textoDeError(motivo: unknown): string {
  if (motivo instanceof Error) return motivo.message;
  if (typeof motivo === 'string') return motivo;
  const m = (motivo as { message?: unknown } | null)?.message;
  return typeof m === 'string' ? m : '';
}

const SIN_CONEXION = /failed to fetch|networkerror|load failed|network request failed|err_internet|fetch failed/i;
// Mensajes que vienen tal cual de Postgres / la API: no dicen nada a quien usa el taller.
const TECNICO = /violates|duplicate key|constraint|relation "|column "|permission denied|row-level security|jwt|syntax error|invalid input|null value|pgrst|schema cache|timeout|unexpected|undefined|cannot read|is not a function|status code/i;

/**
 * Mensaje que se enseña al usuario cuando una acción falla. `queFallo` es la frase propia de la
 * pantalla («No se pudo guardar la factura.»). Los mensajes escritos por nosotros (validaciones del
 * servidor, solo lectura) se muestran tal cual; los técnicos se acompañan de la frase y quedan como detalle.
 */
export function mensajeDeError(motivo: unknown, queFallo: string): string {
  const texto = textoDeError(motivo).trim();
  if (!texto) return queFallo;
  if (SIN_CONEXION.test(texto)) return `${queFallo} No hay conexión con el servidor: comprueba tu internet y vuelve a intentarlo.`;
  if (TECNICO.test(texto)) return `${queFallo} Vuelve a intentarlo; si se repite, avísanos. (Detalle: ${texto.slice(0, 160)})`;
  return texto;
}
