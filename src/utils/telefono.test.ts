import { describe, expect, it } from 'vitest';
import { telefonoWhatsApp } from './telefono';

describe('telefonoWhatsApp', () => {
  it('antepone el 34 a un número español de 9 dígitos, lleve o no espacios', () => {
    expect(telefonoWhatsApp('644 09 50 97')).toBe('34644095097');
    expect(telefonoWhatsApp('612345678')).toBe('34612345678');
    expect(telefonoWhatsApp('91 123 45 67')).toBe('34911234567');
  });
  it('no toca un número que ya trae prefijo', () => {
    expect(telefonoWhatsApp('+34 600 000 001')).toBe('34600000001');
    expect(telefonoWhatsApp('+57 300 123 4567')).toBe('573001234567');
    expect(telefonoWhatsApp('34612345678')).toBe('34612345678');
  });
  it('quita el 00 internacional', () => {
    expect(telefonoWhatsApp('0034 612 345 678')).toBe('34612345678');
  });
  it('vacío si no hay teléfono', () => {
    expect(telefonoWhatsApp(undefined)).toBe('');
    expect(telefonoWhatsApp(null)).toBe('');
    expect(telefonoWhatsApp('')).toBe('');
  });
});
