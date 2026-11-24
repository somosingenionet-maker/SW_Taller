import { describe, expect, it } from 'vitest';
import { cantidadDesdeEntrada, cantidadValida, textoCantidad, textoPrecioLinea } from './cantidadLinea';

describe('cantidad de una línea', () => {
  it('mano de obra admite horas con decimales', () => {
    expect(cantidadDesdeEntrada('mano_de_obra', '1.5')).toBe(1.5);
    expect(cantidadDesdeEntrada('mano_de_obra', '0,25')).toBe(0.25);
    expect(cantidadDesdeEntrada('mano_de_obra', '2.333')).toBe(2.33);
    expect(cantidadDesdeEntrada('mano_de_obra', '0')).toBe(0);
    expect(cantidadDesdeEntrada('mano_de_obra', '')).toBe('');
  });
  it('productos siguen en unidades enteras, mínimo 1', () => {
    expect(cantidadDesdeEntrada('producto', '2.6')).toBe(3);
    expect(cantidadDesdeEntrada('producto', '0')).toBe(1);
  });
  it('0 horas no se puede añadir', () => {
    expect(cantidadValida(0)).toBe(false);
    expect(cantidadValida('')).toBe(false);
    expect(cantidadValida(0.5)).toBe(true);
  });
  it('se enseña en horas y con precio por hora en la mano de obra', () => {
    expect(textoCantidad('mano_de_obra', 1.5)).toBe('1,5 h');
    expect(textoCantidad('producto', 2)).toBe('2');
    expect(textoPrecioLinea('mano_de_obra', 42.5)).toBe('42,50 €/h');
    expect(textoPrecioLinea('producto', 42.5)).toBe('42,50 €');
  });
});
