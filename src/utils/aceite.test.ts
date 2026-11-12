import { describe, expect, it } from 'vitest';
import { diasHasta, resumenFiltros, sumarMeses, urgenciaAceite } from './aceite';

describe('sumarMeses', () => {
  it('suma meses y años', () => {
    expect(sumarMeses(6, new Date(2026, 10, 12))).toBe('2027-05-12');
    expect(sumarMeses(12, new Date(2026, 10, 12))).toBe('2027-11-12');
  });
  it('si el día no existe en el mes de destino, usa el último día', () => {
    expect(sumarMeses(6, new Date(2026, 7, 31))).toBe('2027-02-28');
    expect(sumarMeses(1, new Date(2027, 0, 31))).toBe('2027-02-28');
  });
});

describe('resumenFiltros', () => {
  it('separa cambiados, no cambiados y sin revisar', () => {
    expect(resumenFiltros({ aire: 'cambiado', aceite: 'cambiado', combustible: null, habitaculo: 'no_cambiado' }))
      .toBe('Filtros cambiados: aire y aceite. No se cambiaron: habitáculo. Sin revisar: combustible.');
  });
  it('tres o más se unen con comas e «y»', () => {
    expect(resumenFiltros({ aire: 'cambiado', aceite: 'cambiado', combustible: 'cambiado', habitaculo: 'cambiado' }))
      .toBe('Filtros cambiados: aire, aceite, combustible y habitáculo.');
  });
  it('vacío si no se revisó ninguno', () => {
    expect(resumenFiltros({ aire: null, aceite: null, combustible: null, habitaculo: null })).toBe('');
    expect(resumenFiltros(undefined)).toBe('');
  });
});

describe('urgenciaAceite', () => {
  const hoy = '2026-11-12';
  it('por fecha', () => {
    expect(urgenciaAceite('2026-11-11', hoy)).toBe('vencido');
    expect(urgenciaAceite('2026-11-12', hoy)).toBe('proximo');
    expect(urgenciaAceite('2026-12-12', hoy)).toBe('proximo');
    expect(urgenciaAceite('2026-12-13', hoy)).toBe('programado');
    expect(urgenciaAceite(undefined, hoy)).toBe('sin_dato');
  });
  it('por kilómetros: vencido si el coche ya los alcanzó, aunque la fecha no haya llegado', () => {
    expect(urgenciaAceite('2027-05-12', hoy, 100000, 100000)).toBe('vencido');
    expect(urgenciaAceite('2027-05-12', hoy, 100000, 99999)).toBe('programado');
    expect(urgenciaAceite(undefined, hoy, 100000, 120000)).toBe('vencido');
  });
  it('diasHasta', () => {
    expect(diasHasta('2026-11-22', hoy)).toBe(10);
    expect(diasHasta('2026-11-02', hoy)).toBe(-10);
  });
});
