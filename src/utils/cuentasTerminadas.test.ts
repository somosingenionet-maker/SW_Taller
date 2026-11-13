import { describe, expect, it } from 'vitest';
import { situacionCuenta } from './cuentasTerminadas';

const base = { retencion: null, aviso1En: null, aviso2En: null, borradoPrevistoEn: null };

describe('situacionCuenta', () => {
  it('una cuenta con facturas emitidas figura como retenida', () => {
    expect(situacionCuenta({ ...base, retencion: 'facturas_emitidas' })).toMatchObject({ tono: 'retenida' });
  });
  it('una suscripción activa figura como retenida', () => {
    expect(situacionCuenta({ ...base, retencion: 'suscripcion_activa' }).texto).toMatch(/Stripe/);
  });
  it('la retención manda sobre los avisos', () => {
    expect(situacionCuenta({ ...base, retencion: 'facturas_emitidas', aviso1En: '2026-01-01', aviso2En: '2026-02-01' }).tono).toBe('retenida');
  });
  it('distingue sin avisar, primer aviso y último aviso', () => {
    expect(situacionCuenta(base).texto).toBe('Sin avisar todavía');
    expect(situacionCuenta({ ...base, aviso1En: '2026-01-01' }).texto).toBe('Primer aviso enviado');
    expect(situacionCuenta({ ...base, aviso1En: '2026-01-01', aviso2En: '2026-02-01' }).texto).toBe('Último aviso enviado');
  });
});
