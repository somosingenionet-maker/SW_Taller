import { describe, it, expect } from 'vitest';
import * as app from './sistemaInformatico';
import * as servidor from '../../supabase/functions/_shared/sistemaInformatico';

// El servidor envía a la AEAT estos datos en cada registro y la app los muestra
// en la Declaración Responsable: si divergen, la declaración mentiría sobre lo
// que realmente se está enviando.
describe('sistemaInformatico: la copia de la app y la del servidor coinciden', () => {
  it('productor', () => expect(app.PRODUCTOR).toEqual(servidor.PRODUCTOR));
  it('sistema', () => expect(app.SISTEMA).toEqual(servidor.SISTEMA));
  it('productorCompleto / declaracionCompleta dan lo mismo', () => {
    expect(app.productorCompleto()).toBe(servidor.productorCompleto());
    expect(app.declaracionCompleta()).toBe(servidor.declaracionCompleta());
  });
});

describe('sistemaInformatico: valores que exige la AEAT', () => {
  it('el código del sistema tiene exactamente 2 caracteres alfanuméricos', () => {
    expect(app.SISTEMA.id).toMatch(/^[A-Za-z0-9]{2}$/);
  });
  it('el nombre del sistema cabe en 30 caracteres y la versión en 50', () => {
    expect(app.SISTEMA.nombre.length).toBeLessThanOrEqual(30);
    expect(app.SISTEMA.version.length).toBeLessThanOrEqual(50);
  });
  it('el NIF del productor tiene 9 caracteres (el envío a la AEAT lo exige)', () => {
    expect(app.PRODUCTOR.nif).toMatch(/^[A-Z0-9]{9}$/);
    expect(app.productorCompleto()).toBe(true);
  });
  it('solo VERI*FACTU y multi-obligado, como declara la modalidad elegida', () => {
    expect(app.SISTEMA.soloVerifactu).toBe('S');
    expect(app.SISTEMA.multiOT).toBe('S');
  });
});
