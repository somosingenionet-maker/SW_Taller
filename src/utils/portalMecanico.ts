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

/** «10 nov. 2026 · 12:27», en la hora del móvil del mecánico. */
export function fechaHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MESES[d.getMonth()]}. ${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
