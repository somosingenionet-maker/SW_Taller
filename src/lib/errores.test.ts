import { describe, expect, it } from 'vitest';
import { mensajeDeError, mensajeSoloLectura, textoDeError } from './errores';

const MSG = 'Tu periodo de prueba o tu suscripción ha terminado. Puedes consultar y exportar tus datos, pero no modificarlos. Suscríbete desde el botón «Suscripción».';

describe('mensajeSoloLectura', () => {
  it('reconoce el error del servidor en un Error, un texto o un objeto con message', () => {
    expect(mensajeSoloLectura(new Error(MSG))).toBe(MSG);
    expect(mensajeSoloLectura(MSG)).toBe(MSG);
    expect(mensajeSoloLectura({ message: MSG })).toBe(MSG);
  });
  it('ignora cualquier otro error', () => {
    expect(mensajeSoloLectura(new Error('Failed to fetch'))).toBeNull();
    expect(mensajeSoloLectura(null)).toBeNull();
    expect(mensajeSoloLectura(undefined)).toBeNull();
    expect(mensajeSoloLectura(42)).toBeNull();
    expect(mensajeSoloLectura({})).toBeNull();
  });
});

describe('mensajeDeError', () => {
  const QUE = 'No se pudo guardar el vehículo.';
  it('enseña tal cual los mensajes escritos por nosotros', () => {
    expect(mensajeDeError(new Error('Ya tienes un vehículo registrado con esa matrícula.'), QUE)).toBe('Ya tienes un vehículo registrado con esa matrícula.');
    expect(mensajeDeError(new Error(MSG), QUE)).toBe(MSG);
  });
  it('si no hay texto, usa la frase de la pantalla', () => {
    expect(mensajeDeError(null, QUE)).toBe(QUE);
    expect(mensajeDeError({}, QUE)).toBe(QUE);
    expect(mensajeDeError(new Error('  '), QUE)).toBe(QUE);
  });
  it('explica la falta de conexión', () => {
    const m = mensajeDeError(new TypeError('Failed to fetch'), QUE);
    expect(m.startsWith(QUE)).toBe(true);
    expect(m).toContain('No hay conexión');
    expect(m).not.toContain('Failed to fetch');
  });
  it('los errores técnicos van detrás de la frase, como detalle', () => {
    const m = mensajeDeError({ message: 'duplicate key value violates unique constraint "x"' }, QUE);
    expect(m.startsWith(QUE)).toBe(true);
    expect(m).toContain('Detalle: duplicate key');
  });
  it('textoDeError admite Error, texto y objeto', () => {
    expect(textoDeError(new Error('a'))).toBe('a');
    expect(textoDeError('b')).toBe('b');
    expect(textoDeError({ message: 'c' })).toBe('c');
    expect(textoDeError(7)).toBe('');
  });
});
