import { describe, expect, it } from 'vitest';
import { esFormatoIntocable, formatearBytes, tamanoEscalado, yaEstaOptimizada } from './imagen';

describe('tamanoEscalado', () => {
  it('reduce el lado largo conservando proporciones', () => {
    expect(tamanoEscalado(4000, 3000, 1600)).toEqual({ ancho: 1600, alto: 1200 });
    expect(tamanoEscalado(3000, 4000, 1600)).toEqual({ ancho: 1200, alto: 1600 });
  });
  it('nunca amplía', () => {
    expect(tamanoEscalado(800, 600, 1600)).toEqual({ ancho: 800, alto: 600 });
    expect(tamanoEscalado(1600, 900, 1600)).toEqual({ ancho: 1600, alto: 900 });
  });
  it('tolera tamaños inválidos sin dividir por cero', () => {
    expect(tamanoEscalado(0, 0, 1600)).toEqual({ ancho: 0, alto: 0 });
    expect(tamanoEscalado(10000, 1, 1600)).toEqual({ ancho: 1600, alto: 1 });
  });
});

describe('esFormatoIntocable', () => {
  it('no toca SVG ni GIF', () => {
    expect(esFormatoIntocable('image/svg+xml')).toBe(true);
    expect(esFormatoIntocable('image/gif')).toBe(true);
    expect(esFormatoIntocable('image/jpeg')).toBe(false);
    expect(esFormatoIntocable('image/png')).toBe(false);
  });
});

describe('yaEstaOptimizada', () => {
  it('una imagen pequeña y ligera se deja como está', () => {
    expect(yaEstaOptimizada(120 * 1024, 1200, 800, 1600)).toBe(true);
  });
  it('una foto grande o pesada se comprime', () => {
    expect(yaEstaOptimizada(5 * 1024 * 1024, 4000, 3000, 1600)).toBe(false);
    expect(yaEstaOptimizada(2 * 1024 * 1024, 1500, 1000, 1600)).toBe(false);
  });
});

describe('formatearBytes', () => {
  it('elige la unidad adecuada', () => {
    expect(formatearBytes(0)).toBe('0 KB');
    expect(formatearBytes(100)).toBe('1 KB');
    expect(formatearBytes(320 * 1024)).toBe('320 KB');
    expect(formatearBytes(1.45 * 1024 * 1024)).toBe('1,4 MB');
    expect(formatearBytes(3 * 1024 * 1024 * 1024)).toBe('3,00 GB');
    expect(formatearBytes(NaN)).toBe('0 KB');
  });
});
