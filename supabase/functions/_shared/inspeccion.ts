// Reglas de la inspección digital que comparten las funciones del servidor (portal del mecánico, portal
// del cliente, envío y borrado de fotos). Puro: sin red ni base de datos, para probarlo a fondo.

export const ESTADOS_PUNTO = ['bien', 'atencion', 'urgente', 'no_aplica'] as const;
export type EstadoPunto = typeof ESTADOS_PUNTO[number];

export const MAX_FOTOS_PUNTO = 3;
export const MAX_FOTOS_INSPECCION = 20;
export const NOTA_PUNTO_MAX = 500;
export const REPARACION_MAX = 300;
export const NOTA_GENERAL_MAX = 500;

/** Estados de la inspección en los que el mecánico puede marcar puntos y subir fotos. */
export const BORRADOR = 'borrador';

export const esEstadoPunto = (v: unknown): v is EstadoPunto => typeof v === 'string' && (ESTADOS_PUNTO as readonly string[]).includes(v);

/** Solo «atención» y «urgente» llevan foto, nota y reparación propuesta. */
export const necesitaDetalle = (e: EstadoPunto | null) => e === 'atencion' || e === 'urgente';

/** Texto libre del mecánico: recortado, sin saltos de línea sobrantes; vacío → null; demasiado largo → undefined (error). */
export function limpiarTexto(v: unknown, max: number): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t === '') return null;
  return t.length > max ? undefined : t;
}

// ---- Fotos ----

const EXT_POR_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
export const extensionDeMime = (mime: unknown): string | null => (typeof mime === 'string' ? EXT_POR_MIME[mime] ?? null : null);

const ID_SEGURO = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Ruta nueva en el bucket: «<empresa>/<inspección>/<uuid>.<ext>». Lanza si algún id no es seguro. */
export function nuevaRutaFoto(empresaId: string, inspeccionId: string, uuid: string, ext: string): string {
  if (!ID_SEGURO.test(empresaId) || !ID_SEGURO.test(inspeccionId) || !UUID.test(uuid) || !/^(jpg|png|webp|heic)$/.test(ext)) {
    throw new Error('Datos de foto no válidos.');
  }
  return `${empresaId}/${inspeccionId}/${uuid}.${ext}`;
}

/** ¿La ruta es de ESTA inspección? Evita registrar o borrar archivos de otra empresa o de otra inspección. */
export function rutaFotoValida(ruta: unknown, empresaId: string, inspeccionId: string): ruta is string {
  if (typeof ruta !== 'string' || ruta.length > 200) return false;
  const m = ruta.match(/^([^/]+)\/([^/]+)\/([^/]+)\.(jpg|png|webp|heic)$/);
  return !!m && m[1] === empresaId && m[2] === inspeccionId && UUID.test(m[3]);
}

/** ¿Cabe otra foto en este punto y en la inspección? Devuelve el motivo si no. */
export function motivoSinHuecoFoto(fotosDelPunto: number, fotosDeLaInspeccion: number): string | null {
  if (fotosDelPunto >= MAX_FOTOS_PUNTO) return `Cada punto admite como máximo ${MAX_FOTOS_PUNTO} fotos.`;
  if (fotosDeLaInspeccion >= MAX_FOTOS_INSPECCION) return `Una inspección admite como máximo ${MAX_FOTOS_INSPECCION} fotos.`;
  return null;
}

/** Ruta de Storage a partir de la URL pública de una foto de recepción (null si no es de ese bucket). */
export function rutaDeUrlPublica(url: unknown, bucket: string): string | null {
  if (typeof url !== 'string') return null;
  const marca = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marca);
  if (i < 0) return null;
  const ruta = decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
  return ruta && !ruta.includes('..') && !ruta.startsWith('/') ? ruta : null;
}

// ---- Resumen y presupuesto ----

export interface PuntoResumen { estado: EstadoPunto | null; precio: number | null }

export function resumenPuntos(puntos: PuntoResumen[]) {
  const r = { bien: 0, atencion: 0, urgente: 0, no_aplica: 0, sinMarcar: 0, total: puntos.length };
  for (const p of puntos) { if (p.estado) r[p.estado]++; else r.sinMarcar++; }
  return r;
}

/** ¿Puede el mecánico dar la inspección por terminada? Hace falta haber marcado al menos un punto. */
export const puedeTerminar = (puntos: PuntoResumen[]) => puntos.some((p) => p.estado !== null);

/**
 * Puntos «urgentes» sin precio: bloquean el envío al cliente (hay que decirle cuánto cuesta lo urgente).
 * Los de «atención» pueden ir sin precio: son avisos para más adelante.
 */
export function faltanPrecios(puntos: PuntoResumen[]): number {
  return puntos.filter((p) => p.estado === 'urgente' && !(p.precio !== null && p.precio > 0)).length;
}
