import { describe, expect, it } from 'vitest';
import { proximaItvTrasPasarla, proximaRenovacion } from './renovacion';

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

describe('proximaItvTrasPasarla', () => {
  it('dentro de los 30 días antes del vencimiento cuenta desde el vencimiento (no se pierden días)', () => {
    expect(proximaItvTrasPasarla('2026-11-25', '2026-12-20', 2020)).toBe('2028-12-20');
    expect(proximaItvTrasPasarla('2026-11-20', '2026-12-20', 2012)).toBe('2027-12-20'); // justo 30 días antes
    expect(proximaItvTrasPasarla('2026-12-20', '2026-12-20', 2012)).toBe('2027-12-20'); // el mismo día
  });

  it('antes de esa ventana, o ya vencida, cuenta desde el día de la inspección', () => {
    expect(proximaItvTrasPasarla('2026-11-19', '2026-12-20', 2012)).toBe('2027-11-19'); // 31 días antes
    expect(proximaItvTrasPasarla('2026-11-25', '2026-10-01', 2012)).toBe('2027-11-25'); // vencida
  });

  it('sin vencimiento anterior ni año: desde la inspección y a un año', () => {
    expect(proximaItvTrasPasarla('2026-11-25')).toBe('2027-11-25');
    expect(proximaItvTrasPasarla('2026-11-25', '')).toBe('2027-11-25');
  });
});

describe('ITV de furgoneta de mercancías (N1)', () => {
  it('cada 2 años hasta los 6, cada año hasta los 10 y cada 6 meses después', () => {
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2022, 'furgoneta')).toBe('2028-12-10'); // 4 años
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2020, 'furgoneta')).toBe('2028-12-10'); // 6 años: aún bienal
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2018, 'furgoneta')).toBe('2027-12-10'); // 8 años
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2016, 'furgoneta')).toBe('2027-12-10'); // 10 años: aún anual
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', 2012, 'furgoneta')).toBe('2027-06-10'); // 14 años
  });

  it('sin año de matriculación propone 6 meses', () => {
    expect(proximaRenovacion('itv', '2026-12-10', '2026-11-20', undefined, 'furgoneta')).toBe('2027-06-10');
    expect(proximaItvTrasPasarla('2026-11-25', undefined, undefined, 'furgoneta')).toBe('2027-05-25');
  });

  it('al pasarla también respeta la regla de los 30 días', () => {
    expect(proximaItvTrasPasarla('2026-11-25', '2026-12-20', 2012, 'furgoneta')).toBe('2027-06-20');
    expect(proximaItvTrasPasarla('2026-10-01', '2026-12-20', 2012, 'furgoneta')).toBe('2027-04-01');
  });

  it('el seguro y el impuesto no dependen del tipo', () => {
    expect(proximaRenovacion('seguro', '2026-12-10', '2026-11-20', 2012, 'furgoneta')).toBe('2027-12-10');
  });
});
