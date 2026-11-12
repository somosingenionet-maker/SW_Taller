// Tiempo real de una tarea de taller: lo anota el mecánico al terminarla desde su Portal.

/** Opciones que se ofrecen al mecánico (minutos). Botones grandes: se elige con el dedo, sin teclear. */
export const OPCIONES_DURACION = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360] as const;

/** «45 min», «1 h», «1 h 30 min». */
export function textoDuracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60), m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Horas cobradas de una línea de mano de obra (su cantidad son horas): «1 h», «1,5 h». */
export function textoHoras(horas: number): string {
  return `${(Math.round(horas * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} h`;
}

export interface TareaConTiempo { tipo: string; cantidad: number; completado?: boolean; duracionMin?: number }

/**
 * Resumen de tiempos de una orden: minutos reales anotados por el mecánico frente a horas cobradas
 * (la suma de cantidades de las líneas de mano de obra). `conTiempo` dice de cuántas tareas hay dato:
 * si faltan, la comparación es parcial y no debe leerse como «se tardó menos».
 */
export function resumenTiempos(lineas: TareaConTiempo[]) {
  const tareas = lineas.filter((l) => l.tipo === 'mano_de_obra');
  const conTiempo = tareas.filter((l) => l.duracionMin != null);
  return {
    tareas: tareas.length,
    hechas: tareas.filter((l) => l.completado).length,
    conTiempo: conTiempo.length,
    minutosReales: conTiempo.reduce((s, l) => s + (l.duracionMin ?? 0), 0),
    horasCobradas: tareas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0),
  };
}
