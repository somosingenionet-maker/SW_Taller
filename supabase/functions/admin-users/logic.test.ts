import { assertEquals } from 'jsr:@std/assert@1';
import { errorPassword, esRolAdmin, puedeGestionarEmpresa, esUltimoAdminDeEmpresa } from './logic.ts';

// -------- errorPassword --------
Deno.test('errorPassword: acepta una contraseña que cumple las 4 reglas', () => {
  assertEquals(errorPassword('Abcdef12'), null);
});

Deno.test('errorPassword: rechaza menos de 8 caracteres', () => {
  assertEquals(errorPassword('Ab1defg'), 'La contraseña debe tener al menos 8 caracteres.');
});

Deno.test('errorPassword: exige mayúscula, minúscula y número', () => {
  assertEquals(errorPassword('abcdefg1') !== null, true);
  assertEquals(errorPassword('ABCDEFG1') !== null, true);
  assertEquals(errorPassword('Abcdefgh') !== null, true);
});

// -------- esRolAdmin --------
Deno.test('esRolAdmin: admin y super_admin pasan, usuario normal no', () => {
  assertEquals(esRolAdmin('admin'), true);
  assertEquals(esRolAdmin('super_admin'), true);
  assertEquals(esRolAdmin('usuario'), false);
  assertEquals(esRolAdmin(null), false);
  assertEquals(esRolAdmin(undefined), false);
});

// -------- puedeGestionarEmpresa --------
// El control que impide que un admin de un taller toque usuarios de OTRO
// taller — un fallo aquí es una fuga de gestión de cuentas entre tenants.
Deno.test('puedeGestionarEmpresa: un admin normal solo puede gestionar su propia empresa', () => {
  assertEquals(puedeGestionarEmpresa(false, 'emp-1', 'emp-1'), true);
  assertEquals(puedeGestionarEmpresa(false, 'emp-1', 'emp-2'), false);
});

Deno.test('puedeGestionarEmpresa: el super_admin puede gestionar cualquier empresa', () => {
  assertEquals(puedeGestionarEmpresa(true, 'emp-1', 'emp-2'), true);
  assertEquals(puedeGestionarEmpresa(true, null, 'emp-2'), true);
});

// -------- esUltimoAdminDeEmpresa --------
Deno.test('esUltimoAdminDeEmpresa: true cuando no queda ningún otro admin (0 o null)', () => {
  assertEquals(esUltimoAdminDeEmpresa(0), true);
  assertEquals(esUltimoAdminDeEmpresa(null), true);
});

Deno.test('esUltimoAdminDeEmpresa: false cuando queda al menos otro admin', () => {
  assertEquals(esUltimoAdminDeEmpresa(1), false);
  assertEquals(esUltimoAdminDeEmpresa(3), false);
});
