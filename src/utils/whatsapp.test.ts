import { describe, expect, it } from 'vitest';
import { cuandoLargo, mensajeCita, mensajeCitaAlTaller, mensajeInforme, mensajePresupuesto, waHref } from './whatsapp';

describe('waHref', () => {
  it('limpia el teléfono y añade el prefijo de España si falta', () => {
    expect(waHref('+34 600 000 001', 'Hola')).toBe('https://wa.me/34600000001?text=Hola');
    expect(waHref('600 000 001', 'Hola')).toBe('https://wa.me/34600000001?text=Hola');
  });
  it('sin teléfono devuelve null', () => {
    expect(waHref(undefined, 'Hola')).toBeNull();
    expect(waHref(null, 'Hola')).toBeNull();
    expect(waHref('', 'Hola')).toBeNull();
  });
  it('codifica el mensaje, incluido el enlace', () => {
    const url = waHref('600000001', 'a b&c?d=e')!;
    expect(url).toContain('text=a%20b%26c%3Fd%3De');
  });
});

describe('mensajes', () => {
  it('el informe lleva el nombre, el vehículo, el taller y el enlace', () => {
    const m = mensajeInforme('Ana', 'Seat León (1234ABC)', 'Taller Ruiz', 'https://motor.doonty.com/portal/abc');
    for (const t of ['Ana', 'Seat León (1234ABC)', 'Taller Ruiz', 'https://motor.doonty.com/portal/abc']) expect(m).toContain(t);
  });
  it('el presupuesto lleva además el número', () => {
    expect(mensajePresupuesto('Ana', 'X', 'Taller', 'OT-2026-101', 'https://e/n')).toContain('OT-2026-101');
  });
});

describe('mensajes de cita', () => {
  it('cuandoLargo escribe día y hora en hora de Madrid (también con horario de verano)', () => {
    expect(cuandoLargo('2026-11-17T09:00:00Z')).toBe('martes, 17 de noviembre a las 10:00');
    expect(cuandoLargo('2026-07-14T08:30:00Z')).toBe('martes, 14 de julio a las 10:30');
  });

  it('el taller confirma o avisa de que ha recibido la solicitud, y añade el enlace si lo hay', () => {
    const c = mensajeCita('Ana', 'Taller Ruiz', 'martes, 17 de noviembre a las 10:00', 'confirmada', 'https://motor.doonty.com/cita/abc');
    expect(c).toContain('Hola Ana, te confirmamos tu cita en Taller Ruiz: martes, 17 de noviembre a las 10:00.');
    expect(c).toContain('https://motor.doonty.com/cita/abc');
    const p = mensajeCita('Ana', 'Taller Ruiz', 'el martes', 'pendiente');
    expect(p).toContain('hemos recibido tu solicitud');
    expect(p).not.toContain('http');
  });

  it('el cliente escribe al taller, con o sin su nombre', () => {
    expect(mensajeCitaAlTaller('Ana García', 'Taller Ruiz', 'el martes')).toBe('Hola, soy Ana García. Te escribo por mi cita en Taller Ruiz: el martes.');
    expect(mensajeCitaAlTaller(null, 'Taller Ruiz', 'el martes')).toBe('Hola. Te escribo por mi cita en Taller Ruiz: el martes.');
  });

  it('el mensaje cabe en un enlace de WhatsApp', () => {
    const href = waHref('600 000 001', mensajeCita('Ana', 'Taller Ruiz', 'el martes', 'confirmada', 'https://x.es/cita/abc'));
    expect(href).toMatch(/^https:\/\/wa\.me\/34600000001\?text=Hola%20Ana/);
  });
});
