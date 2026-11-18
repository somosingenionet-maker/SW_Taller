// ZIP con las facturas de proveedor (PDF o fotos) de un periodo, para pasárselo a la gestoría junto con el libro de IVA.
// Aquí solo la parte pura: qué entra, cómo se llama cada archivo y qué dice el índice. Descargar y comprimir va en otro sitio.
import { fmt2 } from './moneda';
import { extensionDeTipo } from './adjuntos';
import { formatoEs, type CompraParaGestoria, type Periodo } from './gestoria';

/** Por encima de esto no se intenta en un solo ZIP (todo se arma en la memoria del navegador): se pide un periodo más corto. */
export const MAX_BYTES_ZIP = 400 * 1024 * 1024;

export interface EntradaZip {
  /** Ruta dentro del almacenamiento (de dónde se lee). */
  ruta: string;
  /** Nombre dentro del ZIP, único y sin caracteres raros: «2026-07-05_Recambios-Ruiz_F-1.pdf». */
  nombre: string;
  tamano: number;
  fecha: string; proveedor: string; nif: string; numero: string; total: number; estado: string;
  /** Nombre con el que el taller subió el archivo. */
  nombreOriginal: string;
}

export interface PlanDocumentos {
  entradas: EntradaZip[];
  bytes: number;
  /** Facturas distintas que tienen al menos un archivo. */
  facturasConDocumento: number;
  /** Facturas del periodo (no anuladas) que NO tienen ningún archivo: lo que la gestoría va a reclamar. */
  sinDocumento: string[];
  /** Compras anuladas que se dejaron fuera aunque tuvieran archivos. */
  anuladasOmitidas: number;
  demasiadoGrande: boolean;
}

/** «Recambios Ruiz, S.L.» → «Recambios-Ruiz-S-L». Sin acentos, sin símbolos, con un máximo de longitud. */
export function limpiarParaNombre(texto: string, max = 40): string {
  const s = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
  return s || 'sin-nombre';
}

/** Extensión del archivo: la de su tipo si es de los permitidos, y si no la de su ruta. */
function extensionDe(tipo: string, ruta: string): string {
  const porTipo = extensionDeTipo(tipo);
  if (porTipo !== 'bin') return porTipo;
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(ruta);
  return m ? m[1].toLowerCase() : 'bin';
}

/**
 * Decide qué archivos entran y cómo se llaman. Se dejan fuera las compras anuladas. Si una compra tiene varios archivos se numeran
 * (`…_F-1_1.pdf`, `…_F-1_2.jpg`); si dos facturas dieran el mismo nombre se desempata con un número, sin pisar ninguna.
 */
export function planificarDocumentos(compras: CompraParaGestoria[]): PlanDocumentos {
  const vivas = compras.filter((c) => c.estado !== 'anulada');
  const entradas: EntradaZip[] = [];
  const usados = new Set<string>();
  const sinDocumento: string[] = [];
  let facturasConDocumento = 0;
  for (const c of [...vivas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proveedorNombre.localeCompare(b.proveedorNombre, 'es') || a.numero.localeCompare(b.numero, 'es', { numeric: true }))) {
    const adj = c.adjuntos ?? [];
    if (adj.length === 0) { sinDocumento.push(`${c.proveedorNombre} ${c.numero}`); continue; }
    facturasConDocumento++;
    const base = `${c.fecha}_${limpiarParaNombre(c.proveedorNombre, 30)}_${limpiarParaNombre(c.numero, 30)}`;
    adj.forEach((a, i) => {
      const ext = extensionDe(a.tipo, a.ruta);
      const sufijo = adj.length > 1 ? `_${i + 1}` : '';
      let nombre = `${base}${sufijo}.${ext}`;
      for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base}${sufijo}-${n}.${ext}`;
      usados.add(nombre.toLowerCase());
      entradas.push({ ruta: a.ruta, nombre, tamano: a.tamano, fecha: c.fecha, proveedor: c.proveedorNombre.trim(), nif: c.proveedorNif.trim(), numero: c.numero, total: c.total, estado: c.estado === 'pagada' ? 'Pagada' : 'Pendiente', nombreOriginal: a.nombre });
    });
  }
  const bytes = entradas.reduce((s, e) => s + e.tamano, 0);
  return {
    entradas, bytes, facturasConDocumento, sinDocumento,
    anuladasOmitidas: compras.filter((c) => c.estado === 'anulada' && (c.adjuntos ?? []).length > 0).length,
    demasiadoGrande: bytes > MAX_BYTES_ZIP,
  };
}

/** Filas del índice (CSV): una por archivo, para que la gestoría sepa qué es cada documento sin abrirlo. */
export function filasIndice(entradas: EntradaZip[]): string[][] {
  return [
    ['Archivo', 'Fecha', 'Proveedor', 'NIF proveedor', 'Nº factura', 'Total (IVA incl.)', 'Estado', 'Nombre original'],
    ...entradas.map((e) => [e.nombre, formatoEs(e.fecha), e.proveedor, e.nif, e.numero, fmt2(e.total), e.estado, e.nombreOriginal]),
  ];
}

/** Texto de LEEME.txt: qué contiene el ZIP, de qué periodo y qué no se pudo incluir. */
export function textoLeeme(p: { periodo: Periodo; taller: string; generado: Date; incluidos: number; fallidos: string[]; sinDocumento: string[]; anuladasOmitidas: number }): string {
  const l = [
    `Facturas recibidas de ${p.taller}`,
    `Periodo: ${formatoEs(p.periodo.desde)} – ${formatoEs(p.periodo.ultimoDia)} (${p.periodo.etiqueta})`,
    `Generado el ${formatoEs(p.generado.toISOString().slice(0, 10))} con Doonty Motor`,
    '',
    `Archivos incluidos: ${p.incluidos}. El archivo «indice.csv» dice a qué factura corresponde cada uno.`,
    'Cada archivo se llama «fecha_proveedor_número de factura». Las compras anuladas no se incluyen.',
  ];
  if (p.anuladasOmitidas > 0) l.push(`Compras anuladas con archivos que se dejaron fuera: ${p.anuladasOmitidas}.`);
  if (p.sinDocumento.length > 0) l.push('', 'Facturas del periodo SIN documento adjunto:', ...p.sinDocumento.map((s) => `  - ${s}`));
  if (p.fallidos.length > 0) l.push('', 'NO se pudieron incluir (vuelve a intentarlo o descárgalos a mano desde Doonty):', ...p.fallidos.map((s) => `  - ${s}`));
  return l.join('\r\n') + '\r\n';
}

export function nombreZipDocumentos(p: Periodo, taller: string): string {
  return `doonty_facturas_recibidas_${p.clave}_${limpiarParaNombre(taller, 30)}.zip`;
}
