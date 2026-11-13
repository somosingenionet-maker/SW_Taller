import { describe, expect, it } from 'vitest';
import { fechaHora, hoyLocal, ordenarGrupo, ordenesNuevas, plazoEntrega, vistosActualizados } from './portalMecanico';

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

describe('ordenarGrupo — por empezar y en reparación', () => {
  const o = (id: string, entrega: string | null, ingreso: string | null) => ({ id, fechaEstimadaEntrega: entrega, ingreso });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it('primero la entrega prevista más cercana; las vencidas, las primeras', () => {
    const r = ordenarGrupo('en_reparacion', [o('lejos', '2026-11-30', '2026-11-01T08:00:00Z'), o('vencida', '2026-11-05', '2026-11-04T08:00:00Z'), o('pronto', '2026-11-14', '2026-11-10T08:00:00Z')]);
    expect(ids(r)).toEqual(['vencida', 'pronto', 'lejos']);
  });
  it('a igual fecha prevista, el que llegó antes (por turno)', () => {
    const r = ordenarGrupo('recibido', [o('tarde', '2026-11-14', '2026-11-12T17:00:00Z'), o('pronto', '2026-11-14', '2026-11-12T08:00:00Z')]);
    expect(ids(r)).toEqual(['pronto', 'tarde']);
  });
  it('sin fecha prevista, al final de su grupo y también por turno', () => {
    const r = ordenarGrupo('recibido', [o('sinB', null, '2026-11-12T10:00:00Z'), o('con', '2026-12-31', '2026-11-12T11:00:00Z'), o('sinA', null, '2026-11-10T10:00:00Z')]);
    expect(ids(r)).toEqual(['con', 'sinA', 'sinB']);
  });
  it('sin ninguna fecha el orden es estable y no toca la lista original', () => {
    const original = [o('x', null, null), o('y', null, null)];
    expect(ids(ordenarGrupo('recibido', original))).toEqual(['x', 'y']);
    const copia = [...original];
    ordenarGrupo('recibido', original);
    expect(original).toEqual(copia);
  });
  it('lista vacía', () => expect(ordenarGrupo('recibido', [])).toEqual([]));
});

describe('ordenarGrupo — listos', () => {
  const o = (id: string, listoEn: string | null, ingreso: string | null, entrega: string | null = null) => ({ id, listoEn, ingreso, fechaEstimadaEntrega: entrega });
  const ids = (r: { id: string }[]) => r.map((x) => x.id);

  it('el último en terminarse, arriba, aunque su entrega prevista sea otra', () => {
    const r = ordenarGrupo('listo', [o('ayer', '2026-11-12T17:00:00Z', '2026-11-01T08:00:00Z', '2026-11-05'), o('hoy', '2026-11-13T09:00:00Z', '2026-11-02T08:00:00Z', '2026-12-30')]);
    expect(ids(r)).toEqual(['hoy', 'ayer']);
  });
  it('compara la hora real, no solo el día', () => {
    expect(ids(ordenarGrupo('listo', [o('manana', '2026-11-13T08:00:00Z', null), o('tarde', '2026-11-13T17:30:00Z', null)]))).toEqual(['tarde', 'manana']);
  });
  it('si no se sabe cuándo se terminó (función antigua), usa la hora de llegada; sin ningún dato, al final', () => {
    const r = ordenarGrupo('listo', [o('sin', null, null), o('antiguo', null, '2026-11-01T08:00:00Z'), o('reciente', null, '2026-11-12T08:00:00Z')]);
    expect(ids(r)).toEqual(['reciente', 'antiguo', 'sin']);
  });
  it('una hora de «listo» rota no rompe el orden', () => {
    expect(ids(ordenarGrupo('listo', [o('rota', 'no-es-fecha', null), o('ok', '2026-11-13T08:00:00Z', null)]))).toEqual(['ok', 'rota']);
  });
});

describe('plazoEntrega', () => {
  const hoy = '2026-11-13';
  it('sin fecha no hay nada que avisar', () => expect(plazoEntrega(null, hoy)).toBeNull());
  it('retrasado', () => {
    expect(plazoEntrega('2026-11-12', hoy)).toEqual({ tipo: 'vencida', texto: 'Debía entregarse ayer' });
    expect(plazoEntrega('2026-11-10', hoy)).toEqual({ tipo: 'vencida', texto: 'Retrasado 3 días' });
  });
  it('hoy y mañana', () => {
    expect(plazoEntrega('2026-11-13', hoy)).toEqual({ tipo: 'hoy', texto: 'Entrega hoy' });
    expect(plazoEntrega('2026-11-14', hoy)).toEqual({ tipo: 'manana', texto: 'Entrega mañana' });
  });
  it('más adelante, con día y mes sin ceros', () => expect(plazoEntrega('2026-12-05', hoy)).toEqual({ tipo: 'futura', texto: 'Entrega 5/12' }));
  it('una fecha rota no avisa de nada', () => expect(plazoEntrega('nada', hoy)).toBeNull());
});

describe('hoyLocal', () => {
  it('fecha local en AAAA-MM-DD con ceros', () => expect(hoyLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05'));
});
