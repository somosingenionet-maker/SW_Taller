// Piezas comunes de los correos que el taller manda a sus clientes (informe de inspección, presupuesto…).
export const escaparHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const COLOR_POR_DEFECTO = '#2563eb';
export const colorValido = (c: unknown): string => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : COLOR_POR_DEFECTO);

/** Color de texto legible sobre el color de marca del taller. */
export function textoSobre(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

/** Importe con coma decimal: «1234,50». */
export const eur = (n: number) => n.toFixed(2).replace('.', ',');
