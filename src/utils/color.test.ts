import { describe, it, expect } from 'vitest';
import { contrastText } from './color';

describe('contrastText', () => {
  it('devuelve blanco sobre un color oscuro', () => {
    expect(contrastText('#111827')).toBe('#ffffff');
  });

  it('devuelve blanco sobre el azul de marca por defecto', () => {
    expect(contrastText('#2563eb')).toBe('#ffffff');
  });

  it('devuelve negro sobre un color claro', () => {
    expect(contrastText('#fde68a')).toBe('#000000');
  });

  it('devuelve negro sobre blanco puro', () => {
    expect(contrastText('#ffffff')).toBe('#000000');
  });

  it('devuelve blanco sobre negro puro', () => {
    expect(contrastText('#000000')).toBe('#ffffff');
  });

  it('no lanza con una cadena que no es un hex válido', () => {
    // No produce NaN "puro" (parseInt admite prefijos parciales), así que
    // no pasa por el catch — pero tampoco debe lanzar ni devolver basura.
    expect(() => contrastText('no-es-un-color')).not.toThrow();
    expect(['#ffffff', '#000000']).toContain(contrastText('no-es-un-color'));
  });

  it('usa el valor por defecto del catch si el argumento no es una cadena', () => {
    expect(contrastText(null as unknown as string)).toBe('#ffffff');
    expect(contrastText(undefined as unknown as string)).toBe('#ffffff');
  });
});
