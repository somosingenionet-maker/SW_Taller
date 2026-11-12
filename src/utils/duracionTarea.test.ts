import { describe, expect, it } from 'vitest';
import { OPCIONES_DURACION, resumenTiempos, textoDuracion, textoHoras } from './duracionTarea';

describe('duracionTarea', () => {
  it('textoDuracion', () => {
    expect(textoDuracion(15)).toBe('15 min');
    expect(textoDuracion(60)).toBe('1 h');
    expect(textoDuracion(75)).toBe('1 h 15 min');
    expect(textoDuracion(360)).toBe('6 h');
  });
  it('textoHoras usa coma decimal', () => {
    expect(textoHoras(1)).toBe('1 h');
    expect(textoHoras(1.5)).toBe('1,5 h');
    expect(textoHoras(0.25)).toBe('0,25 h');
  });
  it('las opciones caben en lo que acepta el servidor (5 min – 24 h) y van de menos a más', () => {
    expect(OPCIONES_DURACION.every((m) => m >= 5 && m <= 1440)).toBe(true);
    expect([...OPCIONES_DURACION]).toEqual([...OPCIONES_DURACION].sort((a, b) => a - b));
  });
  it('resumenTiempos: solo mano de obra; distingue tareas con y sin tiempo anotado', () => {
    const r = resumenTiempos([
      { tipo: 'mano_de_obra', cantidad: 1, completado: true, duracionMin: 45 },
      { tipo: 'mano_de_obra', cantidad: 1.5, completado: true },
      { tipo: 'mano_de_obra', cantidad: 2, completado: false },
      { tipo: 'producto', cantidad: 4 },
    ]);
    expect(r).toEqual({ tareas: 3, hechas: 2, conTiempo: 1, minutosReales: 45, horasCobradas: 4.5 });
  });
  it('resumenTiempos de una orden sin mano de obra', () => {
    expect(resumenTiempos([{ tipo: 'producto', cantidad: 2 }])).toEqual({ tareas: 0, hechas: 0, conTiempo: 0, minutosReales: 0, horasCobradas: 0 });
  });
});
