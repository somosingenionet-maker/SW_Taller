import { describe, expect, it } from 'vitest';
import {
  categoriasDe, moverCategoria, moverPunto, nombreValido, renumerar, sugerenciaPendiente,
  agruparPorCategoria, descripcionLinea, necesitaDetalle, parsearPrecio, puntosPendientesDeAnadir, resumenPuntos,
  totalPuntos, urgentesSinPrecio, type PuntoAprobable,
} from './inspeccion';

describe('resumenPuntos', () => {
  it('cuenta por estado y los sin marcar', () => {
    const r = resumenPuntos([{ estado: 'bien' }, { estado: 'bien' }, { estado: 'urgente' }, { estado: 'atencion' }, { estado: 'no_aplica' }, { estado: null }]);
    expect(r).toEqual({ bien: 2, atencion: 1, urgente: 1, no_aplica: 1, sinMarcar: 1, total: 6 });
  });
});

describe('necesitaDetalle / urgentesSinPrecio', () => {
  it('solo atención y urgente piden detalle', () => {
    expect(necesitaDetalle('urgente')).toBe(true);
    expect(necesitaDetalle('atencion')).toBe(true);
    expect(necesitaDetalle('bien')).toBe(false);
    expect(necesitaDetalle(null)).toBe(false);
  });
  it('solo los urgentes sin precio bloquean', () => {
    expect(urgentesSinPrecio([{ estado: 'urgente', precio: null }, { estado: 'urgente', precio: 0 }, { estado: 'urgente', precio: 5 }, { estado: 'atencion', precio: null }])).toBe(2);
  });
});

describe('agruparPorCategoria', () => {
  it('conserva el orden de aparición', () => {
    const g = agruparPorCategoria([{ categoria: 'B', n: 1 }, { categoria: 'A', n: 2 }, { categoria: 'B', n: 3 }]);
    expect(g.map((x) => x.categoria)).toEqual(['B', 'A']);
    expect(g[0].puntos.map((p) => p.n)).toEqual([1, 3]);
  });
});

const P = (id: string, extra: Partial<PuntoAprobable> = {}): PuntoAprobable =>
  ({ id, nombre: `Punto ${id}`, reparacion: null, precio: 50, estado: 'urgente', decision: 'aprobado', ...extra });

describe('puntosPendientesDeAnadir', () => {
  it('solo los aprobados, con precio y que aún no están en la orden', () => {
    const r = puntosPendientesDeAnadir([
      P('a'), P('b', { decision: 'rechazado' }), P('c', { decision: null }), P('d', { precio: null }), P('e', { precio: 0 }),
      P('f', { estado: 'bien' }), P('g'), P('h', { estado: 'atencion' }),
    ], new Set(['g']));
    expect(r.map((p) => p.id)).toEqual(['a', 'h']);
  });
  it('no duplica: una vez añadidos no vuelven a salir', () => {
    expect(puntosPendientesDeAnadir([P('a')], new Set(['a']))).toEqual([]);
  });
});

describe('descripcionLinea / totales / precio', () => {
  it('usa la reparación o, si no, el punto', () => {
    expect(descripcionLinea({ nombre: 'Pastillas', reparacion: ' Cambio de pastillas ' })).toBe('Cambio de pastillas');
    expect(descripcionLinea({ nombre: 'Pastillas', reparacion: null })).toBe('Reparación: Pastillas');
    expect(descripcionLinea({ nombre: 'x', reparacion: 'a'.repeat(300) })).toHaveLength(200);
  });
  it('suma con dos decimales sin arrastrar errores de coma flotante', () => {
    expect(totalPuntos([{ precio: 0.1 }, { precio: 0.2 }, { precio: null }])).toBe(0.3);
  });
  it('parsearPrecio acepta coma y punto, vacío es null y lo raro es inválido', () => {
    expect(parsearPrecio('64')).toBe(64);
    expect(parsearPrecio('64,5')).toBe(64.5);
    expect(parsearPrecio(' 64.50 ')).toBe(64.5);
    expect(parsearPrecio('')).toBeNull();
    expect(parsearPrecio('abc')).toBeUndefined();
    expect(parsearPrecio('-5')).toBeUndefined();
    expect(parsearPrecio('1.234,56')).toBeUndefined();
    expect(parsearPrecio('5.555')).toBeUndefined();
  });
});


