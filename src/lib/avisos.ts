import { mensajeDeError } from './errores';

// Avisos emergentes de toda la aplicación. Cualquier pantalla avisa con `avisarError` / `avisarOk`
// y App los pinta en un único sitio — así ningún guardado puede fallar sin que el usuario lo vea.
export interface Aviso { tipo: 'error' | 'ok'; mensaje: string }

const EVENTO = 'doonty:aviso';

export function avisar(aviso: Aviso): void {
  window.dispatchEvent(new CustomEvent<Aviso>(EVENTO, { detail: aviso }));
}

/** Enseña por qué falló una acción. `queFallo`: frase de la pantalla, p. ej. «No se pudo guardar la factura.» */
export function avisarError(motivo: unknown, queFallo: string): void {
  console.error(queFallo, motivo);
  avisar({ tipo: 'error', mensaje: mensajeDeError(motivo, queFallo) });
}

export function avisarOk(mensaje: string): void {
  avisar({ tipo: 'ok', mensaje });
}

export function escucharAvisos(alAvisar: (aviso: Aviso) => void): () => void {
  const oyente = (e: Event) => alAvisar((e as CustomEvent<Aviso>).detail);
  window.addEventListener(EVENTO, oyente);
  return () => window.removeEventListener(EVENTO, oyente);
}
