import { describe, expect, it } from 'vitest';
import { mensajeInforme, mensajePresupuesto, waHref } from './whatsapp';

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
