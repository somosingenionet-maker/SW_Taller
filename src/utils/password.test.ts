import { describe, it, expect } from 'vitest';
import { validarPassword, validarCambioPassword } from './password';

describe('validarPassword', () => {
  it('rechaza contraseñas de menos de 8 caracteres', () => {
    expect(validarPassword('Abc123')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('acepta exactamente 8 caracteres si cumple el resto de reglas', () => {
    expect(validarPassword('Abcdefg1')).toBeNull();
  });

  it('exige al menos una mayúscula', () => {
    expect(validarPassword('abcdefg1')).toBe('La contraseña debe incluir al menos una mayúscula.');
  });

  it('exige al menos una minúscula', () => {
    expect(validarPassword('ABCDEFG1')).toBe('La contraseña debe incluir al menos una minúscula.');
  });

  it('exige al menos un número', () => {
    expect(validarPassword('Abcdefgh')).toBe('La contraseña debe incluir al menos un número.');
  });

  it('acepta una contraseña que cumple todas las reglas', () => {
    expect(validarPassword('Doonty2026!')).toBeNull();
  });

  it('comprueba la longitud antes que el resto de reglas', () => {
    // Corta y sin nada más — el mensaje debe ser el de longitud, no otro.
    expect(validarPassword('a')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('rechaza una cadena vacía', () => {
    expect(validarPassword('')).toBe('La contraseña debe tener al menos 8 caracteres.');
  });
});

describe('validarCambioPassword', () => {
  const ok = { actual: 'Vieja123', nueva: 'Nueva1234', repetir: 'Nueva1234' };
  it('acepta un cambio correcto', () => expect(validarCambioPassword(ok)).toBeNull());
  it('pide la contraseña actual', () => expect(validarCambioPassword({ ...ok, actual: '' })).toBe('Escribe tu contraseña actual.'));
  it('aplica a la nueva la misma política que al resto de contraseñas', () => {
    expect(validarCambioPassword({ ...ok, nueva: 'corta1A', repetir: 'corta1A' })).toBe('La nueva contraseña debe tener al menos 8 caracteres.');
    expect(validarCambioPassword({ ...ok, nueva: 'sinmayuscula1', repetir: 'sinmayuscula1' })).toContain('mayúscula');
  });
  it('la nueva no puede ser igual a la actual', () => {
    expect(validarCambioPassword({ actual: 'Vieja123', nueva: 'Vieja123', repetir: 'Vieja123' })).toBe('La nueva contraseña debe ser distinta de la actual.');
  });
  it('las dos nuevas deben coincidir', () => {
    expect(validarCambioPassword({ ...ok, repetir: 'Nueva12345' })).toBe('Las contraseñas nuevas no coinciden.');
  });
});
