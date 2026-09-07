import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort } from './dateFormat';

describe('formatDate', () => {
  it('formatea una fecha ISO a "día mes. año"', () => {
    expect(formatDate('2026-07-15')).toBe('15 jul. 2026');
  });

  it('no añade ceros a la izquierda al día', () => {
    expect(formatDate('2026-01-05')).toBe('5 ene. 2026');
  });

  it('usa diciembre correctamente (último mes del array)', () => {
    expect(formatDate('2026-12-31')).toBe('31 dic. 2026');
  });

  it('devuelve "—" para una cadena vacía', () => {
    expect(formatDate('')).toBe('—');
  });

  it('devuelve el valor original si no tiene el formato YYYY-MM-DD', () => {
    expect(formatDate('2026/07/15')).toBe('2026/07/15');
  });
});

describe('formatDateShort', () => {
  it('formatea una fecha ISO a DD/MM/YYYY', () => {
    expect(formatDateShort('2026-07-15')).toBe('15/07/2026');
  });

  it('conserva los ceros a la izquierda (a diferencia de formatDate)', () => {
    expect(formatDateShort('2026-01-05')).toBe('05/01/2026');
  });

  it('devuelve "—" para una cadena vacía', () => {
    expect(formatDateShort('')).toBe('—');
  });

  it('devuelve el valor original si no tiene el formato YYYY-MM-DD', () => {
    expect(formatDateShort('2026/07/15')).toBe('2026/07/15');
  });
});
