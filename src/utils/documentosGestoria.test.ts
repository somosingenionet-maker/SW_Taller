import { describe, expect, it } from 'vitest';
import { filasIndice, limpiarParaNombre, MAX_BYTES_ZIP, nombreZipDocumentos, planificarDocumentos, textoLeeme } from './documentosGestoria';
import { periodoTrimestre, type CompraParaGestoria } from './gestoria';

const A = (nombre: string, tipo = 'application/pdf', tamano = 1000, ruta = `emp/c/${nombre}`) => ({ ruta, nombre, tipo, tamano });
const C = (p: Partial<CompraParaGestoria> & { numero: string }): CompraParaGestoria => ({
  fecha: '2026-07-05', estado: 'pendiente', proveedorNombre: 'Recambios Ruiz, S.L.', proveedorNif: 'B12345678', lineas: [], total: 121, adjuntos: [A('f.pdf')], ...p,
});

describe('limpiarParaNombre', () => {
  it('quita acentos y símbolos, une con guiones y limita la longitud', () => {
    expect(limpiarParaNombre('Recambios Ruiz, S.L.')).toBe('Recambios-Ruiz-S-L');
    expect(limpiarParaNombre('Grúas Ñandú & Hijos')).toBe('Gruas-Nandu-Hijos');
    expect(limpiarParaNombre('A/B\\C:D*E?')).toBe('A-B-C-D-E');
    expect(limpiarParaNombre('x'.repeat(100), 10)).toBe('x'.repeat(10));
    expect(limpiarParaNombre('abc-def', 4)).toBe('abc');          // no deja un guion colgando al cortar
    expect(limpiarParaNombre('***')).toBe('sin-nombre');
    expect(limpiarParaNombre('')).toBe('sin-nombre');
  });
});

describe('planificarDocumentos', () => {
  it('nombra «fecha_proveedor_número.ext», ordena por fecha y proveedor, y deja fuera las anuladas', () => {
    const plan = planificarDocumentos([
      C({ numero: 'F-2', fecha: '2026-07-20' }),
      C({ numero: 'F-1' }),
      C({ numero: 'F-3', estado: 'anulada', adjuntos: [A('x.pdf')] }),
      C({ numero: 'G-1', proveedorNombre: 'Grúas Paco', proveedorNif: '', adjuntos: [A('foto.jpg', 'image/jpeg')] }),
    ]);
    expect(plan.entradas.map((e) => e.nombre)).toEqual([
      '2026-07-05_Gruas-Paco_G-1.jpg', '2026-07-05_Recambios-Ruiz-S-L_F-1.pdf', '2026-07-20_Recambios-Ruiz-S-L_F-2.pdf',
    ]);
    expect(plan.anuladasOmitidas).toBe(1);
    expect(plan.facturasConDocumento).toBe(3);
  });

  it('una compra con varios archivos los numera; la extensión sale del tipo, no del nombre que puso el taller', () => {
    const plan = planificarDocumentos([C({ numero: 'F-1', adjuntos: [A('scan.exe', 'application/pdf'), A('reverso', 'image/png'), A('otra.webp', 'image/webp')] })]);
    expect(plan.entradas.map((e) => e.nombre)).toEqual(['2026-07-05_Recambios-Ruiz-S-L_F-1_1.pdf', '2026-07-05_Recambios-Ruiz-S-L_F-1_2.png', '2026-07-05_Recambios-Ruiz-S-L_F-1_3.webp']);
    expect(plan.facturasConDocumento).toBe(1);
  });

  it('dos facturas que darían el mismo nombre no se pisan (ni aunque solo cambie la capitalización)', () => {
    const plan = planificarDocumentos([C({ numero: 'F/1' }), C({ numero: 'F-1' }), C({ numero: 'f-1' })]);
    const nombres = plan.entradas.map((e) => e.nombre);
    expect(new Set(nombres.map((n) => n.toLowerCase())).size).toBe(3);
    expect(nombres.map((n) => n.toLowerCase())).toContain('2026-07-05_recambios-ruiz-s-l_f-1.pdf');
    expect(nombres.some((n) => n.endsWith('-2.pdf'))).toBe(true);
    expect(nombres.some((n) => n.endsWith('-3.pdf'))).toBe(true);
  });

  it('señala las facturas sin documento, suma el tamaño y avisa si es demasiado para un solo ZIP', () => {
    const plan = planificarDocumentos([C({ numero: 'F-1', adjuntos: [A('a.pdf', 'application/pdf', 1500)] }), C({ numero: 'F-2', adjuntos: [] }), C({ numero: 'F-3', adjuntos: undefined }), C({ numero: 'F-4', estado: 'anulada', adjuntos: [] })]);
    expect(plan.sinDocumento).toEqual(['Recambios Ruiz, S.L. F-2', 'Recambios Ruiz, S.L. F-3']);   // la anulada sin archivo no cuenta como falta
    expect(plan.bytes).toBe(1500);
    expect(plan.demasiadoGrande).toBe(false);
    expect(planificarDocumentos([C({ numero: 'G', adjuntos: [A('g.pdf', 'application/pdf', MAX_BYTES_ZIP + 1)] })]).demasiadoGrande).toBe(true);
    expect(planificarDocumentos([])).toMatchObject({ entradas: [], bytes: 0, sinDocumento: [], facturasConDocumento: 0 });
  });

  it('un tipo desconocido toma la extensión de la ruta (o «bin»)', () => {
    const plan = planificarDocumentos([C({ numero: 'F-1', adjuntos: [A('a', 'application/x-raro', 10, 'emp/c/uuid.TIFF'), A('b', 'application/x-raro', 10, 'emp/c/sin-extension')] })]);
    expect(plan.entradas.map((e) => e.nombre.split('.').pop())).toEqual(['tiff', 'bin']);
  });
});

