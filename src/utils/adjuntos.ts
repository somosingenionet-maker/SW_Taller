// Reglas de los archivos adjuntos a una compra (la factura del proveedor): qué se acepta y cómo se enseña. Puras y probadas.

/** Lo que guarda el almacenamiento: PDF o imagen web. (Una foto HEIC se convierte a JPEG antes de subirla, si el navegador sabe.) */
export const TIPOS_ADJUNTO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_BYTES_ADJUNTO = 10 * 1024 * 1024;
export const MAX_ADJUNTOS = 10;
/** Las fotos de cámara pesan mucho y se reducen antes de subir: se admiten hasta este tamaño ANTES de reducirlas. */
export const MAX_BYTES_FOTO_ORIGINAL = 40 * 1024 * 1024;

const TIPOS_FOTO_CONVERTIBLES = ['image/heic', 'image/heif'];

export const esTipoAdjunto = (tipo: string): boolean => (TIPOS_ADJUNTO as readonly string[]).includes(tipo);
export const esImagen = (tipo: string): boolean => tipo.startsWith('image/');

/** Tipo del archivo; algunos sistemas no lo informan y entonces se deduce de la extensión (solo PDF, que es lo habitual). */
export function tipoDeArchivo(f: { name: string; type: string }): string {
  return f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : '');
}

/** Primer problema de un archivo elegido (antes de procesarlo), en palabras del taller; null si vale. */
export function validarArchivoFactura(f: { name: string; type: string; size: number }): string | null {
  const nombre = f.name || 'El archivo';
  const tipo = tipoDeArchivo(f);
  if (f.size <= 0) return `«${nombre}» está vacío.`;
  if (tipo === 'application/pdf') return f.size > MAX_BYTES_ADJUNTO ? `«${nombre}» pesa más de 10 MB. Prueba a comprimir el PDF o haz una foto.` : null;
  if (esTipoAdjunto(tipo) || TIPOS_FOTO_CONVERTIBLES.includes(tipo)) {
    return f.size > MAX_BYTES_FOTO_ORIGINAL ? `«${nombre}» es demasiado grande.` : null;
  }
  return `«${nombre}» no se puede adjuntar: usa un PDF o una foto (JPG, PNG o WebP).`;
}

/** «340 KB», «1,2 MB». */
export function formatoTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Extensión para la ruta, a partir del tipo final. */
export function extensionDeTipo(tipo: string): string {
  return ({ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>)[tipo] ?? 'bin';
}

/** Cuántos archivos más caben en la compra y si lo elegido se pasa. */
export function cabenArchivos(yaHay: number, nuevos: number): { caben: number; sobran: number } {
  const caben = Math.max(0, Math.min(nuevos, MAX_ADJUNTOS - yaHay));
  return { caben, sobran: nuevos - caben };
}
