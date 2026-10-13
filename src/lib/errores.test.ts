import { describe, expect, it } from 'vitest';
import { mensajeSoloLectura } from './errores';

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
