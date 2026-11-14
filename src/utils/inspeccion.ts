// Utilidades de la inspección digital en la web (mecánico, taller y cliente). Puras y probadas.

export type EstadoPunto = 'bien' | 'atencion' | 'urgente' | 'no_aplica';
export type EstadoInspeccion = 'borrador' | 'terminada' | 'enviada' | 'respondida';

export const ESTADOS_PUNTO: EstadoPunto[] = ['bien', 'atencion', 'urgente', 'no_aplica'];

export const ETIQUETA_ESTADO: Record<EstadoPunto, string> = {
  bien: 'Bien', atencion: 'Atención', urgente: 'Urgente', no_aplica: 'No aplica',
};

export const ETIQUETA_ESTADO_INSPECCION: Record<EstadoInspeccion, string> = {
  borrador: 'En curso (mecánico)', terminada: 'Pendiente de revisar', enviada: 'Enviada al cliente', respondida: 'Respondida por el cliente',
};

/** Solo «atención» y «urgente» llevan foto, nota y reparación propuesta. */
export const necesitaDetalle = (e: EstadoPunto | null | undefined): boolean => e === 'atencion' || e === 'urgente';

export const MAX_FOTOS_PUNTO = 3;
export const MAX_FOTOS_INSPECCION = 20;

export interface PuntoBase { estado: EstadoPunto | null; precio?: number | null }

export function resumenPuntos(puntos: PuntoBase[]) {
  const r = { bien: 0, atencion: 0, urgente: 0, no_aplica: 0, sinMarcar: 0, total: puntos.length };
  for (const p of puntos) { if (p.estado) r[p.estado]++; else r.sinMarcar++; }
  return r;
}

/** Puntos urgentes sin precio: bloquean el envío (los de atención pueden ir sin precio). */
export const urgentesSinPrecio = (puntos: PuntoBase[]): number =>
  puntos.filter((p) => p.estado === 'urgente' && !(p.precio != null && p.precio > 0)).length;

/** Agrupa por categoría conservando el orden de aparición. */
export function agruparPorCategoria<T extends { categoria: string }>(puntos: T[]): { categoria: string; puntos: T[] }[] {
  const grupos: { categoria: string; puntos: T[] }[] = [];
  for (const p of puntos) {
    const g = grupos.find((x) => x.categoria === p.categoria);
    if (g) g.puntos.push(p); else grupos.push({ categoria: p.categoria, puntos: [p] });
  }
  return grupos;
}

export interface PuntoAprobable {
  id: string; nombre: string; reparacion: string | null; precio: number | null;
  estado: EstadoPunto | null; decision: 'aprobado' | 'rechazado' | null;
}

/**
 * Líneas que se pueden añadir a la orden: puntos con problema y precio que el cliente aprobó y que aún no
 * están en la orden (cada línea guarda el id del punto, así no se duplican nunca).
 */
export function puntosPendientesDeAnadir(puntos: PuntoAprobable[], yaAnadidos: Set<string>): PuntoAprobable[] {
  return puntos.filter((p) =>
    necesitaDetalle(p.estado) && p.decision === 'aprobado' && p.precio != null && p.precio > 0 && !yaAnadidos.has(p.id));
}

/** Texto de la línea: la reparación propuesta si la hay; si no, el punto revisado. */
export const descripcionLinea = (p: Pick<PuntoAprobable, 'nombre' | 'reparacion'>): string =>
  (p.reparacion?.trim() || `Reparación: ${p.nombre}`).slice(0, 200);

export const redondear2 = (n: number): number => Math.round(n * 100) / 100;

export function totalPuntos(puntos: { precio: number | null }[]): number {
  return redondear2(puntos.reduce((s, p) => s + (p.precio ?? 0), 0));
}

/** Interpreta lo que se escribe en el campo de precio: «64», «64,5», «64.50». Vacío → null; inválido → undefined. */
export function parsearPrecio(texto: string): number | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
}

// ---- Plantillas: edición de la lista de puntos ----

export interface PuntoEditable { id: string; categoria: string; nombre: string; posicion: number }

/** Deja las posiciones como 1..n según el orden actual de la lista. */
export function renumerar<T extends { posicion: number }>(lista: T[]): T[] {
  return lista.map((p, i) => ({ ...p, posicion: i + 1 }));
}

/** Categorías en el orden en que aparecen. */
export function categoriasDe(puntos: { categoria: string; posicion: number }[]): string[] {
  const orden = [...puntos].sort((a, b) => a.posicion - b.posicion);
  return [...new Set(orden.map((p) => p.categoria))];
}

/** Sube (-1) o baja (+1) un punto dentro de su categoría. Si ya está en el extremo, no cambia nada. */
export function moverPunto<T extends PuntoEditable>(puntos: T[], id: string, delta: -1 | 1): T[] {
  const orden = [...puntos].sort((a, b) => a.posicion - b.posicion);
  const i = orden.findIndex((p) => p.id === id);
  if (i < 0) return renumerar(orden);
  let j = i + delta;
  while (j >= 0 && j < orden.length && orden[j].categoria !== orden[i].categoria) j += delta;
  if (j < 0 || j >= orden.length) return renumerar(orden);
  [orden[i], orden[j]] = [orden[j], orden[i]];
  return renumerar(orden);
}

/** Sube o baja una categoría entera (con todos sus puntos) respecto a la vecina. */
export function moverCategoria<T extends PuntoEditable>(puntos: T[], categoria: string, delta: -1 | 1): T[] {
  const orden = [...puntos].sort((a, b) => a.posicion - b.posicion);
  const cats = categoriasDe(orden);
  const i = cats.indexOf(categoria);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cats.length) return renumerar(orden);
  [cats[i], cats[j]] = [cats[j], cats[i]];
  return renumerar(cats.flatMap((c) => orden.filter((p) => p.categoria === c)));
}

/** Nombre de categoría o de punto válido: recortado, de 1 a `max` caracteres. Devuelve null si no vale. */
export function nombreValido(texto: string, max: number): string | null {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

export interface PuntoConSugerencia {
  estado: EstadoPunto | null; precio: number | null; precioSugerido: number | null; reparacion: string | null; reparacionSugerida: string | null;
}

/** ¿Tiene este punto una sugerencia que aún no se ha aplicado? Solo en puntos con problema y sin precio. */
export function sugerenciaPendiente(p: PuntoConSugerencia): boolean {
  return necesitaDetalle(p.estado) && !(p.precio != null && p.precio > 0) && p.precioSugerido != null && p.precioSugerido > 0;
}
