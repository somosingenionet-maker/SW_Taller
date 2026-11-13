import { lazy, type ComponentType } from 'react';

// Carga diferida de pantallas (cada pestaña y cada ventana grande es un trozo aparte del paquete).
//
// El problema de siempre: tras una publicación nueva, una pestaña que ya estaba abierta pide un
// trozo con el nombre de la versión anterior, que ya no existe → «Failed to fetch dynamically
// imported module» y pantalla rota. Aquí se detecta ese error concreto y se recarga la página UNA
// vez (la versión nueva trae los nombres nuevos). Si vuelve a fallar enseguida, no se entra en
// bucle: el error sube hasta la pantalla de error de la aplicación.

const CLAVE = 'doonty-recarga-por-version';
/** Si ya se recargó hace menos de esto, un nuevo fallo es otro problema (red, bloqueo): no se recarga. */
export const VENTANA_RECARGA_MS = 30_000;

const PATRON_ERROR_CARGA = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i;

/** ¿Es el error de «no se pudo bajar un trozo de la aplicación»? */
export function esErrorDeCarga(err: unknown): boolean {
  const texto = err instanceof Error ? `${err.name} ${err.message}` : typeof err === 'string' ? err : '';
  return PATRON_ERROR_CARGA.test(texto);
}

/** ¿Toca recargar? Una vez por ventana de tiempo, nunca en bucle. */
export function debeRecargar(ahora: number, ultimaRecarga: number | null, ventanaMs = VENTANA_RECARGA_MS): boolean {
  return ultimaRecarga === null || Number.isNaN(ultimaRecarga) || ahora - ultimaRecarga > ventanaMs;
}

const leerUltima = (): number | null => {
  try { const v = sessionStorage.getItem(CLAVE); return v === null ? null : Number(v); } catch { return null; }
};
const guardarUltima = (t: number) => { try { sessionStorage.setItem(CLAVE, String(t)); } catch { /* sin almacenamiento */ } };

/** `React.lazy` que se recupera solo de un trozo desaparecido tras una publicación. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyConReintento<T extends ComponentType<any>>(cargar: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await cargar();
    } catch (err) {
      if (esErrorDeCarga(err) && debeRecargar(Date.now(), leerUltima())) {
        guardarUltima(Date.now());
        window.location.reload();
        // La página se está recargando: este componente se queda cargando hasta entonces.
        return new Promise<never>(() => undefined);
      }
      throw err;
    }
  });
}
