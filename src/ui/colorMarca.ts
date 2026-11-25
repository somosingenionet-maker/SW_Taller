// Color de marca de cada taller. El taller elige UN color y la interfaz lo usa solo para lo interactivo (botones, menú activo, enlaces,
// pasos). Para que cualquier elección sea legible, aquí se calcula el contraste (WCAG) y se corrige: se oscurece un poco el tono para que el texto blanco
// llegue a 4,5:1 o, si el color es muy claro (amarillo), se pone el texto oscuro. Los colores de estado NO dependen de este color.

export const CONTRASTE_MINIMO = 4.5;
const BLANCO = '#FFFFFF';
export const TINTA = '#1B1A17';

/** Color de marca por defecto: el naranja de Doonty (también el de un taller sin color o con uno no válido). */
export const COLOR_DOONTY = '#E8590C';

export const PRESETS_COLOR: { nombre: string; hex: string }[] = [
  { nombre: 'Naranja Doonty', hex: COLOR_DOONTY },
  { nombre: 'Azul', hex: '#2563EB' },
  { nombre: 'Verde', hex: '#15803D' },
  { nombre: 'Verde azulado', hex: '#0F766E' },
  { nombre: 'Violeta', hex: '#7C3AED' },
  { nombre: 'Rosa', hex: '#DB2777' },
  { nombre: 'Rojo', hex: '#DC2626' },
  { nombre: 'Grafito', hex: '#374151' },
  { nombre: 'Amarillo', hex: '#EAB308' },
];

/** «#abc» o «#AABBCC» → «#AABBCC»; null si no es un color hexadecimal. */
export function normalizarHex(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return ('#' + v.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  return null;
}

const canal = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);

export function luminancia(hex: string): number {
  const lin = [1, 3, 5].map((i) => canal(hex, i) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contraste(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Mezcla `hex` con `con` en la proporción `p` (0 = hex, 1 = con). */
export function mezclar(hex: string, con: string, p: number): string {
  const m = [1, 3, 5].map((i) => Math.round(canal(hex, i) + (canal(con, i) - canal(hex, i)) * p));
  return '#' + m.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Acerca `hex` a `hacia` en pasos del 6 % hasta que contraste con `fondo` lo mínimo, con un máximo de pasos. */
export function ajustarContraste(hex: string, fondo: string, minimo: number, hacia: string, maxPasos = 40): string {
  let c = hex;
  for (let n = 0; n < maxPasos && contraste(c, fondo) < minimo; n++) c = mezclar(c, hacia, 0.06);
  return c;
}

export interface MarcaDerivada {
  /** Color de fondo de botones y menú activo. */
  boton: string;
  /** Texto sobre el botón: blanco, o tinta oscura si el color es muy claro. */
  sobreBoton: string;
  /** Color para texto o enlaces sobre la superficie (siempre legible). */
  tinta: string;
  contrasteBoton: number;
  contrasteTinta: number;
  /** El tono elegido se corrigió (oscurecido o con texto oscuro) para que se lea. */
  corregido: boolean;
}

/**
 * Deriva los colores de la interfaz a partir del color que eligió el taller. `oscuro`: modo oscuro (superficie casi negra).
 * Un color mal escrito cae en el naranja de Doonty.
 */
export function derivarMarca(elegido: string | null | undefined, oscuro = false): MarcaDerivada {
  const base = normalizarHex(elegido) ?? PRESETS_COLOR[0].hex;
  const superficie = oscuro ? '#1B1A17' : BLANCO;
  let boton = base;
  let sobreBoton = BLANCO;
  if (contraste(base, BLANCO) < CONTRASTE_MINIMO) {
    const oscurecido = ajustarContraste(base, BLANCO, CONTRASTE_MINIMO, '#000000', 5);   // como mucho ~27 % más oscuro: sigue siendo «su» color
    if (contraste(oscurecido, BLANCO) >= CONTRASTE_MINIMO) boton = oscurecido;
    else if (contraste(base, TINTA) >= CONTRASTE_MINIMO) sobreBoton = TINTA;               // color claro: se queda como es y el texto va oscuro
    else boton = ajustarContraste(base, BLANCO, CONTRASTE_MINIMO, '#000000');
  }
  const tinta = oscuro ? ajustarContraste(base, superficie, CONTRASTE_MINIMO, BLANCO) : ajustarContraste(base, superficie, CONTRASTE_MINIMO, '#000000');
  return {
    boton, sobreBoton, tinta,
    contrasteBoton: contraste(boton, sobreBoton), contrasteTinta: contraste(tinta, superficie),
    corregido: boton !== base || sobreBoton !== BLANCO,
  };
}
