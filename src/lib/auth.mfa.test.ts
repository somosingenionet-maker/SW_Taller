import { describe, expect, it, vi } from 'vitest';

// auth.ts importa el cliente de Supabase, que exige variables de entorno: aquí solo se prueban funciones puras.
vi.mock('./supabase', () => ({ supabase: {} }));
const { aalDelToken, mfaPendiente, qrComoImagen } = await import('./auth');

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (aal?: string) => `${b64({ alg: 'HS256' })}.${b64(aal ? { aal } : {})}.firma`;
const sesion = (aal: string | undefined, factors: { status: string; factor_type: string }[] | undefined) =>
  ({ access_token: token(aal), user: { factors } }) as never;

describe('aalDelToken', () => {
  it('lee el nivel y asume aal1 si falta o el token está mal formado', () => {
    expect(aalDelToken(token('aal2'))).toBe('aal2');
    expect(aalDelToken(token('aal1'))).toBe('aal1');
    expect(aalDelToken(token())).toBe('aal1');
    expect(aalDelToken('no-es-un-jwt')).toBe('aal1');
  });
});

describe('mfaPendiente', () => {
  const verificado = [{ status: 'verified', factor_type: 'totp' }];
  it('no hay sesión → no pendiente', () => expect(mfaPendiente(null)).toBe(false));
  it('sin factores → no pendiente', () => {
    expect(mfaPendiente(sesion('aal1', undefined))).toBe(false);
    expect(mfaPendiente(sesion('aal1', []))).toBe(false);
  });
  it('un factor sin verificar no cuenta', () => expect(mfaPendiente(sesion('aal1', [{ status: 'unverified', factor_type: 'totp' }]))).toBe(false));
  it('factor verificado y solo contraseña → pendiente', () => {
    expect(mfaPendiente(sesion('aal1', verificado))).toBe(true);
    expect(mfaPendiente(sesion(undefined, verificado))).toBe(true);
  });
  it('factor verificado y sesión ya verificada → no pendiente', () => expect(mfaPendiente(sesion('aal2', verificado))).toBe(false));
});

describe('qrComoImagen', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#000000"/></svg>';
  it('quita el prefijo del cliente y codifica el SVG (con # no se rompe)', () => {
    const r = qrComoImagen(`data:image/svg+xml;utf-8,${svg}`);
    expect(r.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(r).not.toContain('#');
    expect(decodeURIComponent(r.split(',')[1])).toBe(svg);
  });
  it('acepta también un SVG sin prefijo', () => expect(decodeURIComponent(qrComoImagen(svg).split(',')[1])).toBe(svg));
});
