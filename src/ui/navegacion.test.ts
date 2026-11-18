import { describe, expect, it } from 'vitest';
import type { Cliente, OrdenTrabajo, Vehiculo } from '../types';
import { atajosMovil, buscarGlobal, compacto, construirMenu, opcionesNuevo } from './navegacion';

const todos = ['vehiculos', 'clientes', 'taller', 'alertas', 'rentabilidad', 'facturas', 'inventario', 'citas', 'compras'] as const;
const V = (id: string, matricula: string, marca: string, modelo: string): Vehiculo => ({ id, matricula, marca, modelo, bastidor: '', kilometraje: 0, itvVencimiento: '', seguroVencimiento: '', impuestoVencimiento: '' } as Vehiculo);
const C = (id: string, nombre: string, apellidos: string, extra: Partial<Cliente> = {}): Cliente => ({ id, nombre, apellidos, nifNiePasaporte: '', correo: '', telefono: '', direccion: '', interacciones: [], fechaRegistro: '', ...extra } as Cliente);
const O = (id: string, numero: string, vehiculoId: string, clienteId: string): OrdenTrabajo => ({ id, numero, vehiculoId, clienteId } as OrdenTrabajo);

describe('menú', () => {
  it('con todos los módulos: 4 secciones por tareas y «Hoy» primero', () => {
    const m = construirMenu([...todos]);
    expect(m.map((s) => s.titulo)).toEqual(['Trabajo', 'Clientes y coches', 'Dinero', 'Compras y stock']);
    expect(m[0].items.map((i) => i.etiqueta)).toEqual(['Hoy', 'En el taller', 'Citas']);
    expect(m.flatMap((s) => s.items).length).toBe(10);
  });
  it('sin módulos solo queda «Hoy»; las secciones vacías desaparecen', () => {
    expect(construirMenu([])).toEqual([{ titulo: 'Trabajo', items: [{ id: 'inicio', etiqueta: 'Hoy', icono: 'hoy' }] }]);
    expect(construirMenu(['facturas', 'taller']).map((s) => s.titulo)).toEqual(['Trabajo', 'Dinero']);
  });
  it('barra inferior del móvil: Hoy, Taller, Citas y Clientes, solo los permitidos', () => {
    expect(atajosMovil([...todos]).map((i) => i.etiqueta)).toEqual(['Hoy', 'En el taller', 'Citas', 'Clientes']);
    expect(atajosMovil(['taller']).map((i) => i.etiqueta)).toEqual(['Hoy', 'En el taller']);
  });
  it('«Nuevo» ofrece solo lo que el usuario puede crear', () => {
    expect(opcionesNuevo([...todos]).map((o) => o.accion)).toEqual(['ot', 'cita', 'cliente', 'vehiculo', 'factura', 'compra']);
    expect(opcionesNuevo(['citas', 'compras']).map((o) => o.etiqueta)).toEqual(['Nueva cita', 'Registrar compra']);
    expect(opcionesNuevo([])).toEqual([]);
  });
});

describe('buscador global', () => {
  const datos = {
    vehiculos: [V('v1', '1234 ABC', 'Seat', 'León'), V('v2', '9007TST', 'Opel', 'Corsa')],
    clientes: [C('c1', 'Isabel', 'Álvarez Muñoz', { telefono: '600 111 222', vehiculosAsociados: ['v2'] }), C('c2', 'Laura', 'Martínez', { nifNiePasaporte: '12345678Z' })],
    ordenes: [O('o1', 'OT-TST-07', 'v2', 'c1')],
  };
  const todo = { taller: true, vehiculos: true, clientes: true };
  it('la matrícula se encuentra sin importar espacios, guiones ni mayúsculas', () => {
    for (const q of ['1234abc', '1234 ABC', '1234-abc', '34ab']) expect(buscarGlobal(q, datos, todo).map((r) => r.id)).toContain('v1');
  });
  it('una matrícula con orden da la orden primero y luego el vehículo y, por el nombre, el cliente', () => {
    const r = buscarGlobal('9007', datos, todo);
    expect(r.map((x) => x.tipo)).toEqual(['orden', 'vehiculo']);
    expect(r[0]).toMatchObject({ titulo: 'Opel Corsa', detalle: 'OT-TST-07 · Isabel Álvarez Muñoz', matricula: '9007TST', modulo: 'taller', busqueda: 'OT-TST-07' });
    expect(r[1]).toMatchObject({ modulo: 'vehiculos', busqueda: '9007TST', detalle: 'Isabel Álvarez Muñoz' });
  });
  it('clientes por nombre sin acentos, por teléfono o por NIF', () => {
    expect(buscarGlobal('alvarez', datos, todo).map((r) => r.tipo)).toEqual(['orden', 'cliente']);
    expect(buscarGlobal('600111', datos, todo)[0]).toMatchObject({ tipo: 'cliente', id: 'c1', modulo: 'clientes' });
    expect(buscarGlobal('12345678z', datos, todo)[0].id).toBe('c2');
    expect(buscarGlobal('isabelalvarez', datos, todo).some((r) => r.tipo === 'cliente')).toBe(true);
  });
  it('solo busca en lo que el usuario puede ver y no ofrece nada con menos de 2 caracteres', () => {
    expect(buscarGlobal('9007', datos, { taller: false, vehiculos: true, clientes: false }).map((r) => r.tipo)).toEqual(['vehiculo']);
    expect(buscarGlobal('9007', datos, { taller: false, vehiculos: false, clientes: false })).toEqual([]);
    expect(buscarGlobal('9', datos, todo)).toEqual([]);
    expect(buscarGlobal('  ', datos, todo)).toEqual([]);
    expect(buscarGlobal('zzzzzz', datos, todo)).toEqual([]);
  });
  it('respeta el límite de resultados', () => {
    const muchos = { ...datos, vehiculos: Array.from({ length: 20 }, (_, i) => V(`x${i}`, `${1000 + i} KLM`, 'Seat', 'Ibiza')) };
    expect(buscarGlobal('klm', muchos, todo, 5)).toHaveLength(5);
    expect(compacto('1234 AB-c_d.e')).toBe('1234abcde');
  });
});
