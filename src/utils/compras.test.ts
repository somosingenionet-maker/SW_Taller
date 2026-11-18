import { describe, expect, it } from 'vitest';
import { agruparPorPagar, avisoPagos, calcularCompra, cuotaCent, deudaPorProveedor, diasHasta, estadoVisible, etiquetaVencimiento, resumenPagos, subtotalCent, sumarDias, validarCompra, vencimientoSugerido } from './compras';

describe('importes (mismos redondeos que el servidor)', () => {
  it('coincide con los casos comprobados contra la base de datos', () => {
    // guardar_compra: 3 × 4,00 al 21 % + 1 × 100,00 al 10 % → base 112,00 · IVA 2,52 + 10,00 = 12,52 · total 124,52
    const t = calcularCompra([{ cantidad: 3, precioUnitario: 4, ivaPct: 21 }, { cantidad: 1, precioUnitario: 100, ivaPct: 10 }]);
    expect(t).toMatchObject({ base: 112, iva: 12.52, total: 124.52, subtotales: [12, 100] });
    // 1,15 × 3,10 al 21 % → 3,57 (3,565 hacia arriba) · IVA 0,75 · total 4,32
    const r = calcularCompra([{ cantidad: 1.15, precioUnitario: 3.1, ivaPct: 21 }]);
    expect(r).toMatchObject({ subtotales: [3.57], iva: 0.75, total: 4.32 });
  });
  it('el IVA se calcula sobre la base de cada tipo, no línea a línea (100 líneas de 0,10 al 21 % → 2,10, no 2,00)', () => {
    const lineas = Array.from({ length: 100 }, () => ({ cantidad: 1, precioUnitario: 0.1, ivaPct: 21 }));
    const t = calcularCompra(lineas);
    expect(t).toMatchObject({ base: 10, iva: 2.1, total: 12.1 });       // idéntico a lo que da la base de datos
    const mezcla = calcularCompra([...lineas, { cantidad: 1, precioUnitario: 50, ivaPct: 0 }, { cantidad: 2, precioUnitario: 10, ivaPct: 10 }]);
    expect(mezcla.porIva).toEqual([{ ivaPct: 21, base: 10, cuota: 2.1 }, { ivaPct: 10, base: 20, cuota: 2 }, { ivaPct: 0, base: 50, cuota: 0 }]);
    expect(mezcla).toMatchObject({ base: 80, iva: 4.1, total: 84.1 });
  });
  it('la media se redondea hacia arriba aunque la coma flotante diga otra cosa', () => {
    expect(subtotalCent(1.15, 3.1)).toBe(357);       // 3,565 → 3,57 (en coma flotante 1,15 × 3,10 = 3,5649999…)
    expect(subtotalCent(0.5, 0.01)).toBe(1);         // 0,005 → 0,01
    expect(subtotalCent(2, 0.005)).toBe(2);          // el precio se redondea a 2 decimales antes (0,01), igual que al guardarlo → 0,02
    expect(cuotaCent(357, 21)).toBe(75);             // 0,7497 → 0,75
    expect(cuotaCent(5, 10)).toBe(1);                // 0,005 → 0,01
  });
  it('una compra sin líneas vale cero', () => {
    expect(calcularCompra([])).toEqual({ subtotales: [], base: 0, iva: 0, total: 0, porIva: [] });
  });
});

