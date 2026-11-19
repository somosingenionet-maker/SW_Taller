import { describe, expect, it } from 'vitest';
import { proximaRenovacion } from './renovacion';

describe('proximaRenovacion', () => {
  it('seguro e impuesto: un año después del vencimiento anterior, no desde hoy', () => {
    expect(proximaRenovacion('seguro', '2026-12-10', '2026-11-20')).toBe('2027-12-10');
    expect(proximaRenovacion('impuesto', '2026-12-10', '2026-11-20')).toBe('2027-12-10');
  });

  it('si se renovó con mucho retraso y la fecha sigue en el pasado, cuenta desde hoy', () => {
    expect(proximaRenovacion('seguro', '2025-01-15', '2026-11-20')).toBe('2027-11-20');
  });

  it('ITV: cada dos años hasta los 10 años del coche y cada año después', () => {
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2020)).toBe('2028-12-10'); // 6 años
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2016)).toBe('2028-12-10'); // 10 años: aún bienal
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2012)).toBe('2027-12-10'); // 14 años
  });

  it('ITV sin año de matriculación: propone un año', () => {
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20')).toBe('2027-12-10');
  });

  it('29 de febrero: se queda en el último día del mes de destino', () => {
    expect(proximaRenovacion('seguro', '2028-02-29', '2028-02-01')).toBe('2029-02-28');
  });
});
