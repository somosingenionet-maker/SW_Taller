import { describe, expect, it } from 'vitest';
import {
  avisosLibro, csvLibro, filasLibro, hojasExcel, nombreArchivoGestoria, periodoAño, periodoMes, periodoRango, periodoTrimestre, resumenIva,
  sumarDiasIso, trimestreAnterior, type FacturaParaGestoria,
} from './gestoria';

const F = (p: Partial<FacturaParaGestoria> & { numero: string }): FacturaParaGestoria => ({
  fecha: '2026-07-10', estado: 'emitida', subtotal: 100, ivaPct: 21, totalIva: 21, total: 121, clienteNombre: 'Ana García', clienteNif: '12345678Z', ...p,
});

describe('periodos', () => {
  it('trimestres: primer día, último día y «hasta» excluido (también el cuarto, que cruza el año)', () => {
    expect(periodoTrimestre(2026, 1)).toMatchObject({ desde: '2026-01-01', hasta: '2026-04-01', ultimoDia: '2026-03-31', clave: '2026-T1' });
    expect(periodoTrimestre(2026, 3)).toMatchObject({ desde: '2026-07-01', hasta: '2026-10-01', ultimoDia: '2026-09-30' });
    expect(periodoTrimestre(2026, 4)).toMatchObject({ desde: '2026-10-01', hasta: '2027-01-01', ultimoDia: '2026-12-31', etiqueta: '4.º trimestre de 2026' });
  });
  it('mes y año, incluido febrero de año bisiesto y diciembre', () => {
    expect(periodoMes(2028, 2)).toMatchObject({ desde: '2028-02-01', hasta: '2028-03-01', ultimoDia: '2028-02-29' });
    expect(periodoMes(2026, 2).ultimoDia).toBe('2026-02-28');
    expect(periodoMes(2026, 12)).toMatchObject({ hasta: '2027-01-01', ultimoDia: '2026-12-31', clave: '2026-12' });
    expect(periodoAño(2026)).toMatchObject({ desde: '2026-01-01', hasta: '2027-01-01', ultimoDia: '2026-12-31' });
  });
  it('rango personalizado: incluye el último día; rechaza fechas mal escritas o al revés', () => {
    expect(periodoRango('2026-03-15', '2026-03-31')).toMatchObject({ desde: '2026-03-15', hasta: '2026-04-01', ultimoDia: '2026-03-31' });
    expect(periodoRango('2026-03-31', '2026-03-15')).toBeNull();
    expect(periodoRango('15/03/2026', '2026-03-31')).toBeNull();
    expect(periodoRango('2026-03-15', '2026-03-15')).not.toBeNull();
  });
  it('trimestre anterior: el natural previo, y en el primero el cuarto del año anterior', () => {
    expect(trimestreAnterior(new Date(2026, 10, 18)).clave).toBe('2026-T3');   // noviembre → 3.er trimestre
    expect(trimestreAnterior(new Date(2026, 0, 5)).clave).toBe('2025-T4');
    expect(trimestreAnterior(new Date(2026, 3, 1)).clave).toBe('2026-T1');
    expect(trimestreAnterior(new Date(2026, 8, 30)).clave).toBe('2026-T2');
  });
  it('sumarDiasIso cruza meses y años sin zona horaria', () => {
    expect(sumarDiasIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDiasIso('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('libro de facturas emitidas', () => {
  const facturas = [
    F({ numero: 'FAC-2026-0003', fecha: '2026-07-20', subtotal: 50, totalIva: 10.5, total: 60.5 }),
    F({ numero: 'FAC-2026-0001', fecha: '2026-07-10' }),
    F({ numero: 'FAC-2026-0002', fecha: '2026-07-10', estado: 'pagada', subtotal: 200, ivaPct: 10, totalIva: 20, total: 220, clienteNif: '' }),
    F({ numero: 'FAC-2026-0004', fecha: '2026-08-01', estado: 'cancelada', subtotal: 1000, totalIva: 210, total: 1210 }),
    F({ numero: 'FAC-2026-0005', fecha: '2026-08-02', estado: 'borrador' }),
    F({ numero: 'FAC-2026-0006', fecha: '2026-08-03', estado: 'vencida', subtotal: 80, totalIva: 16.8, total: 96.8 }),
  ];

  it('no incluye borradores, ordena por fecha y número, y marca las anuladas', () => {
    const filas = filasLibro(facturas);
    expect(filas.map((f) => f.numero)).toEqual(['FAC-2026-0001', 'FAC-2026-0002', 'FAC-2026-0003', 'FAC-2026-0004', 'FAC-2026-0006']);
    expect(filas.find((f) => f.numero === 'FAC-2026-0004')).toMatchObject({ anulada: true, estado: 'Anulada' });
    expect(filas.find((f) => f.numero === 'FAC-2026-0002')?.estado).toBe('Pagada');
    expect(filas.find((f) => f.numero === 'FAC-2026-0006')?.estado).toBe('Vencida');
  });

  it('el resumen agrupa por tipo de IVA, deja fuera las anuladas y no arrastra decimales de coma flotante', () => {
    const r = resumenIva(filasLibro(facturas));
    expect(r.lineas).toEqual([
      { ivaPct: 21, facturas: 3, base: 230, cuota: 48.3, total: 278.3 },
      { ivaPct: 10, facturas: 1, base: 200, cuota: 20, total: 220 },
    ]);
    expect(r.totales).toEqual({ facturas: 4, base: 430, cuota: 68.3, total: 498.3 });
  });

  it('muchos importes con céntimos suman exacto', () => {
    const muchas = Array.from({ length: 100 }, (_, i) => F({ numero: `F-${i}`, subtotal: 0.1, totalIva: 0.02, total: 0.12 }));
    const r = resumenIva(filasLibro(muchas));
    expect(r.totales).toEqual({ facturas: 100, base: 10, cuota: 2, total: 12 });
  });

  it('avisos: clientes sin NIF (no anuladas), anuladas y facturas que no cuadran', () => {
    const av = avisosLibro(filasLibro([...facturas, F({ numero: 'FAC-X', subtotal: 100, totalIva: 21, total: 130 }), F({ numero: 'FAC-Y', estado: 'cancelada', clienteNif: '' })]));
    expect(av.sinNif).toEqual(['FAC-2026-0002']);
    expect(av.anuladas).toBe(2);
    expect(av.descuadradas).toEqual(['FAC-X']);
  });

  it('un periodo sin facturas da un libro vacío y totales a cero', () => {
    expect(filasLibro([])).toEqual([]);
    expect(resumenIva([])).toEqual({ lineas: [], totales: { facturas: 0, base: 0, cuota: 0, total: 0 } });
  });

  it('CSV: cabecera, una fila por factura con coma decimal y fecha española, y totales sin anuladas', () => {
    const csv = csvLibro(filasLibro(facturas));
    expect(csv[0][0]).toBe('Nº factura');
    expect(csv[1]).toEqual(['FAC-2026-0001', '10/07/2026', 'Ana García', '12345678Z', '100,00', '21', '21,00', '121,00', 'Emitida']);
    expect(csv[csv.length - 1]).toEqual(['TOTAL (sin anuladas)', '', '', '', '430,00', '', '68,30', '498,30', '']);
    expect(csv.some((f) => f[8] === 'Anulada')).toBe(true);
  });

  it('Excel: dos hojas, importes como números, fechas como fecha y avisos en el resumen', () => {
    const p = periodoTrimestre(2026, 3);
    const hojas = hojasExcel(filasLibro(facturas), p, { nombre: 'Taller Ruiz', nif: 'B12345678' }, new Date('2026-10-05T10:00:00Z'));
    expect(hojas.map((h) => h.nombre)).toEqual(['Facturas emitidas', 'Resumen IVA']);
    const primera = hojas[0].filas[1];
    expect(primera[0]).toBe('FAC-2026-0001');
    expect(primera[1]).toEqual({ fecha: '2026-07-10' });
    expect(primera[4]).toEqual({ valor: 100, estilo: 'dinero' });
    expect(primera[5]).toBe(21);
    const texto = JSON.stringify(hojas[1].filas);
    expect(texto).toContain('3.er trimestre de 2026');
    expect(texto).toContain('B12345678');
    expect(texto).toContain('FAC-2026-0002');          // sin NIF
    expect(texto).toContain('01/07/2026 – 30/09/2026');
  });

  it('nombre de archivo sin acentos ni símbolos', () => {
    expect(nombreArchivoGestoria(periodoTrimestre(2026, 3), 'Taller Ñandú & Hijos, S.L.', 'xlsx')).toBe('doonty_facturas_gestoria_2026-T3_Taller_Nandu_Hijos_S_L.xlsx');
    expect(nombreArchivoGestoria(periodoAño(2026), '', 'csv')).toBe('doonty_facturas_gestoria_2026.csv');
  });
});
