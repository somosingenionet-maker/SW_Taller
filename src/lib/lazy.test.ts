import { describe, expect, it } from 'vitest';
import { debeRecargar, esErrorDeCarga, VENTANA_RECARGA_MS } from './lazy';

describe('esErrorDeCarga', () => {
  it('reconoce los mensajes de Chrome, Firefox y Safari', () => {
    expect(esErrorDeCarga(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Taller-abc.js'))).toBe(true);
    expect(esErrorDeCarga(new Error('error loading dynamically imported module: https://x/a.js'))).toBe(true);
    expect(esErrorDeCarga(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(esErrorDeCarga(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });
  it('no confunde otros errores con un trozo desaparecido', () => {
    expect(esErrorDeCarga(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(esErrorDeCarga(new Error('No se pudo guardar la factura.'))).toBe(false);
    expect(esErrorDeCarga(null)).toBe(false);
    expect(esErrorDeCarga(undefined)).toBe(false);
    expect(esErrorDeCarga(42)).toBe(false);
  });
});

describe('debeRecargar', () => {
  const ahora = 1_000_000_000;
  it('la primera vez recarga', () => expect(debeRecargar(ahora, null)).toBe(true));
  it('no vuelve a recargar dentro de la ventana (evita bucles)', () => {
    expect(debeRecargar(ahora, ahora - 1000)).toBe(false);
    expect(debeRecargar(ahora, ahora - VENTANA_RECARGA_MS)).toBe(false);
  });
  it('pasada la ventana, otra publicación nueva sí puede recargar', () => expect(debeRecargar(ahora, ahora - VENTANA_RECARGA_MS - 1)).toBe(true));
  it('un valor guardado roto no impide recargar', () => expect(debeRecargar(ahora, Number.NaN)).toBe(true));
});
