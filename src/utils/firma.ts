// Firma en pantalla: utilidades comunes del lienzo y de la comparación con el importe firmado.

/** Punto de un trazo, normalizado: x de 0 a 1 sobre el ancho; y en las mismas unidades (alto = 1 / relación). */
export type Punto = { x: number; y: number };

/**
 * ¿Hay una firma de verdad y no un toque suelto? Hace falta un trazo con recorrido: al menos 6 puntos
 * y una longitud total de un cuarto del ancho del recuadro.
 */
export function firmaSuficiente(trazos: Punto[][]): boolean {
  let puntos = 0;
  let longitud = 0;
  for (const t of trazos) {
    puntos += t.length;
    for (let i = 1; i < t.length; i++) longitud += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y);
  }
  return puntos >= 6 && longitud >= 0.25;
}

/** El importe de la orden ya no es el que se firmó (centavo arriba o abajo). */
export function importeCambiadoTrasFirma(firmado: number | undefined, actual: number): boolean {
  return firmado != null && Math.abs(firmado - actual) >= 0.005;
}

/** «13 nov. 2026 · 18:42», en la hora del aparato. */
export function fechaHoraFirma(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MESES[d.getMonth()]}. ${d.getFullYear()} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
