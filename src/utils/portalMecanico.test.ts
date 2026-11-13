import { describe, expect, it } from 'vitest';
import { fechaHora, ordenarPorLlegada, ordenesNuevas, vistosActualizados } from './portalMecanico';

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

describe('ordenarPorLlegada', () => {
  const o = (id: string, ingreso: string | null) => ({ id, ingreso });
  it('el último en llegar va arriba', () => {
    const r = ordenarPorLlegada([o('a', '2026-11-10T09:00:00Z'), o('b', '2026-11-12T08:00:00Z'), o('c', '2026-11-11T20:00:00Z')]);
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });
  it('compara la hora real, no solo el día', () => {
    const r = ordenarPorLlegada([o('manana', '2026-11-11T08:00:00Z'), o('tarde', '2026-11-11T17:30:00Z')]);
    expect(r.map((x) => x.id)).toEqual(['tarde', 'manana']);
  });
  it('un coche sin hora de ingreso (o con una rota) va al final', () => {
    const r = ordenarPorLlegada([o('sin', null), o('rota', 'no-es-fecha'), o('ok', '2026-11-11T08:00:00Z')]);
    expect(r[0].id).toBe('ok');
    expect(r.slice(1).map((x) => x.id)).toEqual(['sin', 'rota']);
  });
  it('a igual hora respeta el orden que ya traía y no toca la lista original', () => {
    const original = [o('x', '2026-11-11T08:00:00Z'), o('y', '2026-11-11T08:00:00Z')];
    expect(ordenarPorLlegada(original).map((r) => r.id)).toEqual(['x', 'y']);
    const copia = [...original];
    ordenarPorLlegada(original);
    expect(original).toEqual(copia);
  });
  it('lista vacía', () => expect(ordenarPorLlegada([])).toEqual([]));
});
