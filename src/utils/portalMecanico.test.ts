import { describe, expect, it } from 'vitest';
import { fechaHora, ordenesNuevas, vistosActualizados } from './portalMecanico';

const o = (id: string, estado = 'recibido') => ({ id, estado });

describe('ordenesNuevas', () => {
  it('la primera vez que se abre el enlace no marca nada como nuevo', () => {
    expect(ordenesNuevas([o('a'), o('b')], null)).toEqual([]);
  });
  it('marca los coches que no había visto', () => {
    expect(ordenesNuevas([o('a'), o('b'), o('c', 'en_reparacion')], ['a'])).toEqual(['b', 'c']);
  });
  it('un coche ya listo nunca es «nuevo»', () => {
    expect(ordenesNuevas([o('a', 'listo')], [])).toEqual([]);
  });
});

describe('vistosActualizados', () => {
  it('la primera vez guarda todos los actuales', () => {
    expect(vistosActualizados([o('a'), o('b')], null, [])).toEqual(['a', 'b']);
  });
  it('añade los recién vistos y olvida los que ya no están', () => {
    expect(vistosActualizados([o('b'), o('c')], ['a', 'b'], ['c'])).toEqual(['b', 'c']);
  });
});

describe('fechaHora', () => {
  it('formatea día, mes, año y hora local', () => {
    const d = new Date(2026, 10, 10, 12, 7);
    expect(fechaHora(d.toISOString())).toBe('10 nov. 2026 · 12:07');
  });
  it('sin fecha o con fecha rota no revienta', () => {
    expect(fechaHora(null)).toBe('—');
    expect(fechaHora('no-es-fecha')).toBe('—');
  });
});
