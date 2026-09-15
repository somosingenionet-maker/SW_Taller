import { assertEquals } from 'jsr:@std/assert@1';
import { extraerIp } from './rateLimit.ts';

Deno.test('extraerIp: toma la IP tal cual cuando solo hay una', () => {
  assertEquals(extraerIp('203.0.113.5'), '203.0.113.5');
});

Deno.test('extraerIp: toma la primera IP de una cadena de proxies', () => {
  assertEquals(extraerIp('203.0.113.5, 10.0.0.1, 10.0.0.2'), '203.0.113.5');
});

Deno.test('extraerIp: recorta espacios alrededor de la IP', () => {
  assertEquals(extraerIp(' 203.0.113.5 , 10.0.0.1'), '203.0.113.5');
});

Deno.test('extraerIp: devuelve un valor por defecto cuando no hay header', () => {
  assertEquals(extraerIp(null), 'desconocida');
});

Deno.test('extraerIp: devuelve el valor por defecto para una cadena vacía', () => {
  assertEquals(extraerIp(''), 'desconocida');
});
