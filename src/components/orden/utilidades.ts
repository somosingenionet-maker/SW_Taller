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

/**
 * Qué decir sobre los recordatorios automáticos de un presupuesto enviado y sin respuesta (null si no procede).
 * Salen a los 3 días del envío y a los 7, como mucho dos. Un presupuesto enviado antes de existir esta función se
 * marcó como «ya recordado» sin fecha de aviso: de ese no se dice nada.
 */
export function textoRecordatoriosPresupuesto(ot: Pick<OrdenTrabajo, 'presupuestoEstado' | 'presupuestoAprobado' | 'aceptacionPresupuesto' | 'presupuestoRecordatorios' | 'presupuestoRecordadoEn'>): string | null {
  if (ot.presupuestoEstado !== 'enviado' || ot.presupuestoAprobado != null || ot.aceptacionPresupuesto) return null;
  const n = ot.presupuestoRecordatorios ?? 0;
  const dia = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (n === 0) return 'Si no responde, el sistema le avisará solo a los 3 días del envío y, si sigue sin responder, a los 7 (con los recordatorios automáticos activados).';
  if (!ot.presupuestoRecordadoEn) return null;
  if (n === 1) return `Ya se le avisó el ${dia(ot.presupuestoRecordadoEn)}. Habrá un último aviso a los 7 días del envío.`;
  return `Ya se le avisó dos veces (la última el ${dia(ot.presupuestoRecordadoEn)}). No se le avisará más.`;
}
