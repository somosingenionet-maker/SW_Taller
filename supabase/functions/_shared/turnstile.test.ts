import { assertEquals } from 'jsr:@std/assert@1';
import { verificarTurnstile } from './turnstile.ts';

const responde = (cuerpo: unknown, ok = true) => (() => Promise.resolve(new Response(JSON.stringify(cuerpo), { status: ok ? 200 : 500 }))) as unknown as typeof fetch;

Deno.test('turnstile: solo pasa con success true', async () => {
  assertEquals(await verificarTurnstile('tok', '1.2.3.4', 'secreto', responde({ success: true })), true);
  assertEquals(await verificarTurnstile('tok', '1.2.3.4', 'secreto', responde({ success: false })), false);
  assertEquals(await verificarTurnstile('tok', null, 'secreto', responde({})), false);
  assertEquals(await verificarTurnstile('tok', null, 'secreto', responde({ success: 'true' })), false);
});

Deno.test('turnstile falla cerrado: sin clave, sin token, token enorme, error de red o de servidor', async () => {
  assertEquals(await verificarTurnstile('tok', null, undefined, responde({ success: true })), false);
  assertEquals(await verificarTurnstile('tok', null, '', responde({ success: true })), false);
  assertEquals(await verificarTurnstile('', null, 's', responde({ success: true })), false);
  assertEquals(await verificarTurnstile(undefined, null, 's', responde({ success: true })), false);
  assertEquals(await verificarTurnstile(123, null, 's', responde({ success: true })), false);
  assertEquals(await verificarTurnstile('x'.repeat(2049), null, 's', responde({ success: true })), false);
  assertEquals(await verificarTurnstile('tok', null, 's', (() => Promise.reject(new Error('red'))) as unknown as typeof fetch), false);
  assertEquals(await verificarTurnstile('tok', null, 's', responde({ success: true }, false)), false);
});

Deno.test('turnstile envía la clave, el token y la IP a Cloudflare', async () => {
  let visto: { url: string; cuerpo: string } | null = null;
  const espia = ((url: string, init?: RequestInit) => { visto = { url, cuerpo: String(init?.body) }; return Promise.resolve(new Response(JSON.stringify({ success: true }))); }) as unknown as typeof fetch;
  await verificarTurnstile('mi-token', '9.9.9.9', 'mi-secreto', espia);
  assertEquals(visto!.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assertEquals(visto!.cuerpo, 'secret=mi-secreto&response=mi-token&remoteip=9.9.9.9');
});
