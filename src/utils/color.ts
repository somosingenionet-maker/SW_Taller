/** Devuelve luminancia relativa (0-1) de un color hex. */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const toLinear = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Devuelve '#ffffff' o '#000000' según cuál tenga mejor contraste con el color dado. */
export function contrastText(hex: string): string {
  try {
    const lum = luminance(hex);
    const onWhite = (1.05) / (lum + 0.05);
    const onBlack = (lum + 0.05) / (0.05);
    return onWhite > onBlack ? '#ffffff' : '#000000';
  } catch {
    return '#ffffff';
  }
}
