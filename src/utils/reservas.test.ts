import { describe, expect, it } from 'vitest';
import { cuadriculaMes, etiquetaDia, mesesConHueco, partirHoras, textoDuracionCita } from './reservas';

describe('cuadriculaMes', () => {
  it('noviembre de 2026 empieza en domingo: seis huecos antes y semanas completas', () => {
    const c = cuadriculaMes(2026, 10, new Set(['2026-11-17']));
    expect(c.slice(0, 6).every((x) => x.fecha === null)).toBe(true);
    expect(c[6]).toEqual({ fecha: '2026-11-01', dia: 1, disponible: false });
    expect(c.length % 7).toBe(0);
    expect(c.filter((x) => x.dia !== null)).toHaveLength(30);
    expect(c.find((x) => x.fecha === '2026-11-17')?.disponible).toBe(true);
    expect(c.filter((x) => x.disponible)).toHaveLength(1);
  });
  it('un mes que empieza en lunes no lleva huecos al principio; febrero bisiesto tiene 29 días', () => {
    expect(cuadriculaMes(2026, 5, {})[0].fecha).toBe('2026-06-01');          // 1 jun 2026 es lunes
    expect(cuadriculaMes(2028, 1, {}).filter((x) => x.dia !== null)).toHaveLength(29);
  });
  it('acepta un objeto de disponibilidad además de un Set', () => {
    expect(cuadriculaMes(2026, 10, { '2026-11-02': ['09:00'] }).find((x) => x.fecha === '2026-11-02')?.disponible).toBe(true);
  });
});

describe('mesesConHueco', () => {
  it('agrupa por mes en orden, sin repetir, y cruza el cambio de año', () => {
    expect(mesesConHueco(['2026-12-20', '2026-11-17', '2026-11-30', '2027-01-05'])).toEqual([{ año: 2026, mes: 10 }, { año: 2026, mes: 11 }, { año: 2027, mes: 0 }]);
    expect(mesesConHueco([])).toEqual([]);
  });
});

describe('partirHoras / etiquetaDia / textoDuracionCita', () => {
  it('reparte en mañana y tarde', () => {
    expect(partirHoras(['09:00', '13:30', '14:00', '16:30'])).toEqual({ manana: ['09:00', '13:30'], tarde: ['14:00', '16:30'] });
  });
  it('escribe el día en español', () => {
    expect(etiquetaDia('2026-11-17')).toBe('martes 17 de noviembre');
    expect(etiquetaDia('2027-01-01')).toBe('viernes 1 de enero');
  });
  it('escribe la duración', () => {
    expect(textoDuracionCita(60)).toBe('1 h');
    expect(textoDuracionCita(45)).toBe('45 min');
    expect(textoDuracionCita(90)).toBe('1 h 30 min');
  });
});
