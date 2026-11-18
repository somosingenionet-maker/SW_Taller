// Escritor mínimo de libros de Excel (.xlsx) sin dependencias: varias hojas, texto, números con formato de importe,
// fechas, negrita y cabecera con fondo. Un .xlsx es un ZIP de XML; aquí se escribe con la compresión «almacenar»
// (sin comprimir), que Excel, Numbers y LibreOffice abren sin problema y es lo bastante pequeño para un libro de facturas.

export type EstiloCelda = 'normal' | 'negrita' | 'cabecera' | 'dinero' | 'dineroNegrita' | 'fecha' | 'titulo';
export type Celda = string | number | null | { valor: string | number | null; estilo?: EstiloCelda } | { fecha: string; estilo?: EstiloCelda };

export interface Hoja {
  nombre: string;
  filas: Celda[][];
  /** Ancho de cada columna, en caracteres. */
  anchos?: number[];
  /** Fija las primeras N filas al desplazarse. */
  fijarFilas?: number;
  /** Activa los filtros de la fila indicada (1 = primera fila). */
  filtrosEnFila?: number;
}

// ---------- ZIP (método 0, sin comprimir) ----------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crearZip(archivos: { nombre: string; contenido: Uint8Array }[], ahora = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
  const dia = (Math.max(ahora.getFullYear() - 1980, 0) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let desplazamiento = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.contenido);
    const local = new Uint8Array(30 + nombre.length);
    const v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
    v.setUint16(10, hora, true); v.setUint16(12, dia, true); v.setUint32(14, crc, true);
    v.setUint32(18, a.contenido.length, true); v.setUint32(22, a.contenido.length, true); v.setUint16(26, nombre.length, true); v.setUint16(28, 0, true);
    local.set(nombre, 30);
    const central = new Uint8Array(46 + nombre.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, hora, true); c.setUint16(14, dia, true); c.setUint32(16, crc, true);
    c.setUint32(20, a.contenido.length, true); c.setUint32(24, a.contenido.length, true); c.setUint16(28, nombre.length, true);
    c.setUint32(42, desplazamiento, true);
    central.set(nombre, 46);
    locales.push(local, a.contenido);
    centrales.push(central);
    desplazamiento += local.length + a.contenido.length;
  }
  const tamCentral = centrales.reduce((s, x) => s + x.length, 0);
  const fin = new Uint8Array(22);
  const f = new DataView(fin.buffer);
  f.setUint32(0, 0x06054b50, true); f.setUint16(8, archivos.length, true); f.setUint16(10, archivos.length, true);
  f.setUint32(12, tamCentral, true); f.setUint32(16, desplazamiento, true);
  const total = new Uint8Array(desplazamiento + tamCentral + fin.length);
  let pos = 0;
  for (const parte of [...locales, ...centrales, fin]) { total.set(parte, pos); pos += parte.length; }
  return total;
}

// ---------- XML de la hoja de cálculo ----------

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  // Caracteres de control que XML 1.0 no admite
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function letraColumna(indice: number): string {
  let n = indice + 1; let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Días desde el 30/12/1899 (el «0» de Excel). */
export function numeroDeSerie(fecha: string): number {
  const [y, m, d] = fecha.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Índices de estilo en styles.xml (cellXfs)
const ESTILO: Record<EstiloCelda, number> = { normal: 0, negrita: 1, cabecera: 2, dinero: 3, dineroNegrita: 4, fecha: 5, titulo: 6 };

function xmlCelda(celda: Celda, ref: string): string {
  if (celda === null || celda === undefined || celda === '') return '';
  let valor: string | number | null; let estilo: EstiloCelda = 'normal'; let esFecha = false;
  if (typeof celda === 'object' && 'fecha' in celda) { valor = numeroDeSerie(celda.fecha); estilo = celda.estilo ?? 'fecha'; esFecha = true; }
  else if (typeof celda === 'object') { valor = celda.valor; estilo = celda.estilo ?? 'normal'; }
  else valor = celda;
  if (valor === null || valor === '') return estilo === 'normal' ? '' : `<c r="${ref}" s="${ESTILO[estilo]}"/>`;
  const s = ESTILO[estilo];
  if (typeof valor === 'number' || esFecha) {
    if (!Number.isFinite(valor as number)) return '';
    return `<c r="${ref}" s="${s}"><v>${valor}</v></c>`;
  }
  return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(String(valor))}</t></is></c>`;
}

function xmlHoja(h: Hoja): string {
  const filas = h.filas.map((fila, i) => {
    const celdas = fila.map((c, j) => xmlCelda(c, `${letraColumna(j)}${i + 1}`)).join('');
    return `<row r="${i + 1}">${celdas}</row>`;
  }).join('');
  const cols = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const vista = h.fijarFilas ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${h.fijarFilas}" topLeftCell="A${h.fijarFilas + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  const ancho = Math.max(...h.filas.map((f) => f.length), 1);
  const filtro = h.filtrosEnFila ? `<autoFilter ref="A${h.filtrosEnFila}:${letraColumna(ancho - 1)}${Math.max(h.filas.length, h.filtrosEnFila)}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${vista}${cols}<sheetData>${filas}</sheetData>${filtro}</worksheet>`;
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="left"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** Nombre de hoja válido en Excel: sin \ / ? * [ ] :, máximo 31 caracteres y no vacío. */
export const nombreDeHojaValido = (n: string) => (n.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja');

export function crearXlsx(hojas: Hoja[], ahora = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const nombres = hojas.map((h) => nombreDeHojaValido(h.nombre));
  const archivos = [
    { nombre: '[Content_Types].xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { nombre: '_rels/.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: 'xl/workbook.xml', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: 'xl/styles.xml', texto: ESTILOS_XML },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, texto: xmlHoja(h) })),
  ];
  return crearZip(archivos.map((a) => ({ nombre: a.nombre, contenido: enc.encode(a.texto) })), ahora);
}

/** Descarga un archivo ya generado (el navegador lo guarda con ese nombre). */
export function descargarBytes(nombreArchivo: string, bytes: Uint8Array, tipo: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga un libro de Excel ya generado. */
export const descargarXlsx = (nombreArchivo: string, bytes: Uint8Array): void =>
  descargarBytes(nombreArchivo, bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
