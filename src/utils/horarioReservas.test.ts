import { describe, expect, it } from 'vitest';
import { codigoIframe, errorDeHorario, HORARIO_POR_DEFECTO, normalizarHorario, resumenDia, slugDesdeNombre, slugValido, type HorarioReservas } from './horarioReservas';

describe('horario', () => {
  it('el horario por defecto es válido', () => {
    expect(errorDeHorario(HORARIO_POR_DEFECTO)).toBeNull();
  });
  it('detecta franjas al revés, solapadas o desordenadas, con el nombre del día', () => {
    const base: HorarioReservas = { ...HORARIO_POR_DEFECTO };
    expect(errorDeHorario({ ...base, lun: [['13:00', '09:00']] })).toContain('Lunes');
    expect(errorDeHorario({ ...base, mar: [['09:00', '14:00'], ['13:00', '18:00']] })).toContain('Martes');
    expect(errorDeHorario({ ...base, mie: [['16:00', '19:00'], ['09:00', '13:00']] })).toContain('Miércoles');
    expect(errorDeHorario({ ...base, jue: [['09:00', '09:00']] })).toContain('Jueves');
    expect(errorDeHorario({ ...base, vie: [['08:00', '09:00'], ['10:00', '11:00'], ['12:00', '13:00'], ['14:00', '15:00']] })).toContain('Viernes');
    expect(errorDeHorario({ ...base, sab: [['9:00', '13:00']] })).toContain('Sábado');
  });
  it('dos franjas que se tocan (acaba una cuando empieza otra) son válidas', () => {
    expect(errorDeHorario({ ...HORARIO_POR_DEFECTO, lun: [['09:00', '12:00'], ['12:00', '15:00']] })).toBeNull();
  });
  it('normalizarHorario completa los días que faltan y descarta basura', () => {
    const h = normalizarHorario({ lun: [['09:00', '13:00'], 'raro', [1, 2]], mar: 'x', zzz: [['01:00', '02:00']] });
    expect(h.lun).toEqual([['09:00', '13:00']]);
    expect(h.mar).toEqual([]);
    expect(Object.keys(h)).toEqual(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']);
    expect(normalizarHorario(null).dom).toEqual([]);
    expect(normalizarHorario('texto').lun).toEqual([]);
  });
  it('resumenDia', () => {
    expect(resumenDia([])).toBe('Cerrado');
    expect(resumenDia([['09:00', '13:30'], ['16:00', '19:30']])).toBe('09:00–13:30 · 16:00–19:30');
  });
});

describe('dirección pública', () => {
  it('se genera sin tildes ni símbolos y respeta el límite', () => {
    expect(slugDesdeNombre('Talleres Ruiz & Hijos, S.L.')).toBe('talleres-ruiz-hijos-s-l');
    expect(slugDesdeNombre('Mecánica Peña — Elche')).toBe('mecanica-pena-elche');
    expect(slugDesdeNombre('ab')).toBe('');
    expect(slugDesdeNombre('!!!')).toBe('');
    expect(slugDesdeNombre('x'.repeat(60)).length).toBeLessThanOrEqual(40);
    expect(slugValido(slugDesdeNombre('Taller Ejemplo S.L.'))).toBe(true);
  });
  it('slugValido refleja las reglas de la base de datos', () => {
    for (const ok of ['taller-ruiz', 'abc', 'a1b', 'mi-taller-2']) expect(slugValido(ok)).toBe(true);
    for (const mal of ['ab', '-abc', 'abc-', 'Taller', 'taller ruiz', 'taller_ruiz', 'x'.repeat(41), '']) expect(slugValido(mal)).toBe(false);
  });
  it('el código para la web es un iframe con la dirección dada', () => {
    const c = codigoIframe('https://motor.doonty.com/reservar/taller-ruiz');
    expect(c).toContain('src="https://motor.doonty.com/reservar/taller-ruiz"');
    expect(c.startsWith('<iframe')).toBe(true);
  });
});
