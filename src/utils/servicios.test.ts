import { describe, expect, it } from 'vitest';
import { serviciosQueCoinciden } from './servicios';
import type { Servicio } from '../lib/data/servicios';

const s = (nombre: string, reparacion: string, activo = true, precio: number | null = null): Servicio => ({ id: nombre, nombre, reparacion, precio, activo });
const lista = [
  s('Cambio de aceite y filtro', 'Cambio de aceite de motor y filtro de aceite', true, 60),
  s('Pastillas de freno delanteras', 'Sustitución de pastillas de freno delanteras'),
  s('Líquido de frenos', 'Sustitución y purgado del líquido de frenos'),
  s('Lámparas', 'Sustitución de lámparas', false),
];

describe('serviciosQueCoinciden', () => {
  it('con el campo vacío enseña todos los activos', () => {
    expect(serviciosQueCoinciden(lista, '').map((x) => x.nombre)).toEqual(['Cambio de aceite y filtro', 'Pastillas de freno delanteras', 'Líquido de frenos']);
  });
  it('busca en el nombre y en el texto, sin tildes ni mayúsculas', () => {
    expect(serviciosQueCoinciden(lista, 'liquido').map((x) => x.nombre)).toEqual(['Líquido de frenos']);
    expect(serviciosQueCoinciden(lista, 'FRENO').length).toBe(2);
    expect(serviciosQueCoinciden(lista, 'motor').map((x) => x.nombre)).toEqual(['Cambio de aceite y filtro']);
  });
  it('no sugiere los desactivados', () => {
    expect(serviciosQueCoinciden(lista, 'lampara')).toEqual([]);
  });
});
