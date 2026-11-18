// Exportación para la gestoría: libro de facturas emitidas de un periodo (para el IVA trimestral) y su resumen por tipo
// de IVA. Funciones puras y probadas; la lectura de datos y la descarga están fuera.
import { fmt2 } from './moneda';
import { cuotaCent } from './compras';
import type { Celda, Hoja } from './xlsx';

// ---------- Periodos ----------

export interface Periodo {
  /** Primer día, «AAAA-MM-DD». */
  desde: string;
  /** Primer día DESPUÉS del periodo (excluido): así el filtro `fecha < hasta` no depende de cuántos días tenga el mes. */
  hasta: string;
  /** Último día del periodo (incluido), para mostrar. */
  ultimoDia: string;
  etiqueta: string;
  /** Para el nombre del archivo: «2026-T3», «2026-09», «2026». */
  clave: string;
}

const dos = (n: number) => String(n).padStart(2, '0');
const fechaIso = (y: number, m: number, d: number) => `${y}-${dos(m)}-${dos(d)}`;
/** Suma `n` días a una fecha «AAAA-MM-DD» sin pasar por la zona horaria. */
export function sumarDiasIso(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return fechaIso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate());
}
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ordinal = ['1.er', '2.º', '3.er', '4.º'];

function periodo(desde: string, hasta: string, etiqueta: string, clave: string): Periodo {
  return { desde, hasta, ultimoDia: sumarDiasIso(hasta, -1), etiqueta, clave };
}
export function periodoTrimestre(año: number, trimestre: 1 | 2 | 3 | 4): Periodo {
  const m0 = (trimestre - 1) * 3 + 1;
  const hasta = trimestre === 4 ? fechaIso(año + 1, 1, 1) : fechaIso(año, m0 + 3, 1);
  return periodo(fechaIso(año, m0, 1), hasta, `${ordinal[trimestre - 1]} trimestre de ${año}`, `${año}-T${trimestre}`);
}
export function periodoMes(año: number, mes: number): Periodo {
  const hasta = mes === 12 ? fechaIso(año + 1, 1, 1) : fechaIso(año, mes + 1, 1);
  return periodo(fechaIso(año, mes, 1), hasta, `${NOMBRES_MES[mes - 1]} de ${año}`, `${año}-${dos(mes)}`);
}
export function periodoAño(año: number): Periodo {
  return periodo(fechaIso(año, 1, 1), fechaIso(año + 1, 1, 1), `año ${año}`, `${año}`);
}
const reFecha = /^\d{4}-\d{2}-\d{2}$/;
/** Entre dos fechas, ambas incluidas. null si alguna no es válida o van al revés. */
export function periodoRango(desde: string, hastaIncluida: string): Periodo | null {
  if (!reFecha.test(desde) || !reFecha.test(hastaIncluida) || desde > hastaIncluida) return null;
  return periodo(desde, sumarDiasIso(hastaIncluida, 1), `del ${formatoEs(desde)} al ${formatoEs(hastaIncluida)}`, `${desde}_${hastaIncluida}`);
}
/** El trimestre natural anterior al día dado (lo que suele pedir la gestoría). */
export function trimestreAnterior(hoy: Date): Periodo {
  const t = Math.floor(hoy.getMonth() / 3) + 1;
  return t === 1 ? periodoTrimestre(hoy.getFullYear() - 1, 4) : periodoTrimestre(hoy.getFullYear(), (t - 1) as 1 | 2 | 3);
}
export const formatoEs = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

// ---------- Libro de facturas emitidas ----------

export interface FacturaParaGestoria {
  numero: string; fecha: string; estado: 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'cancelada';
  subtotal: number; ivaPct: number; totalIva: number; total: number;
  clienteNombre: string; clienteNif: string;
}

export interface FilaLibro {
  numero: string; fecha: string; cliente: string; nif: string;
  base: number; ivaPct: number; cuota: number; total: number;
  estado: 'Emitida' | 'Pagada' | 'Vencida' | 'Anulada';
  anulada: boolean;
}

const ESTADO_TEXTO: Record<Exclude<FacturaParaGestoria['estado'], 'borrador'>, FilaLibro['estado']> = { emitida: 'Emitida', pagada: 'Pagada', vencida: 'Vencida', cancelada: 'Anulada' };
const cent = (n: number) => Math.round(n * 100);
const deCent = (c: number) => c / 100;

