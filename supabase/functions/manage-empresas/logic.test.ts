import { assertEquals } from 'jsr:@std/assert@1';
import { errorPassword, esSuperAdmin } from './logic.ts';

// -------- errorPassword --------
Deno.test('errorPassword: acepta una contraseña que cumple las 4 reglas', () => {
  assertEquals(errorPassword('Abcdef12'), null);
});

Deno.test('errorPassword: rechaza menos de 8 caracteres', () => {
  assertEquals(errorPassword('Ab1defg'), 'La contraseña debe tener al menos 8 caracteres.');
});

Deno.test('errorPassword: exige al menos una mayúscula', () => {
  assertEquals(errorPassword('abcdefg1'), 'La contraseña debe incluir al menos una mayúscula.');
});

Deno.test('errorPassword: exige al menos una minúscula', () => {
  assertEquals(errorPassword('ABCDEFG1'), 'La contraseña debe incluir al menos una minúscula.');
});

Deno.test('errorPassword: exige al menos un número', () => {
  assertEquals(errorPassword('Abcdefgh'), 'La contraseña debe incluir al menos un número.');
});

// -------- esSuperAdmin --------
// Única puerta de autorización de esta función (crea/borra tenants enteros):
// un fallo aquí dejaría que cualquier admin de taller gestionara otros tenants.
Deno.test('esSuperAdmin: true solo para el rol exacto "super_admin"', () => {
  assertEquals(esSuperAdmin('super_admin'), true);
});

Deno.test('esSuperAdmin: false para admin de taller normal', () => {
  assertEquals(esSuperAdmin('admin'), false);
});

Deno.test('esSuperAdmin: false cuando no hay perfil (null/undefined)', () => {
  assertEquals(esSuperAdmin(null), false);
  assertEquals(esSuperAdmin(undefined), false);
});
