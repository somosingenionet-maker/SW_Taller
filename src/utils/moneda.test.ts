import { describe, expect, it } from 'vitest';
import { fmt2, formatEuros, formatKm } from './moneda';

// es-ES separa el símbolo con un espacio duro; se normaliza para comparar.
const limpio = (s: string) => s.replace(/ | /g, ' ');

describe('moneda', () => {
  it('fmt2: dos decimales y coma, siempre', () => {
    expect(fmt2(45.75)).toBe('45,75');
    expect(fmt2(121)).toBe('121,00');
    expect(fmt2(0)).toBe('0,00');
    expect(fmt2(12.5)).toBe('12,50');
  });
  it('fmt2: redondea a céntimos los restos de coma flotante', () => {
    expect(fmt2(120.9999999)).toBe('121,00');
    expect(fmt2(0.1 + 0.2)).toBe('0,30');
    expect(fmt2(1.005 * 100 / 100)).toMatch(/^1,0[01]$/);
  });
  it('fmt2: un valor no numérico no rompe la pantalla', () => {
    expect(fmt2(NaN)).toBe('0,00');
    expect(fmt2(undefined as unknown as number)).toBe('0,00');
  });
  it('formatEuros añade el símbolo', () => {
    expect(limpio(formatEuros(121))).toBe('121,00 €');
    expect(limpio(formatEuros(45.5))).toBe('45,50 €');
  });
  it('formatKm pone el punto de millar también en cuatro cifras', () => {
    expect(formatKm(8500)).toBe('8.500');
    expect(formatKm(125000)).toBe('125.000');
    expect(formatKm(950)).toBe('950');
    expect(formatKm(1234567)).toBe('1.234.567');
    expect(formatKm(0)).toBe('0');
  });
});
