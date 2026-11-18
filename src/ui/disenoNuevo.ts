// Interruptor del diseño: el nuevo es el de serie; la interfaz anterior sigue disponible un tiempo (menú de la cuenta o ?ui=actual) como red de seguridad.
// Se guarda en el navegador (no toca la base de datos).
export type Diseno = 'nuevo' | 'actual';
const CLAVE = 'doonty-ui';

/** Lee la preferencia. El parámetro `?ui=` manda sobre lo guardado (y se guarda). Sin nada guardado (o sin almacenamiento, p. ej. navegación privada) es «nuevo». */
export function leerDiseno(buscar: string = typeof window === 'undefined' ? '' : window.location.search, almacen: Pick<Storage, 'getItem' | 'setItem'> | null = guardado()): Diseno {
  const param = new URLSearchParams(buscar).get('ui');
  if (param === 'nuevo' || param === 'actual') { guardarDiseno(param, almacen); return param; }
  try { return almacen?.getItem(CLAVE) === 'actual' ? 'actual' : 'nuevo'; } catch { return 'nuevo'; }
}

export function guardarDiseno(d: Diseno, almacen: Pick<Storage, 'getItem' | 'setItem'> | null = guardado()): void {
  try { almacen?.setItem(CLAVE, d); } catch { /* sin almacenamiento: la elección dura mientras la pestaña esté abierta */ }
}

function guardado(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

/** ¿Está activo el diseño nuevo? Cambiar de diseño vuelve a montar las pantallas, así que basta leerlo al pintar. */
export const esDisenoNuevo = (): boolean => typeof document !== 'undefined' && document.documentElement.dataset.ui === 'nuevo';
