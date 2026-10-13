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
