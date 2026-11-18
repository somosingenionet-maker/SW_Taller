import { describe, expect, it } from 'vitest';
import { esOscuro, guardarTema, leerTema } from './tema';

describe('tema', () => {
  it('por defecto es claro y respeta lo guardado', () => {
    expect(leerTema({ getItem: () => null })).toBe('claro');
    expect(leerTema({ getItem: () => 'oscuro' })).toBe('oscuro');
    expect(leerTema({ getItem: () => 'auto' })).toBe('auto');
    expect(leerTema({ getItem: () => 'rosa' })).toBe('claro');
  });
  it('sin almacenamiento no falla', () => {
    expect(leerTema(null)).toBe('claro');
    expect(leerTema({ getItem: () => { throw new Error('x'); } })).toBe('claro');
    expect(() => guardarTema('oscuro', null)).not.toThrow();
    expect(() => guardarTema('oscuro', { setItem: () => { throw new Error('x'); } })).not.toThrow();
  });
  it('automático sigue al sistema', () => {
    expect(esOscuro('auto', true)).toBe(true);
    expect(esOscuro('auto', false)).toBe(false);
    expect(esOscuro('claro', true)).toBe(false);
    expect(esOscuro('oscuro', false)).toBe(true);
  });
});
