// Interruptor «nuevo diseño»: mientras se rehacen las pantallas conviven las dos interfaces. Se guarda en el navegador (no toca la base de datos).
// Se activa con el botón del pie (administradores) o con ?ui=nuevo / ?ui=actual en la dirección.
export type Diseno = 'nuevo' | 'actual';
const CLAVE = 'doonty-ui';

/** Lee la preferencia. El parámetro `?ui=` manda sobre lo guardado (y se guarda). Si algo falla (navegación privada), siempre «actual». */
export function leerDiseno(buscar: string = typeof window === 'undefined' ? '' : window.location.search, almacen: Pick<Storage, 'getItem' | 'setItem'> | null = guardado()): Diseno {
  const param = new URLSearchParams(buscar).get('ui');
  if (param === 'nuevo' || param === 'actual') { guardarDiseno(param, almacen); return param; }
  try { return almacen?.getItem(CLAVE) === 'nuevo' ? 'nuevo' : 'actual'; } catch { return 'actual'; }
}

export function guardarDiseno(d: Diseno, almacen: Pick<Storage, 'getItem' | 'setItem'> | null = guardado()): void {
  try { almacen?.setItem(CLAVE, d); } catch { /* sin almacenamiento: la elección dura mientras la pestaña esté abierta */ }
}

function guardado(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
