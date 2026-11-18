// Cálculos y reglas de las compras. Replican EXACTAMENTE lo que hace el servidor al guardar (guardar_compra), para que lo que se
// ve en el formulario sea lo que queda guardado: cada línea = redondeo(cantidad × precio) y el IVA se calcula sobre la BASE de cada
// tipo (la suma de las líneas con ese IVA), como en una factura, redondeando la mitad hacia arriba. Todo en enteros (céntimos) para
// no arrastrar errores de coma flotante.
import type { Compra } from '../types';

/** Hoy, «AAAA-MM-DD», en la hora local del navegador (la del taller). */
export const hoyIso = (d: Date = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const aEntero = (n: number, escala: number) => Math.round((Number.isFinite(n) ? n : 0) * escala);

/** Céntimos del subtotal de una línea: cantidad (2 decimales) × precio (2 decimales), media hacia arriba. */
export function subtotalCent(cantidad: number, precio: number): number {
  const q = aEntero(cantidad, 100), p = aEntero(precio, 100);
  return Math.floor((q * p + 50) / 100);
}
/** Céntimos de la cuota de IVA de una base (en céntimos), con el IVA en % (hasta 2 decimales). */
export function cuotaCent(baseCentimos: number, ivaPct: number): number {
  const i = aEntero(ivaPct, 100);
  return Math.floor((baseCentimos * i + 5000) / 10000);
}

export interface LineaEntrada { cantidad: number; precioUnitario: number; ivaPct: number }
export interface TotalesCompra {
  /** Subtotal (sin IVA) de cada línea, en el mismo orden. */
  subtotales: number[];
  base: number; iva: number; total: number;
  /** Por tipo de IVA (de mayor a menor): base y cuota. */
  porIva: { ivaPct: number; base: number; cuota: number }[];
}

export function calcularCompra(lineas: LineaEntrada[]): TotalesCompra {
  const subs = lineas.map((l) => subtotalCent(l.cantidad, l.precioUnitario));
  const por = new Map<number, number>();
  lineas.forEach((l, i) => { const k = aEntero(l.ivaPct, 100) / 100; por.set(k, (por.get(k) ?? 0) + subs[i]); });
  const grupos = [...por.entries()].sort((a, b) => b[0] - a[0]).map(([ivaPct, base]) => ({ ivaPct, base, cuota: cuotaCent(base, ivaPct) }));
  const base = subs.reduce((s, c) => s + c, 0);
  const iva = grupos.reduce((s, g) => s + g.cuota, 0);
  return {
    subtotales: subs.map((c) => c / 100),
    base: base / 100, iva: iva / 100, total: (base + iva) / 100,
    porIva: grupos.map((g) => ({ ivaPct: g.ivaPct, base: g.base / 100, cuota: g.cuota / 100 })),
  };
}

export const TIPOS_IVA = [21, 10, 4, 0] as const;

/** Suma días a una fecha «AAAA-MM-DD» sin pasar por la zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + dias));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}
/** Vencimiento sugerido: la fecha de la factura más los días de pago del proveedor (null si el proveedor paga al contado). */
export const vencimientoSugerido = (fecha: string, diasPago: number): string | null => (diasPago > 0 ? sumarDias(fecha, diasPago) : null);

export type EstadoVisible = 'pendiente' | 'vencida' | 'pagada' | 'anulada';
/** «Vencida» no es un estado guardado: es una pendiente cuyo vencimiento ya pasó. */
export function estadoVisible(c: Pick<Compra, 'estado' | 'fechaVencimiento'>, hoy: string): EstadoVisible {
  if (c.estado === 'pendiente' && c.fechaVencimiento && c.fechaVencimiento < hoy) return 'vencida';
  return c.estado;
}

export interface ResumenPagos { pendiente: number; vencido: number; cuantasPendientes: number; cuantasVencidas: number }
/** Lo que se debe a proveedores: pendientes (incluye las vencidas) y, de ellas, las vencidas. Las anuladas y pagadas no cuentan. */
export function resumenPagos(compras: Pick<Compra, 'estado' | 'fechaVencimiento' | 'total'>[], hoy: string): ResumenPagos {
  let pendiente = 0, vencido = 0, np = 0, nv = 0;
  for (const c of compras) {
    if (c.estado !== 'pendiente') continue;
    const t = Math.round(c.total * 100);
    pendiente += t; np++;
    if (estadoVisible(c, hoy) === 'vencida') { vencido += t; nv++; }
  }
  return { pendiente: pendiente / 100, vencido: vencido / 100, cuantasPendientes: np, cuantasVencidas: nv };
}

export interface FormCompraBasico {
  proveedorId: string; numero: string; fecha: string; fechaVencimiento: string;
  pagada: boolean; fechaPago: string;
  lineas: { productoId: string; descripcion: string; cantidad: number; precioUnitario: number; ivaPct: number }[];
}
/** Primer problema del formulario, en palabras del taller; null si se puede guardar. El servidor vuelve a comprobarlo todo. */
export function validarCompra(f: FormCompraBasico, hoy: string): string | null {
  if (!f.proveedorId) return 'Elige el proveedor.';
  if (!f.numero.trim()) return 'Escribe el número de la factura del proveedor.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return 'Indica la fecha de la factura.';
  if (f.fecha > sumarDias(hoy, 2)) return 'La fecha de la factura no puede ser futura.';
  if (f.fechaVencimiento && f.fechaVencimiento < f.fecha) return 'El vencimiento no puede ser anterior a la fecha de la factura.';
  if (f.pagada && f.fechaPago && f.fechaPago < f.fecha) return 'La fecha de pago no puede ser anterior a la de la factura.';
  if (f.lineas.length === 0) return 'Añade al menos una línea.';
  for (const [i, l] of f.lineas.entries()) {
    const n = i + 1;
    if (!l.productoId && !l.descripcion.trim()) return `Línea ${n}: escribe una descripción o elige un producto.`;
    if (!(l.cantidad > 0)) return `Línea ${n}: la cantidad debe ser mayor que cero.`;
    if (!(l.precioUnitario >= 0)) return `Línea ${n}: el precio no puede ser negativo.`;
  }
  return null;
}

// ---------- Cuentas por pagar ----------

/** Días de aquí a una fecha «AAAA-MM-DD» (negativo si ya pasó). Sin zonas horarias: solo fechas del calendario. */
export function diasHasta(fecha: string, hoy: string): number {
  const f = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((f(fecha) - f(hoy)) / 86400000);
}

/** «Vencida hace 5 días», «Vence hoy», «Vence mañana», «Vence en 3 días». */
export function etiquetaVencimiento(vencimiento: string | undefined, hoy: string): string {
  if (!vencimiento) return 'Sin fecha de vencimiento';
  const d = diasHasta(vencimiento, hoy);
  if (d < 0) return d === -1 ? 'Vencida ayer' : `Vencida hace ${-d} días`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Vence en ${d} días`;
}

export type ClaveGrupoPago = 'vencidas' | 'semana' | 'proximas' | 'sinFecha';
export interface GrupoPago<T> { clave: ClaveGrupoPago; titulo: string; compras: T[]; total: number }
type PorPagar = Pick<Compra, 'estado' | 'fechaVencimiento' | 'total'>;

/** Pendientes agrupadas por urgencia (vencidas, esta semana, próximas, sin fecha); dentro de cada grupo, la que vence antes arriba. Grupos vacíos fuera. */
export function agruparPorPagar<T extends PorPagar>(compras: T[], hoy: string): GrupoPago<T>[] {
  const grupos: Record<ClaveGrupoPago, T[]> = { vencidas: [], semana: [], proximas: [], sinFecha: [] };
  for (const c of compras) {
    if (c.estado !== 'pendiente') continue;
    if (!c.fechaVencimiento) { grupos.sinFecha.push(c); continue; }
    const d = diasHasta(c.fechaVencimiento, hoy);
    (d < 0 ? grupos.vencidas : d <= 7 ? grupos.semana : grupos.proximas).push(c);
  }
  const titulos: Record<ClaveGrupoPago, string> = { vencidas: 'Vencidas', semana: 'Vencen en los próximos 7 días', proximas: 'Más adelante', sinFecha: 'Sin fecha de vencimiento' };
  return (['vencidas', 'semana', 'proximas', 'sinFecha'] as const)
    .filter((k) => grupos[k].length > 0)
    .map((k) => ({
      clave: k, titulo: titulos[k],
      compras: grupos[k].sort((a, b) => (a.fechaVencimiento ?? '9999').localeCompare(b.fechaVencimiento ?? '9999')),
      total: grupos[k].reduce((s, c) => s + Math.round(c.total * 100), 0) / 100,
    }));
}

export interface DeudaProveedor { proveedorId: string; nombre: string; facturas: number; total: number; vencido: number }
/** Lo que se debe a cada proveedor (pendientes), de más a menos, con la parte vencida. */
export function deudaPorProveedor(compras: (PorPagar & Pick<Compra, 'proveedorId' | 'proveedorNombre'>)[], hoy: string): DeudaProveedor[] {
  const por = new Map<string, { nombre: string; n: number; t: number; v: number }>();
  for (const c of compras) {
    if (c.estado !== 'pendiente') continue;
    const a = por.get(c.proveedorId) ?? { nombre: c.proveedorNombre, n: 0, t: 0, v: 0 };
    const t = Math.round(c.total * 100);
    a.n++; a.t += t;
    if (c.fechaVencimiento && diasHasta(c.fechaVencimiento, hoy) < 0) a.v += t;
    por.set(c.proveedorId, a);
  }
  return [...por.entries()].map(([proveedorId, a]) => ({ proveedorId, nombre: a.nombre, facturas: a.n, total: a.t / 100, vencido: a.v / 100 }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));
}

export interface AvisoPagos { vencidas: { n: number; importe: number }; semana: { n: number; importe: number }; hay: boolean }
/** Lo que merece un aviso: lo ya vencido y lo que vence en los próximos 7 días (hoy incluido). */
export function avisoPagos(compras: PorPagar[], hoy: string): AvisoPagos {
  const v = { n: 0, c: 0 }, s = { n: 0, c: 0 };
  for (const c of compras) {
    if (c.estado !== 'pendiente' || !c.fechaVencimiento) continue;
    const d = diasHasta(c.fechaVencimiento, hoy);
    const t = Math.round(c.total * 100);
    if (d < 0) { v.n++; v.c += t; } else if (d <= 7) { s.n++; s.c += t; }
  }
  return { vencidas: { n: v.n, importe: v.c / 100 }, semana: { n: s.n, importe: s.c / 100 }, hay: v.n + s.n > 0 };
}
