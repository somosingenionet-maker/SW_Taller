import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { ErrorCertificado, leerP12, nifDelSujeto } from './certificado.ts';
import { base64ABytes, bytesABase64, cifrar, cifrarTexto, descifrar, descifrarTexto } from './cifrado.ts';
import { P12_LEGACY_B64, P12_MODERNO_B64, P12_PASSWORD } from './certificado.fixtures.ts';

// -------- leerP12 --------
for (const [nombre, b64] of [['moderno (AES, OpenSSL 3)', P12_MODERNO_B64], ['antiguo (3DES)', P12_LEGACY_B64]] as const) {
  Deno.test(`leerP12: lee un .p12 ${nombre} y extrae titular, NIF, vigencia y PEM`, () => {
    const c = leerP12(base64ABytes(b64), P12_PASSWORD);
    assertEquals(c.titularNif, '12345678Z');
    assertEquals(c.titularNombre, 'PEREZ GARCIA ANA');
    assert(c.validoHasta > new Date());
    assert(c.validoDesde <= new Date());
    assert(c.certPem.includes('BEGIN CERTIFICATE'));
    assert(c.keyPem.includes('PRIVATE KEY'));
  });
}

Deno.test('leerP12: contraseña incorrecta', () => {
  const e = assertThrows(() => leerP12(base64ABytes(P12_MODERNO_B64), 'mala'), ErrorCertificado);
  assertEquals(e.message, 'La contraseña del certificado no es correcta.');
});

Deno.test('leerP12: un archivo que no es un certificado', () => {
  const e = assertThrows(() => leerP12(new Uint8Array([1, 2, 3, 4]), 'x'), ErrorCertificado);
  assert(e.message.includes('PKCS#12'));
});

Deno.test('leerP12: certificado caducado', () => {
  const futuro = new Date(Date.now() + 25 * 365 * 24 * 3600 * 1000);
  const e = assertThrows(() => leerP12(base64ABytes(P12_MODERNO_B64), P12_PASSWORD, futuro), ErrorCertificado);
  assertEquals(e.message, 'El certificado ha caducado.');
});

Deno.test('leerP12: certificado que todavía no es válido', () => {
  const pasado = new Date('2000-01-01');
  const e = assertThrows(() => leerP12(base64ABytes(P12_MODERNO_B64), P12_PASSWORD, pasado), ErrorCertificado);
  assertEquals(e.message, 'El certificado todavía no es válido.');
});

// -------- nifDelSujeto --------
Deno.test('nifDelSujeto: formatos habituales de certificados españoles', () => {
  assertEquals(nifDelSujeto([null, null, 'GARCIA PEREZ ANA - NIF 12345678Z']), '12345678Z');
  assertEquals(nifDelSujeto(['IDCES-12345678Z']), '12345678Z');
  assertEquals(nifDelSujeto([null, 'VATES-B89419102']), 'B89419102');
  assertEquals(nifDelSujeto(['ENTIDAD SL - CIF B89419102 - REPRESENTANTE X']), 'B89419102');
  assertEquals(nifDelSujeto(['idces-12345678z']), '12345678Z');
});

Deno.test('nifDelSujeto: sin NIF reconocible devuelve null (no inventa)', () => {
  assertEquals(nifDelSujeto([null, null, null]), null);
  assertEquals(nifDelSujeto(['Certificado de pruebas']), null);
});

// -------- cifrado --------
const CLAVE = bytesABase64(crypto.getRandomValues(new Uint8Array(32)));

Deno.test('cifrar/descifrar: ida y vuelta idéntica, incluidos binarios', async () => {
  const datos = base64ABytes(P12_LEGACY_B64);
  const vuelta = await descifrar(await cifrar(datos, CLAVE), CLAVE);
  assertEquals(vuelta, datos);
});

Deno.test('cifrarTexto/descifrarTexto: texto con tildes y símbolos', async () => {
  const t = 'contraseña con ñ, tildes é y símbolos €&<>';
  assertEquals(await descifrarTexto(await cifrarTexto(t, CLAVE), CLAVE), t);
});

Deno.test('cifrar: el mismo dato cifrado dos veces da resultados distintos (IV aleatorio) y no contiene el original', async () => {
  const datos = new TextEncoder().encode('dato secreto muy reconocible');
  const a = await cifrar(datos, CLAVE);
  const b = await cifrar(datos, CLAVE);
  assertNotEquals(a, b);
  assert(!atob(a).includes('secreto'));
});

Deno.test('descifrar: con otra clave falla', async () => {
  const otra = bytesABase64(crypto.getRandomValues(new Uint8Array(32)));
  await assertRejects(async () => descifrar(await cifrar(new Uint8Array([1, 2, 3]), CLAVE), otra));
});

Deno.test('descifrar: si el dato cifrado se altera, falla (GCM autentica)', async () => {
  const bytes = base64ABytes(await cifrar(new Uint8Array([1, 2, 3, 4, 5]), CLAVE));
  bytes[bytes.length - 1] ^= 0xff;
  await assertRejects(async () => descifrar(bytesABase64(bytes), CLAVE));
});

Deno.test('cifrar: rechaza una clave que no es de 32 bytes', async () => {
  await assertRejects(
    async () => cifrar(new Uint8Array([1]), bytesABase64(new Uint8Array(16))),
    Error,
    '32 bytes',
  );
});
