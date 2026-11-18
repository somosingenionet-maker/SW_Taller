// Cálculos y textos de la orden de trabajo, puros (sin pantalla) y probados en utilidades.test.ts.
import type { EventoOT, LineaOT, OTEstado, OrdenTrabajo } from '../../types';

/** Estados donde añadir una línea no implica avisar de un extra al cliente. */
export const ESTADOS_SIN_AVISO_EXTRA: OTEstado[] = ['presupuesto', 'cancelado', 'entregado'];

export function mailHref(correo: string | undefined, asunto: string, mensaje: string): string | null {
  return correo ? `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(mensaje)}` : null;
}

export function calcTotals(lineas: LineaOT[], ivaPct: number) {
  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const totalIva = subtotal * (ivaPct / 100);
  return { subtotal, totalIva, total: subtotal + totalIva };
}

export function evento(descripcion: string): EventoOT {
  return { fecha: new Date().toISOString(), descripcion };
}

export function diasDesde(fechaISO: string): { texto: string; aviso: boolean } {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000);
  if (dias <= 0) return { texto: 'hoy', aviso: false };
  return { texto: `${dias} día${dias !== 1 ? 's' : ''}`, aviso: dias > 5 };
}

/** Progreso de las tareas del mecánico (líneas de mano de obra) marcadas desde el Portal del Mecánico. */
export function progresoTareas(ot: OrdenTrabajo): { total: number; hechas: number; terminado: boolean } {
  const tareas = ot.lineas.filter(l => l.tipo === 'mano_de_obra');
  const hechas = tareas.filter(l => l.completado).length;
  return { total: tareas.length, hechas, terminado: tareas.length > 0 && hechas === tareas.length };
}
