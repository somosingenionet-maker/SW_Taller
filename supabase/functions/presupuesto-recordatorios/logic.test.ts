import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirCorreoRecordatorioPresupuesto, MAX_RECORDATORIOS } from './logic.ts';

const empresa = { nombre: 'Talleres <Ruiz> & Hijos', brand_color: '#ff0000', logo_url: 'https://x/l.png', correo: 'a@b.es', telefono: '600' };

Deno.test('como mucho dos recordatorios por envío', () => {
  assertEquals(MAX_RECORDATORIOS, 2);
});

Deno.test('el primer aviso lleva número, importe con coma, fecha y enlace, y escapa lo que viene de fuera', () => {
  const { asunto, html } = construirCorreoRecordatorioPresupuesto(1, empresa, { nombre: '<b>Ana</b>' }, 'Seat León (1234ABC)', 'OT-2026-101', 123.4,
    'https://motor.doonty.com/portal/abc', '2026-11-14T10:00:00Z');
  assertStringIncludes(asunto, 'OT-2026-101');
  assertStringIncludes(asunto, 'pendiente de respuesta');
  assertStringIncludes(html, '123,40 €');
  assertStringIncludes(html, '14 de noviembre de 2026');
  assertStringIncludes(html, 'href="https://motor.doonty.com/portal/abc"');
  assertStringIncludes(html, 'Talleres &lt;Ruiz&gt; &amp; Hijos');
  assertEquals(html.includes('<b>Ana</b>'), false);
  assertEquals(html.includes('Último aviso'), false);
});

Deno.test('el segundo aviso es el último y ofrece rechazarlo para cerrarlo', () => {
  const { asunto, html } = construirCorreoRecordatorioPresupuesto(2, empresa, { nombre: 'Ana' }, 'Seat León (1234ABC)', 'OT-2026-101', 50,
    'https://motor.doonty.com/portal/abc', '2026-11-14T10:00:00Z');
  assertStringIncludes(asunto, 'Último aviso');
  assertStringIncludes(html, 'recházalo');
  assertStringIncludes(html, 'como mucho dos por presupuesto');
});

Deno.test('un color o un logo inválidos se ignoran', () => {
  const { html } = construirCorreoRecordatorioPresupuesto(1, { nombre: 'T', brand_color: 'rojo', logo_url: 'http://inseguro/x.png' }, { nombre: 'A' }, 'X', 'OT-1', 1, 'https://e/n', '2026-11-14T10:00:00Z');
  assertEquals(html.includes('http://inseguro'), false);
  assertStringIncludes(html, '#2563eb');
});