describe('índice y léeme', () => {
  const plan = planificarDocumentos([C({ numero: 'F-1', total: 242.5, estado: 'pagada', adjuntos: [A('Factura "Ruiz".pdf')] })]);
  it('el índice lleva una fila por archivo con la factura a la que pertenece', () => {
    const f = filasIndice(plan.entradas);
    expect(f[0]).toEqual(['Archivo', 'Fecha', 'Proveedor', 'NIF proveedor', 'Nº factura', 'Total (IVA incl.)', 'Estado', 'Nombre original']);
    expect(f[1]).toEqual(['2026-07-05_Recambios-Ruiz-S-L_F-1.pdf', '05/07/2026', 'Recambios Ruiz, S.L.', 'B12345678', 'F-1', '242,50', 'Pagada', 'Factura "Ruiz".pdf']);
  });
  it('el léeme cuenta qué hay y, si procede, qué falta o qué falló', () => {
    const t = textoLeeme({ periodo: periodoTrimestre(2026, 3), taller: 'Taller Ruiz', generado: new Date('2026-10-05T10:00:00Z'), incluidos: 1, fallidos: ['F-9 (sin conexión)'], sinDocumento: ['Grúas Paco G-1'], anuladasOmitidas: 2 });
    expect(t).toContain('Facturas recibidas de Taller Ruiz');
    expect(t).toContain('01/07/2026 – 30/09/2026');
    expect(t).toContain('Archivos incluidos: 1');
    expect(t).toContain('SIN documento adjunto');
    expect(t).toContain('  - Grúas Paco G-1');
    expect(t).toContain('NO se pudieron incluir');
    expect(t).toContain('  - F-9 (sin conexión)');
    expect(t).toContain('anuladas con archivos que se dejaron fuera: 2');
    expect(textoLeeme({ periodo: periodoTrimestre(2026, 3), taller: 'T', generado: new Date(), incluidos: 0, fallidos: [], sinDocumento: [], anuladasOmitidas: 0 })).not.toContain('SIN documento');
  });
  it('nombre del ZIP', () => {
    expect(nombreZipDocumentos(periodoTrimestre(2026, 3), 'Taller Ñandú, S.L.')).toBe('doonty_facturas_recibidas_2026-T3_Taller-Nandu-S-L.zip');
  });
});
