import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirCorreoSeguimiento, fechaLarga, puntosPendientesDe } from './logic.ts';

const EMP = { nombre: 'Talleres <Ruiz> & Hijos', brand_color: '#ff0000', logo_url: 'https://x/l.png', correo: 'a@b.es', telefono: '600' };

Deno.test('puntosPendientesDe limpia lo que llega de la base y pone lo urgente primero', () => {
  const r = puntosPendientesDe([
    { nombre: 'Neumático', categoria: 'Neumáticos', estado: 'atencion', nota: ' Desgaste ' },
    { nombre: 'Discos', categoria: 'Frenos', estado: 'urgente', nota: null },
    { nombre: 'Ya está bien', estado: 'bien' }, { nombre: 5, estado: 'urgente' }, null, 'texto',
  ]);
  assertEquals(r.map((p) => p.nombre), ['Discos', 'Neumático']);
  assertEquals(r[1].nota, 'Desgaste');
  assertEquals(puntosPendientesDe(null), []);
  assertEquals(puntosPendientesDe({}), []);
});

Deno.test('fechaLarga usa la fecha de Madrid', () => {
  assertEquals(fechaLarga('2026-11-14T10:00:00Z'), '14 de noviembre de 2026');
  assertEquals(fechaLarga('2026-11-14T23:30:00Z'), '15 de noviembre de 2026');
});

Deno.test('sin_responder: lleva el enlace al informe y NO lista puntos', () => {
  const { asunto, html } = construirCorreoSeguimiento('sin_responder', EMP, { nombre: 'Ana' }, 'Seat León (1234ABC)', [], 'https://motor.doonty.com/portal/abc', '2026-11-14T10:00:00Z');
  assertStringIncludes(asunto, 'pendiente');
  assertStringIncludes(html, 'href="https://motor.doonty.com/portal/abc"');
  assertStringIncludes(html, '14 de noviembre de 2026');
  assertStringIncludes(html, 'solo uno por informe');
});

Deno.test('pendientes: lista lo urgente y lo de atención con su nota y pide llamar o responder; sin botón', () => {
  const puntos = puntosPendientesDe([{ nombre: 'Discos delanteros', estado: 'urgente', nota: 'Rayados <b>' }, { nombre: 'Neumático delantero izq.', estado: 'atencion', nota: null }]);
  const { asunto, html } = construirCorreoSeguimiento('pendientes', EMP, { nombre: '<b>Ana</b>' }, 'Seat León (1234ABC)', puntos, null, '2026-10-14T10:00:00Z');
  assertEquals(asunto, 'Pendiente en tu Seat León (1234ABC): discos delanteros y 1 más');
  assertStringIncludes(html, 'Discos delanteros');
  assertStringIncludes(html, 'urgente');
  assertStringIncludes(html, 'Neumático delantero izq.');
  assertStringIncludes(html, 'llámanos o responde a este correo');
  assertStringIncludes(html, 'a@b.es · 600');
  assertEquals(html.includes('Ver el informe'), false);
});

Deno.test('todo lo que viene del taller, del cliente o del mecánico va escapado', () => {
  const puntos = puntosPendientesDe([{ nombre: '<script>x</script>', estado: 'urgente', nota: 'Nota <img src=x>' }]);
  const { html } = construirCorreoSeguimiento('pendientes', EMP, { nombre: '<b>Ana</b>' }, 'Coche <i>raro</i>', puntos, null, '2026-10-14T10:00:00Z');
  for (const peligro of ['<script>', '<img src=x>', '<b>Ana</b>', '<i>raro</i>']) assertEquals(html.includes(peligro), false, peligro);
  assertStringIncludes(html, 'Talleres &lt;Ruiz&gt; &amp; Hijos');
});

Deno.test('con más de 8 pendientes se resumen; color y logo inválidos se ignoran; sin_responder sin enlace cae en «pendientes»', () => {
  const muchos = puntosPendientesDe(Array.from({ length: 11 }, (_, i) => ({ nombre: `P${i}`, estado: 'atencion', nota: null })));
  const { html } = construirCorreoSeguimiento('pendientes', { nombre: 'T', brand_color: 'rojo', logo_url: 'http://inseguro/x.png' }, { nombre: 'A' }, 'X', muchos, null, '2026-10-14T10:00:00Z');
  assertStringIncludes(html, '…y 3 más.');
  assertEquals(html.includes('http://inseguro'), false);
  assertStringIncludes(html, '#2563eb');
  const sinEnlace = construirCorreoSeguimiento('sin_responder', EMP, { nombre: 'A' }, 'X', [], null, '2026-10-14T10:00:00Z');
  assertEquals(sinEnlace.html.includes('Ver el informe'), false);
});
