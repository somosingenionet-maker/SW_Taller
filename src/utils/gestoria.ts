// Exportación para la gestoría: libro de facturas emitidas de un periodo (para el IVA trimestral) y su resumen por tipo
// de IVA. Funciones puras y probadas; la lectura de datos y la descarga están fuera.
import { fmt2 } from './moneda';
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

/** Base, cuota y total por tipo de IVA, SIN las anuladas (no cuentan para el IVA del periodo). */
export function resumenIva(filas: FilaLibro[]): ResumenIva {
  const por = new Map<number, { f: number; b: number; c: number; t: number }>();
  for (const x of filas) {
    if (x.anulada) continue;
    const a = por.get(x.ivaPct) ?? { f: 0, b: 0, c: 0, t: 0 };
    a.f += 1; a.b += cent(x.base); a.c += cent(x.cuota); a.t += cent(x.total);
    por.set(x.ivaPct, a);
  }
  const lineas = [...por.entries()].sort((a, b) => b[0] - a[0]).map(([ivaPct, a]) => ({ ivaPct, facturas: a.f, base: deCent(a.b), cuota: deCent(a.c), total: deCent(a.t) }));
  const t = lineas.reduce((s, l) => ({ facturas: s.facturas + l.facturas, base: s.base + cent(l.base), cuota: s.cuota + cent(l.cuota), total: s.total + cent(l.total) }), { facturas: 0, base: 0, cuota: 0, total: 0 });
  return { lineas, totales: { facturas: t.facturas, base: deCent(t.base), cuota: deCent(t.cuota), total: deCent(t.total) } };
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

export interface DatosTaller { nombre: string; nif: string }

/** Libro de Excel: hoja «Facturas emitidas» (una fila por factura, con filtros) y hoja «Resumen IVA». */
export function hojasExcel(filas: FilaLibro[], periodo: Periodo, taller: DatosTaller, generado: Date = new Date()): Hoja[] {
  const r = resumenIva(filas);
  const av = avisosLibro(filas);
  const dinero = (v: number, negrita = false): Celda => ({ valor: v, estilo: negrita ? 'dineroNegrita' : 'dinero' });
  const libro: Hoja = {
    nombre: 'Facturas emitidas',
    anchos: [18, 12, 34, 18, 16, 8, 14, 14, 11],
    fijarFilas: 1, filtrosEnFila: 1,
    filas: [
      CABECERA_LIBRO.map((c) => ({ valor: c, estilo: 'cabecera' as const })),
      ...filas.map((f): Celda[] => [f.numero, { fecha: f.fecha }, f.cliente, f.nif, dinero(f.base), f.ivaPct, dinero(f.cuota), dinero(f.total), f.estado]),
      [],
      [{ valor: 'TOTAL (sin anuladas)', estilo: 'negrita' }, null, null, null, dinero(r.totales.base, true), null, dinero(r.totales.cuota, true), dinero(r.totales.total, true), null],
    ],
  };
  const nota = (t: string): Celda[] => [{ valor: t, estilo: 'normal' }];
  const resumen: Hoja = {
    nombre: 'Resumen IVA',
    anchos: [26, 14, 18, 16, 16],
    filas: [
      [{ valor: `Facturas emitidas — ${periodo.etiqueta}`, estilo: 'titulo' }],
      [{ valor: 'Taller', estilo: 'negrita' }, taller.nombre],
      [{ valor: 'NIF', estilo: 'negrita' }, taller.nif],
      [{ valor: 'Periodo', estilo: 'negrita' }, `${formatoEs(periodo.desde)} – ${formatoEs(periodo.ultimoDia)}`],
      [{ valor: 'Generado', estilo: 'negrita' }, `${formatoEs(generado.toISOString().slice(0, 10))}`],
      [],
      ['Tipo de IVA', 'Facturas', 'Base imponible', 'Cuota IVA', 'Total'].map((c) => ({ valor: c, estilo: 'cabecera' as const })),
      ...r.lineas.map((l): Celda[] => [`${String(l.ivaPct).replace('.', ',')} %`, l.facturas, dinero(l.base), dinero(l.cuota), dinero(l.total)]),
      [{ valor: 'TOTAL', estilo: 'negrita' }, { valor: r.totales.facturas, estilo: 'negrita' }, dinero(r.totales.base, true), dinero(r.totales.cuota, true), dinero(r.totales.total, true)],
      [],
      nota('Las facturas anuladas aparecen en la hoja «Facturas emitidas» (conservan su número) pero no suman en este resumen.'),
      nota('Los borradores no se incluyen: solo cuentan las facturas ya emitidas.'),
      ...(av.anuladas ? [nota(`Facturas anuladas en el periodo: ${av.anuladas}.`)] : []),
      ...(av.sinNif.length ? [nota(`Facturas cuyo cliente no tiene NIF: ${av.sinNif.join(', ')}.`)] : []),
    ],
  };
  return [libro, resumen];
}

/** Nombre del archivo: «doonty_facturas_gestoria_2026-T3_Taller_Ejemplo.xlsx». */
export function nombreArchivoGestoria(p: Periodo, taller: string, extension: 'xlsx' | 'csv'): string {
  const limpio = taller.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  return `doonty_facturas_gestoria_${p.clave}${limpio ? `_${limpio}` : ''}.${extension}`;
}
