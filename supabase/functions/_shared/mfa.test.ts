import { assertEquals } from 'jsr:@std/assert@1';
import { aalDelToken, falta2Factor } from './mfa.ts';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (aal?: string) => `${b64({ alg: 'HS256' })}.${b64(aal ? { aal, sub: 'u' } : { sub: 'u' })}.firma`;

const admin = (factors: { status: string }[] | null, error: unknown = null) => ({
  auth: { admin: { mfa: { listFactors: () => Promise.resolve({ data: factors ? { factors } : null, error }) } } },
});

Deno.test('lee el aal del token y asume aal1 si falta o está mal formado', () => {
  assertEquals(aalDelToken(token('aal2')), 'aal2');
  assertEquals(aalDelToken(token('aal1')), 'aal1');
  assertEquals(aalDelToken(token()), 'aal1');
  assertEquals(aalDelToken('basura'), 'aal1');
  assertEquals(aalDelToken(''), 'aal1');
});

Deno.test('una sesión aal2 pasa sin consultar factores', async () => {
  const llamado = { n: 0 };
  const a = { auth: { admin: { mfa: { listFactors: () => { llamado.n++; return Promise.resolve({ data: null, error: null }); } } } } };
  assertEquals(await falta2Factor(a, token('aal2'), 'u'), false);
  assertEquals(llamado.n, 0);
});

Deno.test('aal1 sin factores verificados pasa; con uno verificado se rechaza', async () => {
  assertEquals(await falta2Factor(admin([]), token('aal1'), 'u'), false);
  assertEquals(await falta2Factor(admin([{ status: 'unverified' }]), token('aal1'), 'u'), false);
  assertEquals(await falta2Factor(admin([{ status: 'verified' }]), token('aal1'), 'u'), true);
  assertEquals(await falta2Factor(admin([{ status: 'unverified' }, { status: 'verified' }]), token(), 'u'), true);
});

Deno.test('si no se puede comprobar, se rechaza', async () => {
  assertEquals(await falta2Factor(admin(null, { message: 'caído' }), token('aal1'), 'u'), true);
});
