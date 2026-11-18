import { describe, expect, it } from 'vitest';
import { crc32, crearXlsx, crearZip, letraColumna, nombreDeHojaValido, numeroDeSerie } from './xlsx';

/** Lee un ZIP «almacenado» como lo haría un lector externo: por el directorio central, comprobando el CRC de cada archivo. */
function leerZip(bytes: Uint8Array): Record<string, string> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fin = bytes.length - 22;
  expect(v.getUint32(fin, true)).toBe(0x06054b50);
  const n = v.getUint16(fin + 10, true);
  let pos = v.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(pos, true)).toBe(0x02014b50);
    const crc = v.getUint32(pos + 16, true), tam = v.getUint32(pos + 20, true), ln = v.getUint16(pos + 28, true), desp = v.getUint32(pos + 42, true);
    const nombre = dec.decode(bytes.subarray(pos + 46, pos + 46 + ln));
    expect(v.getUint32(desp, true)).toBe(0x04034b50);
    const lnLocal = v.getUint16(desp + 26, true);
    const datos = bytes.subarray(desp + 30 + lnLocal, desp + 30 + lnLocal + tam);
    expect(crc32(datos)).toBe(crc);
    out[nombre] = dec.decode(datos);
    pos += 46 + ln;
  }
  return out;
}

describe('zip', () => {
  it('crc32 coincide con el valor conocido de «123456789»', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('se puede leer de vuelta con nombres y contenidos acentuados intactos', () => {
    const enc = new TextEncoder();
    const zip = crearZip([{ nombre: 'a.txt', contenido: enc.encode('Hola ñandú €') }, { nombre: 'dir/b.xml', contenido: enc.encode('<x/>') }]);
    expect(leerZip(zip)).toEqual({ 'a.txt': 'Hola ñandú €', 'dir/b.xml': '<x/>' });
  });
});

describe('xlsx', () => {
  it('letras de columna y fechas de Excel', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(letraColumna)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    expect(numeroDeSerie('1900-03-01')).toBe(61);          // el calendario de Excel cuenta desde el 30/12/1899
    expect(numeroDeSerie('2026-07-10')).toBe(46213);
  });
  it('nombres de hoja válidos para Excel', () => {
    expect(nombreDeHojaValido('Facturas/emitidas: [2026]?')).toBe('Facturas emitidas 2026');
    expect(nombreDeHojaValido('x'.repeat(50)).length).toBe(31);
    expect(nombreDeHojaValido('  ')).toBe('Hoja');
  });
  it('el libro tiene las partes obligatorias y el texto va escapado', () => {
    const archivos = leerZip(crearXlsx([
      { nombre: 'Datos', anchos: [10, 20], fijarFilas: 1, filtrosEnFila: 1, filas: [[{ valor: 'Cliente', estilo: 'cabecera' }, { valor: 'Importe', estilo: 'cabecera' }], ['Ruiz & <Hijos> "S.L."  ', { valor: 12.5, estilo: 'dinero' }], [{ fecha: '2026-07-10' }, null]] },
      { nombre: 'Otra', filas: [['x']] },
    ]));
    expect(Object.keys(archivos).sort()).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
    const hoja = archivos['xl/worksheets/sheet1.xml'];
    expect(hoja).toContain('Ruiz &amp; &lt;Hijos&gt; &quot;S.L.&quot;  ');      // espacios conservados
    expect(hoja).toContain('<c r="B2" s="3"><v>12.5</v></c>');
    expect(hoja).toContain('<c r="A3" s="5"><v>46213</v></c>');
    expect(hoja).toContain('<autoFilter ref="A1:B3"/>');
    expect(hoja).toContain('state="frozen"');
    expect(archivos['xl/workbook.xml']).toContain('<sheet name="Datos" sheetId="1" r:id="rId1"/>');
    expect(archivos['xl/workbook.xml']).toContain('<sheet name="Otra" sheetId="2" r:id="rId2"/>');
    expect(archivos['xl/_rels/workbook.xml.rels']).toContain('Target="styles.xml"');
  });
  it('quita caracteres de control que romperían el XML y no escribe celdas vacías ni números no finitos', () => {
    const hoja = leerZip(crearXlsx([{ nombre: 'H', filas: [['a\u0001b', null, '', NaN, Infinity]] }]))['xl/worksheets/sheet1.xml'];
    expect(hoja).toContain('>ab<');
    expect(hoja.match(/<c /g)?.length).toBe(1);
  });
});
