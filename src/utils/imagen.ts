// Compresión de imágenes en el navegador, ANTES de subirlas. Las fotos de la cámara de un móvil pesan
// 3-8 MB; reducidas a 1.600 px de lado largo y calidad 0,72 se quedan en ~250-350 KB sin perder lo
// que importa (matrículas, desgaste, daños). Así se gasta menos almacenamiento y menos datos móviles.

export interface OpcionesCompresion {
  /** Lado largo máximo en píxeles. */
  ladoMax: number;
  /** Calidad JPEG (0-1). */
  calidad: number;
}

/** Fotos de vehículo: recepción e inspección. */
export const OPCIONES_FOTO: OpcionesCompresion = { ladoMax: 1600, calidad: 0.72 };
/** Logos: se muestran pequeños, no necesitan más. */
export const OPCIONES_LOGO: OpcionesCompresion = { ladoMax: 800, calidad: 0.85 };

/** Tamaño final conservando proporciones y SIN ampliar nunca. */
export function tamanoEscalado(ancho: number, alto: number, ladoMax: number): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (!(ancho > 0 && alto > 0) || lado <= ladoMax) return { ancho, alto };
  const k = ladoMax / lado;
  return { ancho: Math.max(1, Math.round(ancho * k)), alto: Math.max(1, Math.round(alto * k)) };
}

/** Formatos que no se tocan: el vectorial no se rasteriza y el GIF podría ser animado. */
export function esFormatoIntocable(tipo: string): boolean {
  return tipo === 'image/svg+xml' || tipo === 'image/gif';
}

/** ¿Hay que tocarlo? No si ya cabe en las dimensiones y pesa poco: recomprimirlo solo lo empeoraría. */
export function yaEstaOptimizada(bytes: number, ancho: number, alto: number, ladoMax: number): boolean {
  return Math.max(ancho, alto) <= ladoMax && bytes <= 400 * 1024;
}

export interface ImagenComprimida {
  blob: Blob;
  /** Extensión sin punto, coherente con el tipo final. */
  ext: string;
  tipo: string;
  /** false si se devolvió el original (formato intocable, ya optimizada o no se pudo decodificar). */
  comprimida: boolean;
}

const EXT_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/heic': 'heic',
};
const extDe = (f: File) => EXT_POR_TIPO[f.type] || f.name.split('.').pop()?.toLowerCase() || 'jpg';

const original = (f: File): ImagenComprimida => ({ blob: f, ext: extDe(f), tipo: f.type, comprimida: false });

/**
 * Reduce una imagen. Nunca falla por culpa de la compresión: si el navegador no puede decodificarla
 * (p. ej. HEIC en Chrome) o el resultado pesa más que el original, devuelve el original.
 * Un PNG se mantiene PNG (puede tener transparencia, típico de los logos); el resto sale en JPEG.
 */
export async function comprimirImagen(file: File, opciones: OpcionesCompresion = OPCIONES_FOTO): Promise<ImagenComprimida> {
  if (esFormatoIntocable(file.type)) return original(file);
  try {
    const bmp = await createImageBitmap(file); // respeta la orientación EXIF en los navegadores actuales
    const { ancho, alto } = tamanoEscalado(bmp.width, bmp.height, opciones.ladoMax);
    if (ancho === bmp.width && alto === bmp.height && yaEstaOptimizada(file.size, bmp.width, bmp.height, opciones.ladoMax)) {
      bmp.close();
      return original(file);
    }
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) { bmp.close(); return original(file); }
    const conservarPng = file.type === 'image/png';
    if (!conservarPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ancho, alto); } // JPEG no tiene transparencia
    ctx.drawImage(bmp, 0, 0, ancho, alto);
    bmp.close();
    const tipo = conservarPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, tipo, opciones.calidad));
    if (!blob || blob.size >= file.size) return original(file);
    return { blob, ext: EXT_POR_TIPO[tipo], tipo, comprimida: true };
  } catch {
    return original(file);
  }
}

/** Blob → «data:…;base64,…» (los logos de la app se guardan así). */
export function blobADataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, fallo) => {
    const lector = new FileReader();
    lector.onload = () => ok(String(lector.result));
    lector.onerror = () => fallo(lector.error ?? new Error('No se pudo leer la imagen.'));
    lector.readAsDataURL(blob);
  });
}
