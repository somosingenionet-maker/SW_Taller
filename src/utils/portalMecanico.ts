// Lógica de pantalla del Portal del Mecánico, separada del componente para poder probarla.

export interface OrdenVista { id: string; estado: string }

export const GRUPOS = [
  { estado: 'en_reparacion', titulo: 'En reparación' },
  { estado: 'recibido', titulo: 'Por empezar' },
  { estado: 'listo', titulo: 'Listos' },
] as const;

/**
 * Coches nuevos para el mecánico: los que no había visto todavía. La primera vez que abre el enlace
 * (`vistos` = null) no se marca ninguno: todo sería «nuevo» y el aviso no diría nada.
 */
export function ordenesNuevas(ordenes: OrdenVista[], vistos: string[] | null): string[] {
  if (vistos === null) return [];
  const conocidos = new Set(vistos);
  return ordenes.filter((o) => o.estado !== 'listo' && !conocidos.has(o.id)).map((o) => o.id);
}

/** Lista de vistos a guardar: solo ids que siguen existiendo (no crece sin fin) más los recién vistos. */
export function vistosActualizados(ordenes: OrdenVista[], vistos: string[] | null, recienVistos: string[]): string[] {
  const vivos = new Set(ordenes.map((o) => o.id));
  return [...new Set([...(vistos ?? ordenes.map((o) => o.id)), ...recienVistos])].filter((id) => vivos.has(id));
}

type Ordenable = { ingreso: string | null; fechaEstimadaEntrega: string | null; listoEn?: string | null };

const aMs = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * Orden de los coches dentro de cada grupo (lo que haría un jefe de taller):
 *   · Por empezar y En reparación: primero lo más urgente, es decir, la entrega prevista más cercana
 *     (las ya vencidas van las primeras); a igual fecha, el que llegó antes (por turno). Sin fecha
 *     prevista, al final de su grupo y también por turno.
 *   · Listos: el último en terminarse, arriba (es lo que acaba de dejar y quizá haya que avisar al
 *     cliente). Si no se sabe cuándo se terminó, se usa la hora de llegada.
 * El orden es estable y no modifica la lista original.
 */
export function ordenarGrupo<T extends Ordenable>(estado: string, ordenes: T[]): T[] {
  const BIEN_LEJOS = Number.POSITIVE_INFINITY;
  const clave = (o: T): [number, number] => estado === 'listo'
    // más reciente primero → se ordena por el negativo; sin dato, al final
    ? [-(aMs(o.listoEn) ?? aMs(o.ingreso) ?? -BIEN_LEJOS), 0]
    : [aMs(o.fechaEstimadaEntrega) ?? BIEN_LEJOS, aMs(o.ingreso) ?? BIEN_LEJOS];
  return ordenes
    .map((o, i) => ({ o, i, k: clave(o) }))
    .sort((a, b) => (a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.i - b.i) || 0)
    .map((x) => x.o);
}

/** Hoy en la hora local del móvil, «AAAA-MM-DD». */
export function hoyLocal(ahora: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`;
}

export interface PlazoEntrega { tipo: 'vencida' | 'hoy' | 'manana' | 'futura'; texto: string }

/** Cómo va el plazo de entrega prevista respecto a hoy, para avisar al mecánico de lo urgente. */
export function plazoEntrega(fecha: string | null, hoy: string): PlazoEntrega | null {
  if (!fecha) return null;
  const dias = Math.round((Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(dias)) return null;
  if (dias < 0) return { tipo: 'vencida', texto: dias === -1 ? 'Debía entregarse ayer' : `Retrasado ${-dias} días` };
  if (dias === 0) return { tipo: 'hoy', texto: 'Entrega hoy' };
  if (dias === 1) return { tipo: 'manana', texto: 'Entrega mañana' };
  return { tipo: 'futura', texto: `Entrega ${fecha.slice(8, 10).replace(/^0/, '')}/${fecha.slice(5, 7).replace(/^0/, '')}` };
}

/** «10 nov. 2026 · 12:27», en la hora del móvil del mecánico. */
export function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MESES[d.getMonth()]}. ${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