/** Las facturas que van al libro: todas las emitidas (también anuladas, que conservan su número) y nunca los borradores. */
export function filasLibro(facturas: FacturaParaGestoria[]): FilaLibro[] {
  return facturas
    .filter((f) => f.estado !== 'borrador')
    .map((f): FilaLibro => ({
      numero: f.numero, fecha: f.fecha, cliente: f.clienteNombre.trim(), nif: f.clienteNif.trim(),
      base: deCent(cent(f.subtotal)), ivaPct: f.ivaPct, cuota: deCent(cent(f.totalIva)), total: deCent(cent(f.total)),
      estado: ESTADO_TEXTO[f.estado as Exclude<FacturaParaGestoria['estado'], 'borrador'>], anulada: f.estado === 'cancelada',
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
}

export interface LineaResumenIva { ivaPct: number; facturas: number; base: number; cuota: number; total: number }
export interface ResumenIva { lineas: LineaResumenIva[]; totales: Omit<LineaResumenIva, 'ivaPct'> }
/** Lo que hace falta de una fila para resumir su IVA: sirve para facturas emitidas y para recibidas. `clave` identifica la factura (una recibida con dos tipos de IVA ocupa dos filas). */
export type FilaIva = Pick<FilaLibro, 'anulada' | 'ivaPct' | 'base' | 'cuota' | 'total'> & { clave?: string; numero?: string };

/** Base, cuota y total por tipo de IVA, SIN las anuladas (no cuentan para el IVA del periodo). */
export function resumenIva(filas: FilaIva[]): ResumenIva {
  const por = new Map<number, { f: Set<string>; b: number; c: number; t: number }>();
  const todas = new Set<string>();
  filas.forEach((x, i) => {
    if (x.anulada) return;
    const clave = x.clave ?? x.numero ?? String(i);
    const a = por.get(x.ivaPct) ?? { f: new Set<string>(), b: 0, c: 0, t: 0 };
    a.f.add(clave); a.b += cent(x.base); a.c += cent(x.cuota); a.t += cent(x.total);
    por.set(x.ivaPct, a);
    todas.add(clave);
  });
  const lineas = [...por.entries()].sort((a, b) => b[0] - a[0]).map(([ivaPct, a]) => ({ ivaPct, facturas: a.f.size, base: deCent(a.b), cuota: deCent(a.c), total: deCent(a.t) }));
  const t = lineas.reduce((s, l) => ({ base: s.base + cent(l.base), cuota: s.cuota + cent(l.cuota), total: s.total + cent(l.total) }), { base: 0, cuota: 0, total: 0 });
  return { lineas, totales: { facturas: todas.size, base: deCent(t.base), cuota: deCent(t.cuota), total: deCent(t.total) } };
}

export interface AvisosLibro {
  /** Facturas (no anuladas) cuyo cliente no tiene NIF: la gestoría las va a reclamar. */
  sinNif: string[];
  anuladas: number;
  /** Facturas en las que base + cuota no cuadra con el total (más de 1 céntimo). */
  descuadradas: string[];
}
export function avisosLibro(filas: FilaLibro[]): AvisosLibro {
  return {
    sinNif: filas.filter((f) => !f.anulada && f.nif === '').map((f) => f.numero),
    anuladas: filas.filter((f) => f.anulada).length,
    descuadradas: filas.filter((f) => Math.abs(cent(f.base) + cent(f.cuota) - cent(f.total)) > 1).map((f) => f.numero),
  };
}

// ---------- Libro de facturas recibidas (compras) ----------

export interface CompraParaGestoria {
  numero: string; fecha: string; estado: 'pendiente' | 'pagada' | 'anulada';
  proveedorNombre: string; proveedorNif: string;
  lineas: { subtotal: number; ivaPct: number }[];
  /** Total guardado de la compra, para comprobar que las filas cuadran con él. */
  total: number;
}

export interface FilaRecibida {
  numero: string; fecha: string; proveedor: string; nif: string;
  base: number; ivaPct: number; cuota: number; total: number;
  estado: 'Pendiente' | 'Pagada' | 'Anulada';
  anulada: boolean;
  /** Identifica la factura: una con dos tipos de IVA ocupa dos filas. */
  clave: string;
}

const ESTADO_COMPRA: Record<CompraParaGestoria['estado'], FilaRecibida['estado']> = { pendiente: 'Pendiente', pagada: 'Pagada', anulada: 'Anulada' };

/**
 * Una fila por factura y tipo de IVA (si una factura mezcla 21 % y 10 %, sale en dos filas con el mismo número). La cuota se
 * calcula sobre la base de cada tipo, igual que al guardar la compra. Las anuladas salen marcadas y no suman.
 */
export function filasRecibidas(compras: CompraParaGestoria[]): FilaRecibida[] {
  const filas: FilaRecibida[] = [];
  for (const c of compras) {
    const porTipo = new Map<number, number>();
    for (const l of c.lineas) porTipo.set(l.ivaPct, (porTipo.get(l.ivaPct) ?? 0) + cent(l.subtotal));
    const clave = `${c.proveedorNif || c.proveedorNombre}|${c.numero}|${c.fecha}`;
    const tipos = [...porTipo.entries()].sort((a, b) => b[0] - a[0]);
    for (const [ivaPct, base] of tipos) {
      const cuota = cuotaCent(base, ivaPct);
      filas.push({
        numero: c.numero, fecha: c.fecha, proveedor: c.proveedorNombre.trim(), nif: c.proveedorNif.trim(),
        base: deCent(base), ivaPct, cuota: deCent(cuota), total: deCent(base + cuota),
        estado: ESTADO_COMPRA[c.estado], anulada: c.estado === 'anulada', clave,
      });
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proveedor.localeCompare(b.proveedor, 'es') || a.numero.localeCompare(b.numero, 'es', { numeric: true }));
}

export interface AvisosRecibidas { sinNif: string[]; anuladas: number; descuadradas: string[] }
export function avisosRecibidas(compras: CompraParaGestoria[], filas: FilaRecibida[]): AvisosRecibidas {
  const sinNif = new Set<string>();
  for (const c of compras) if (c.estado !== 'anulada' && c.proveedorNif.trim() === '') sinNif.add(c.proveedorNombre.trim());
  const suma = new Map<string, number>();
  for (const f of filas) suma.set(f.clave, (suma.get(f.clave) ?? 0) + cent(f.total));
  const descuadradas = compras
    .filter((c) => c.estado !== 'anulada' && Math.abs((suma.get(`${c.proveedorNif || c.proveedorNombre}|${c.numero}|${c.fecha}`) ?? 0) - cent(c.total)) > 1)
    .map((c) => `${c.proveedorNombre} ${c.numero}`);
  return { sinNif: [...sinNif], anuladas: new Set(filas.filter((f) => f.anulada).map((f) => f.clave)).size, descuadradas };
}

// ---------- Salidas: CSV y Excel ----------

export const CABECERA_LIBRO = ['Nº factura', 'Fecha', 'Cliente', 'NIF/NIE/Pasaporte', 'Base imponible', '% IVA', 'Cuota IVA', 'Total', 'Estado'];

/** CSV (cada celda entrecomillada, «;» y coma decimal: se abre bien en Excel en español). Termina con los totales sin anuladas. */
export function csvLibro(filas: FilaLibro[]): string[][] {
  const r = resumenIva(filas);
  return [
    CABECERA_LIBRO,
    ...filas.map((f) => [f.numero, formatoEs(f.fecha), f.cliente, f.nif, fmt2(f.base), String(f.ivaPct).replace('.', ','), fmt2(f.cuota), fmt2(f.total), f.estado]),
    [],
    ['TOTAL (sin anuladas)', '', '', '', fmt2(r.totales.base), '', fmt2(r.totales.cuota), fmt2(r.totales.total), ''],
  ];
}

export const CABECERA_RECIBIDAS = ['Nº factura', 'Fecha', 'Proveedor', 'NIF proveedor', 'Base imponible', '% IVA', 'Cuota IVA', 'Total', 'Estado'];

/** CSV de las facturas recibidas; los totales no incluyen las anuladas. */
export function csvRecibidas(filas: FilaRecibida[]): string[][] {
  const r = resumenIva(filas);
  return [
    CABECERA_RECIBIDAS,
    ...filas.map((f) => [f.numero, formatoEs(f.fecha), f.proveedor, f.nif, fmt2(f.base), String(f.ivaPct).replace('.', ','), fmt2(f.cuota), fmt2(f.total), f.estado]),
    [],
    ['TOTAL (sin anuladas)', '', '', '', fmt2(r.totales.base), '', fmt2(r.totales.cuota), fmt2(r.totales.total), ''],
  ];
}

export interface DatosTaller { nombre: string; nif: string }

export interface EntradaExcel { emitidas?: FilaLibro[]; recibidas?: FilaRecibida[]; periodo: Periodo; taller: DatosTaller; generado?: Date }

/**
 * Libro de Excel: «Facturas emitidas» y/o «Facturas recibidas» (una fila por factura, con filtros) y «Resumen IVA» con el IVA
 * repercutido (emitidas), el soportado (recibidas) y su diferencia. Cada hoja solo existe si se pidió esa parte.
 */
export function hojasExcel(e: EntradaExcel): Hoja[] {
  const { emitidas, recibidas, periodo, taller } = e;
  const generado = e.generado ?? new Date();
  const dinero = (v: number, negrita = false): Celda => ({ valor: v, estilo: negrita ? 'dineroNegrita' : 'dinero' });
  const cab = (cols: string[]) => cols.map((c) => ({ valor: c, estilo: 'cabecera' as const }));
  const nota = (t: string): Celda[] => [{ valor: t, estilo: 'normal' }];
  const hojas: Hoja[] = [];

  if (emitidas) {
    const r = resumenIva(emitidas);
    hojas.push({
      nombre: 'Facturas emitidas', anchos: [18, 12, 34, 18, 16, 8, 14, 14, 11], fijarFilas: 1, filtrosEnFila: 1,
      filas: [
        cab(CABECERA_LIBRO),
        ...emitidas.map((f): Celda[] => [f.numero, { fecha: f.fecha }, f.cliente, f.nif, dinero(f.base), f.ivaPct, dinero(f.cuota), dinero(f.total), f.estado]),
        [],
        [{ valor: 'TOTAL (sin anuladas)', estilo: 'negrita' }, null, null, null, dinero(r.totales.base, true), null, dinero(r.totales.cuota, true), dinero(r.totales.total, true), null],
      ],
    });
  }
  if (recibidas) {
    const r = resumenIva(recibidas);
    hojas.push({
      nombre: 'Facturas recibidas', anchos: [18, 12, 34, 18, 16, 8, 14, 14, 11], fijarFilas: 1, filtrosEnFila: 1,
      filas: [
        cab(CABECERA_RECIBIDAS),
        ...recibidas.map((f): Celda[] => [f.numero, { fecha: f.fecha }, f.proveedor, f.nif, dinero(f.base), f.ivaPct, dinero(f.cuota), dinero(f.total), f.estado]),
        [],
        [{ valor: 'TOTAL (sin anuladas)', estilo: 'negrita' }, null, null, null, dinero(r.totales.base, true), null, dinero(r.totales.cuota, true), dinero(r.totales.total, true), null],
      ],
    });
  }

  const bloqueIva = (titulo: string, r: ResumenIva): Celda[][] => [
    [{ valor: titulo, estilo: 'negrita' }],
    cab(['Tipo de IVA', 'Facturas', 'Base imponible', 'Cuota IVA', 'Total']),
    ...r.lineas.map((l): Celda[] => [`${String(l.ivaPct).replace('.', ',')} %`, l.facturas, dinero(l.base), dinero(l.cuota), dinero(l.total)]),
    [{ valor: 'TOTAL', estilo: 'negrita' }, { valor: r.totales.facturas, estilo: 'negrita' }, dinero(r.totales.base, true), dinero(r.totales.cuota, true), dinero(r.totales.total, true)],
    [],
  ];
  const re = emitidas ? resumenIva(emitidas) : null;
  const rr = recibidas ? resumenIva(recibidas) : null;
  const avE = emitidas ? avisosLibro(emitidas) : null;
  const filasResumen: Celda[][] = [
    [{ valor: `Facturas — ${periodo.etiqueta}`, estilo: 'titulo' }],
    [{ valor: 'Taller', estilo: 'negrita' }, taller.nombre],
    [{ valor: 'NIF', estilo: 'negrita' }, taller.nif],
    [{ valor: 'Periodo', estilo: 'negrita' }, `${formatoEs(periodo.desde)} – ${formatoEs(periodo.ultimoDia)}`],
    [{ valor: 'Generado', estilo: 'negrita' }, `${formatoEs(generado.toISOString().slice(0, 10))}`],
    [],
    ...(re ? bloqueIva('IVA repercutido (facturas emitidas)', re) : []),
    ...(rr ? bloqueIva('IVA soportado (facturas recibidas)', rr) : []),
    ...(re && rr ? [
      [{ valor: 'Repercutido − soportado', estilo: 'negrita' } as Celda, null, null, dinero(Math.round((re.totales.cuota - rr.totales.cuota) * 100) / 100, true)],
      nota('Orientativo: la deducibilidad del IVA soportado y los demás ajustes los decide tu gestoría.'),
      [] as Celda[],
    ] : []),
    nota('Las facturas anuladas aparecen en su hoja (conservan su número) pero no suman en este resumen.'),
    ...(emitidas ? [nota('Los borradores no se incluyen: solo cuentan las facturas ya emitidas.')] : []),
    ...(recibidas ? [nota('Una factura recibida con varios tipos de IVA ocupa una fila por tipo, con el mismo número.')] : []),
    ...(avE?.anuladas ? [nota(`Facturas emitidas anuladas en el periodo: ${avE.anuladas}.`)] : []),
    ...(avE?.sinNif.length ? [nota(`Facturas emitidas cuyo cliente no tiene NIF: ${avE.sinNif.join(', ')}.`)] : []),
  ];
  hojas.push({ nombre: 'Resumen IVA', anchos: [34, 14, 18, 16, 16], filas: filasResumen });
  return hojas;
}

/** Nombre del archivo: «doonty_facturas_gestoria_2026-T3_Taller_Ejemplo.xlsx». */
export function nombreArchivoGestoria(p: Periodo, taller: string, extension: 'xlsx' | 'csv'): string {
  const limpio = taller.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  return `doonty_facturas_gestoria_${p.clave}${limpio ? `_${limpio}` : ''}.${extension}`;
}