describe('fechas y estados', () => {
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-12-20', 30)).toBe('2027-01-19');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('vencimiento sugerido: fecha + días de pago, y nada si paga al contado', () => {
    expect(vencimientoSugerido('2026-11-18', 30)).toBe('2026-12-18');
    expect(vencimientoSugerido('2026-11-18', 0)).toBeNull();
  });
  it('«vencida» es una pendiente cuyo vencimiento ya pasó; el día del vencimiento aún no lo está', () => {
    expect(estadoVisible({ estado: 'pendiente', fechaVencimiento: '2026-11-17' }, '2026-11-18')).toBe('vencida');
    expect(estadoVisible({ estado: 'pendiente', fechaVencimiento: '2026-11-18' }, '2026-11-18')).toBe('pendiente');
    expect(estadoVisible({ estado: 'pendiente' }, '2026-11-18')).toBe('pendiente');
    expect(estadoVisible({ estado: 'pagada', fechaVencimiento: '2020-01-01' }, '2026-11-18')).toBe('pagada');
    expect(estadoVisible({ estado: 'anulada', fechaVencimiento: '2020-01-01' }, '2026-11-18')).toBe('anulada');
  });
  it('lo que se debe: pendientes (con las vencidas dentro); pagadas y anuladas no cuentan', () => {
    const r = resumenPagos([
      { estado: 'pendiente', fechaVencimiento: '2026-11-01', total: 100.1 },
      { estado: 'pendiente', fechaVencimiento: '2026-12-01', total: 50.2 },
      { estado: 'pendiente', total: 10 },
      { estado: 'pagada', total: 999 },
      { estado: 'anulada', total: 999 },
    ], '2026-11-18');
    expect(r).toEqual({ pendiente: 160.3, vencido: 100.1, cuantasPendientes: 3, cuantasVencidas: 1 });
  });
});

describe('validación del formulario', () => {
  const ok = { proveedorId: 'p1', numero: 'F-1', fecha: '2026-11-18', fechaVencimiento: '', pagada: false, fechaPago: '', lineas: [{ productoId: '', descripcion: 'Grúa', cantidad: 1, precioUnitario: 10, ivaPct: 21 }] };
  const hoy = '2026-11-18';
  it('acepta un formulario correcto', () => { expect(validarCompra(ok, hoy)).toBeNull(); });
  it('señala el primer problema', () => {
    expect(validarCompra({ ...ok, proveedorId: '' }, hoy)).toBe('Elige el proveedor.');
    expect(validarCompra({ ...ok, numero: '  ' }, hoy)).toBe('Escribe el número de la factura del proveedor.');
    expect(validarCompra({ ...ok, fecha: '' }, hoy)).toBe('Indica la fecha de la factura.');
    expect(validarCompra({ ...ok, fecha: '2026-12-30' }, hoy)).toContain('futura');
    expect(validarCompra({ ...ok, fechaVencimiento: '2026-11-01' }, hoy)).toContain('vencimiento');
    expect(validarCompra({ ...ok, pagada: true, fechaPago: '2026-11-01' }, hoy)).toContain('pago');
    expect(validarCompra({ ...ok, lineas: [] }, hoy)).toBe('Añade al menos una línea.');
    expect(validarCompra({ ...ok, lineas: [{ ...ok.lineas[0], descripcion: ' ' }] }, hoy)).toContain('Línea 1');
    expect(validarCompra({ ...ok, lineas: [ok.lineas[0], { ...ok.lineas[0], cantidad: 0 }] }, hoy)).toBe('Línea 2: la cantidad debe ser mayor que cero.');
    expect(validarCompra({ ...ok, lineas: [{ ...ok.lineas[0], precioUnitario: -1 }] }, hoy)).toContain('negativo');
  });
  it('una línea con producto no necesita descripción escrita', () => {
    expect(validarCompra({ ...ok, lineas: [{ ...ok.lineas[0], productoId: 'x', descripcion: '' }] }, hoy)).toBeNull();
  });
});

