import { describe, expect, it } from 'vitest';
import { guardarDiseno, leerDiseno } from './disenoNuevo';

const memoria = (inicial: Record<string, string> = {}) => {
  const d = { ...inicial };
  return { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; }, d };
};

describe('interruptor de diseño', () => {
  it('por defecto es el actual', () => { expect(leerDiseno('', memoria())).toBe('actual'); });
  it('respeta lo guardado', () => { expect(leerDiseno('', memoria({ 'doonty-ui': 'nuevo' }))).toBe('nuevo'); });
  it('?ui= manda y se guarda', () => {
    const m = memoria({ 'doonty-ui': 'actual' });
    expect(leerDiseno('?ui=nuevo', m)).toBe('nuevo');
    expect(m.d['doonty-ui']).toBe('nuevo');
    expect(leerDiseno('?ui=actual', m)).toBe('actual');
  });
  it('ignora valores raros', () => { expect(leerDiseno('?ui=rosa', memoria())).toBe('actual'); });
  it('sin almacenamiento no falla', () => {
    expect(leerDiseno('', null)).toBe('actual');
    expect(() => guardarDiseno('nuevo', null)).not.toThrow();
    const roto = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(leerDiseno('', roto)).toBe('actual');
    expect(() => guardarDiseno('nuevo', roto)).not.toThrow();
  });
});
