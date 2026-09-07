import { describe, it, expect } from 'vitest';
import { sustituirVariables, PLANTILLA_DEFAULT, VARIABLES_DISPONIBLES } from './recordatorioTemplates';

describe('sustituirVariables', () => {
  it('sustituye una variable simple', () => {
    expect(sustituirVariables('Hola {{cliente}}', { cliente: 'María' })).toBe('Hola María');
  });

  it('sustituye varias variables distintas', () => {
    const resultado = sustituirVariables(
      'Hola {{cliente}}, tu {{vehiculo}} vence el {{fecha}}',
      { cliente: 'Carlos', vehiculo: 'Seat León', fecha: '18/6/2026' }
    );
    expect(resultado).toBe('Hola Carlos, tu Seat León vence el 18/6/2026');
  });

  it('sustituye la misma variable repetida varias veces', () => {
    expect(sustituirVariables('{{cliente}} - {{cliente}}', { cliente: 'Ana' })).toBe('Ana - Ana');
  });

  it('deja el placeholder tal cual si no se proporciona valor para esa variable', () => {
    expect(sustituirVariables('Hola {{cliente}}, km: {{km}}', { cliente: 'Luis' })).toBe('Hola Luis, km: {{km}}');
  });

  it('no toca el texto si no hay placeholders', () => {
    expect(sustituirVariables('Texto sin variables', { cliente: 'Ana' })).toBe('Texto sin variables');
  });

  it('no sustituye variables desconocidas fuera de la lista soportada', () => {
    // sustituirVariables solo reemplaza si la clave existe en `valores` — una
    // variable no reconocida ({{otraCosa}}) se queda como estaba.
    expect(sustituirVariables('{{otraCosa}}', {})).toBe('{{otraCosa}}');
  });
});

describe('PLANTILLA_DEFAULT', () => {
  it('tiene una plantilla para cada tipo de alerta', () => {
    expect(Object.keys(PLANTILLA_DEFAULT).sort()).toEqual(['impuesto', 'itv', 'mantenimiento', 'seguro']);
  });

  it('cada plantilla solo usa variables de la lista soportada', () => {
    const nombresSoportados = VARIABLES_DISPONIBLES.map(v => v.replace(/[{}]/g, ''));
    for (const plantilla of Object.values(PLANTILLA_DEFAULT)) {
      const usadas = [...plantilla.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
      for (const variable of usadas) {
        expect(nombresSoportados).toContain(variable);
      }
    }
  });

  it('la plantilla de mantenimiento es la única que usa {{km}}', () => {
    expect(PLANTILLA_DEFAULT.mantenimiento).toContain('{{km}}');
    expect(PLANTILLA_DEFAULT.itv).not.toContain('{{km}}');
    expect(PLANTILLA_DEFAULT.seguro).not.toContain('{{km}}');
    expect(PLANTILLA_DEFAULT.impuesto).not.toContain('{{km}}');
  });
});