describe('cuentas por pagar', () => {
  const hoy = '2026-11-18';
  const P = (id: string, venc: string | undefined, total: number, prov = 'p1', estado: 'pendiente' | 'pagada' | 'anulada' = 'pendiente') =>
    ({ id, estado, fechaVencimiento: venc, total, proveedorId: prov, proveedorNombre: prov === 'p1' ? 'Recambios Ruiz' : 'Grúas Paco' });

  it('diasHasta cuenta días de calendario, también entre meses y años', () => {
    expect(diasHasta('2026-11-18', hoy)).toBe(0);
    expect(diasHasta('2026-11-25', hoy)).toBe(7);
    expect(diasHasta('2026-11-10', hoy)).toBe(-8);
    expect(diasHasta('2027-01-01', '2026-12-31')).toBe(1);
    expect(diasHasta('2028-03-01', '2028-02-28')).toBe(2);     // bisiesto
  });
  it('etiquetas de vencimiento', () => {
    expect(etiquetaVencimiento('2026-11-13', hoy)).toBe('Vencida hace 5 días');
    expect(etiquetaVencimiento('2026-11-17', hoy)).toBe('Vencida ayer');
    expect(etiquetaVencimiento('2026-11-18', hoy)).toBe('Vence hoy');
    expect(etiquetaVencimiento('2026-11-19', hoy)).toBe('Vence mañana');
    expect(etiquetaVencimiento('2026-11-28', hoy)).toBe('Vence en 10 días');
    expect(etiquetaVencimiento(undefined, hoy)).toBe('Sin fecha de vencimiento');
  });
  it('agrupa por urgencia, ordena por vencimiento dentro de cada grupo, suma en céntimos y deja fuera pagadas y anuladas', () => {
    const g = agruparPorPagar([
      P('a', '2026-11-10', 100.1), P('b', '2026-11-01', 50.2), P('c', '2026-11-18', 10), P('d', '2026-11-25', 5.05), P('e', '2026-11-26', 7),
      P('f', undefined, 1), P('g', '2026-10-01', 999, 'p1', 'pagada'), P('h', '2026-10-01', 999, 'p1', 'anulada'),
    ], hoy);
    expect(g.map((x) => x.clave)).toEqual(['vencidas', 'semana', 'proximas', 'sinFecha']);
    expect(g[0].compras.map((c) => c.id)).toEqual(['b', 'a']);        // la que lleva más tiempo vencida, primero
    expect(g[0].total).toBe(150.3);
    expect(g[1].compras.map((c) => c.id)).toEqual(['c', 'd']);        // hoy y dentro de 7 días entran en «próximos 7 días»
    expect(g[2].compras.map((c) => c.id)).toEqual(['e']);             // dentro de 8 días ya es «más adelante»
    expect(agruparPorPagar([P('x', '2026-11-30', 1, 'p1', 'pagada')], hoy)).toEqual([]);
  });
  it('deuda por proveedor: de mayor a menor, con la parte vencida', () => {
    const d = deudaPorProveedor([P('a', '2026-11-10', 100), P('b', '2026-12-10', 20), P('c', '2026-11-01', 150, 'p2'), P('d', undefined, 0.5, 'p2'), P('e', '2026-11-01', 999, 'p2', 'pagada')], hoy);
    expect(d).toEqual([
      { proveedorId: 'p2', nombre: 'Grúas Paco', facturas: 2, total: 150.5, vencido: 150 },
      { proveedorId: 'p1', nombre: 'Recambios Ruiz', facturas: 2, total: 120, vencido: 100 },
    ]);
  });
  it('aviso: lo vencido y lo que vence en 7 días; sin fecha no avisa; sin nada pendiente no hay aviso', () => {
    expect(avisoPagos([P('a', '2026-11-10', 100), P('b', '2026-11-18', 20), P('c', '2026-11-25', 30), P('d', '2026-11-26', 40), P('e', undefined, 50)], hoy))
      .toEqual({ vencidas: { n: 1, importe: 100 }, semana: { n: 2, importe: 50 }, hay: true });
    expect(avisoPagos([P('d', '2026-11-26', 40)], hoy).hay).toBe(false);
    expect(avisoPagos([], hoy)).toEqual({ vencidas: { n: 0, importe: 0 }, semana: { n: 0, importe: 0 }, hay: false });
  });
});
