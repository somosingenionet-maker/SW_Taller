import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));
const { porcentaje } = await import('../lib/data/inspeccionesMetricas');

describe('porcentaje', () => {
  it('redondea al entero y no divide por cero', () => {
    expect(porcentaje(19, 24)).toBe(79);
    expect(porcentaje(3915, 6480)).toBe(60);
    expect(porcentaje(1, 3)).toBe(33);
    expect(porcentaje(2, 3)).toBe(67);
    expect(porcentaje(0, 5)).toBe(0);
    expect(porcentaje(5, 0)).toBeNull();
    expect(porcentaje(0, 0)).toBeNull();
  });
});
