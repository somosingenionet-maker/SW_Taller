import { assertEquals } from 'jsr:@std/assert@1';
import { esCorreoYaRegistrado, validarRegistro } from './logic.ts';

const base = { nombreTaller: 'Taller Pepe', nombre: 'Pepe Gil', email: 'Pepe@Taller.es', aceptaTerminos: true };

Deno.test('alta válida: normaliza correo, espacios y NIF', () => {
  assertEquals(validarRegistro({ ...base, nombreTaller: '  Taller   Pepe  ', nif: ' b-1234 5678 ' }),
    { ok: true, datos: { nombreTaller: 'Taller Pepe', nombre: 'Pepe Gil', email: 'pepe@taller.es', nif: 'B12345678' } });
});

Deno.test('el NIF es opcional', () => {
  assertEquals((validarRegistro(base) as { ok: true; datos: { nif: string } }).datos.nif, '');
});

Deno.test('rechaza datos incompletos o inválidos', () => {
  const err = (o: Record<string, unknown>) => (validarRegistro({ ...base, ...o }) as { error?: string }).error;
  assertEquals(typeof err({ nombreTaller: 'A' }), 'string');
  assertEquals(typeof err({ nombreTaller: 'x'.repeat(81) }), 'string');
  assertEquals(typeof err({ nombre: '' }), 'string');
  assertEquals(typeof err({ email: 'no-es-correo' }), 'string');
  assertEquals(typeof err({ email: 'a@b' }), 'string');
  assertEquals(typeof err({ email: `${'a'.repeat(250)}@x.es` }), 'string');
  assertEquals(typeof err({ nif: '12' }), 'string');
  assertEquals(typeof err({ nif: 'B1234<script>' }), 'string');
});

Deno.test('sin aceptar los términos (o con un valor que no sea true) no se registra', () => {
  for (const v of [false, undefined, 'true', 1, 'on']) {
    assertEquals((validarRegistro({ ...base, aceptaTerminos: v }) as { ok: boolean }).ok, false);
  }
});

Deno.test('el campo señuelo rellenado se detecta como bot', () => {
  assertEquals(validarRegistro({ ...base, web: 'http://spam.example' }), { ok: false, trampa: true });
  assertEquals((validarRegistro({ ...base, web: '   ' }) as { ok: boolean }).ok, true);
});

Deno.test('entradas raras no lanzan', () => {
  assertEquals((validarRegistro({}) as { ok: boolean }).ok, false);
  assertEquals((validarRegistro({ nombreTaller: {}, nombre: [], email: null, aceptaTerminos: true }) as { ok: boolean }).ok, false);
});

Deno.test('detecta «correo ya registrado»', () => {
  assertEquals(esCorreoYaRegistrado({ code: 'email_exists' }), true);
  assertEquals(esCorreoYaRegistrado({ status: 422 }), true);
  assertEquals(esCorreoYaRegistrado({ message: 'A user with this email address has already been registered' }), true);
  assertEquals(esCorreoYaRegistrado({ status: 500, message: 'database error' }), false);
});