describe('edición de plantillas', () => {
  const L = [
    { id: 'a', categoria: 'Frenos', nombre: 'Pastillas', posicion: 1 }, { id: 'b', categoria: 'Frenos', nombre: 'Discos', posicion: 2 },
    { id: 'c', categoria: 'Luces', nombre: 'Delanteras', posicion: 3 }, { id: 'd', categoria: 'Luces', nombre: 'Traseras', posicion: 4 },
  ];
  const ids = (l: { id: string }[]) => l.map((p) => p.id).join('');

  it('renumera 1..n y lista las categorías en orden', () => {
    expect(renumerar([{ posicion: 9 }, { posicion: 2 }]).map((p) => p.posicion)).toEqual([1, 2]);
    expect(categoriasDe(L)).toEqual(['Frenos', 'Luces']);
  });
  it('mover un punto lo intercambia con su vecino de la misma categoría', () => {
    expect(ids(moverPunto(L, 'b', -1))).toBe('bacd');
    expect(ids(moverPunto(L, 'c', 1))).toBe('abdc');
  });
  it('en el extremo de su categoría no cambia nada (no salta a otra categoría)', () => {
    expect(ids(moverPunto(L, 'a', -1))).toBe('abcd');
    expect(ids(moverPunto(L, 'b', 1))).toBe('abcd');
    expect(ids(moverPunto(L, 'zzz', 1))).toBe('abcd');
  });
  it('mover una categoría arrastra todos sus puntos', () => {
    expect(ids(moverCategoria(L, 'Luces', -1))).toBe('cdab');
    expect(moverCategoria(L, 'Luces', -1).map((p) => p.posicion)).toEqual([1, 2, 3, 4]);
    expect(ids(moverCategoria(L, 'Frenos', -1))).toBe('abcd');
    expect(ids(moverCategoria(L, 'Luces', 1))).toBe('abcd');
  });
  it('mover no muta la lista original', () => {
    moverPunto(L, 'b', -1);
    expect(ids(L)).toBe('abcd');
  });
  it('nombreValido recorta, junta espacios y respeta el máximo', () => {
    expect(nombreValido('  Pastillas   delanteras ', 80)).toBe('Pastillas delanteras');
    expect(nombreValido('   ', 80)).toBeNull();
    expect(nombreValido('x'.repeat(81), 80)).toBeNull();
    expect(nombreValido('x'.repeat(80), 80)).toBe('x'.repeat(80));
  });
});

describe('sugerenciaPendiente', () => {
  const base = { estado: 'urgente' as const, precio: null, precioSugerido: 64, reparacion: null, reparacionSugerida: 'Cambio' };
  it('solo con problema, sin texto de reparación puesto y con texto sugerido; el precio no cuenta', () => {
    expect(sugerenciaPendiente(base)).toBe(true);
    expect(sugerenciaPendiente({ ...base, estado: 'bien' })).toBe(false);
    expect(sugerenciaPendiente({ ...base, estado: null })).toBe(false);
    expect(sugerenciaPendiente({ ...base, reparacion: 'Lo que escribió el mecánico' })).toBe(false);
    expect(sugerenciaPendiente({ ...base, reparacion: '  ' })).toBe(true);
    expect(sugerenciaPendiente({ ...base, reparacionSugerida: null })).toBe(false);
    // Ni el precio puesto ni el sugerido (que antes era el del servicio y ahora es por hora) cambian nada.
    expect(sugerenciaPendiente({ ...base, precio: 70 })).toBe(true);
    expect(sugerenciaPendiente({ ...base, precioSugerido: null })).toBe(true);
  });
});
