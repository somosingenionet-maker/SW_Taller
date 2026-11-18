// Aspecto claro / oscuro / automático (por persona, se guarda en el navegador). «Automático» sigue la preferencia del sistema.
export type Tema = 'claro' | 'oscuro' | 'auto';
const CLAVE = 'doonty-tema';

const guardado = (): Storage | null => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } };

export function leerTema(almacen: Pick<Storage, 'getItem'> | null = guardado()): Tema {
  try { const v = almacen?.getItem(CLAVE); return v === 'oscuro' || v === 'auto' ? v : 'claro'; } catch { return 'claro'; }
}

export function guardarTema(t: Tema, almacen: Pick<Storage, 'setItem'> | null = guardado()): void {
  try { almacen?.setItem(CLAVE, t); } catch { /* sin almacenamiento: dura mientras la pestaña esté abierta */ }
}

/** ¿Se pinta en oscuro? `sistemaOscuro` es la preferencia del sistema (solo cuenta en «automático»). */
export const esOscuro = (t: Tema, sistemaOscuro: boolean): boolean => t === 'oscuro' || (t === 'auto' && sistemaOscuro);
