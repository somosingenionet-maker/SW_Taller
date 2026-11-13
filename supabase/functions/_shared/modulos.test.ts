import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { mensajeSinModulo, perfilTieneModulo } from './modulos.ts';

Deno.test('un administrador tiene todos los módulos, aunque su lista no los incluya', () => {
  assertEquals(perfilTieneModulo({ rol: 'admin', modulos: [], activo: true }, 'facturas'), true);
  assertEquals(perfilTieneModulo({ rol: 'super_admin', modulos: null, activo: true }, 'alertas'), true);
});

Deno.test('un usuario normal solo tiene los módulos de su lista', () => {
  const p = { rol: 'usuario', modulos: ['taller', 'citas'], activo: true };
  assertEquals(perfilTieneModulo(p, 'taller'), true);
  assertEquals(perfilTieneModulo(p, 'citas'), true);
  assertEquals(perfilTieneModulo(p, 'facturas'), false);
  assertEquals(perfilTieneModulo(p, 'alertas'), false);
});

Deno.test('un usuario inactivo, sin perfil o con la lista rota no tiene ninguno', () => {
  assertEquals(perfilTieneModulo({ rol: 'admin', modulos: ['facturas'], activo: false }, 'facturas'), false);
  assertEquals(perfilTieneModulo(null, 'facturas'), false);
  assertEquals(perfilTieneModulo(undefined, 'facturas'), false);
  assertEquals(perfilTieneModulo({ rol: 'usuario', modulos: null, activo: true }, 'facturas'), false);
});

Deno.test('el nombre del módulo no se confunde con otro parecido', () => {
  assertEquals(perfilTieneModulo({ rol: 'usuario', modulos: ['facturas-extra'], activo: true }, 'facturas'), false);
});

Deno.test('el mensaje dice qué módulo falta y qué hacer', () => {
  assertStringIncludes(mensajeSinModulo('Facturas'), 'módulo Facturas');
  assertStringIncludes(mensajeSinModulo('Facturas'), 'administrador');
});
