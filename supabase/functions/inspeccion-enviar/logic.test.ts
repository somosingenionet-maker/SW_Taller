import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirCorreoInforme, motivoNoEnviable } from './logic.ts';

const U = { estado: 'urgente', precio: 64 } as const;

Deno.test('motivoNoEnviable: solo una terminada, con puntos marcados y precio en lo urgente', () => {
  assertEquals(motivoNoEnviable('terminada', [U, { estado: 'bien', precio: null }]), null);
  assertEquals(motivoNoEnviable('borrador', [U]), 'El mecánico aún no ha terminado la inspección.');
  assertEquals(motivoNoEnviable('enviada', [U]), 'Esta inspección ya se envió al cliente.');
  assertEquals(motivoNoEnviable('respondida', [U]), 'Esta inspección ya se envió al cliente.');
  assertEquals(motivoNoEnviable('terminada', [{ estado: null, precio: null }]), 'La inspección no tiene ningún punto marcado.');
  assertEquals(motivoNoEnviable('terminada', [{ estado: 'urgente', precio: null }]), 'Falta el precio de 1 punto urgente. Ponlo antes de enviar.');
  assertEquals(motivoNoEnviable('terminada', [{ estado: 'urgente', precio: 0 }, { estado: 'urgente', precio: null }]), 'Falta el precio de 2 puntos urgentes. Ponlo antes de enviar.');
  // la atención sin precio no bloquea
  assertEquals(motivoNoEnviable('terminada', [{ estado: 'atencion', precio: null }]), null);
});

Deno.test('el correo lleva el enlace, el resumen y escapa todo lo que viene del taller o del cliente', () => {
  const { asunto, html } = construirCorreoInforme(
    { nombre: 'Talleres <Ruiz> & Hijos', brand_color: '#ff0000', logo_url: 'https://x/logo.png', correo: 'a@b.es', telefono: '600' },
    { nombre: '<b>Ana</b>' }, 'Seat León (1234ABC)', { urgente: 2, atencion: 1, bien: 20 }, 'https://motor.doonty.com/portal/abc',
  );
  assertStringIncludes(asunto, 'hay 2 puntos urgentes');
  assertStringIncludes(html, 'href="https://motor.doonty.com/portal/abc"');
  assertStringIncludes(html, '2 puntos urgentes y 1 que requiere atención');
  assertStringIncludes(html, 'aprobar o rechazar');
  assertEquals(html.includes('<b>Ana</b>'), false);
  assertStringIncludes(html, '&lt;b&gt;Ana&lt;/b&gt;');
  assertStringIncludes(html, 'Talleres &lt;Ruiz&gt; &amp; Hijos');
  assertStringIncludes(html, 'a@b.es · 600');
});

Deno.test('sin urgentes no se pide aprobar; sin problemas dice que todo está bien; color o logo inválidos se ignoran', () => {
  const sin = construirCorreoInforme({ nombre: 'T', brand_color: 'rojo', logo_url: 'http://inseguro/x.png' }, { nombre: 'A' }, 'X', { urgente: 0, atencion: 1, bien: 5 }, 'https://e/n');
  assertEquals(sin.asunto, 'Inspección de tu X');
  assertEquals(sin.html.includes('aprobar o rechazar'), false);
  assertEquals(sin.html.includes('http://inseguro'), false);
  assertStringIncludes(sin.html, '#2563eb');
  const bien = construirCorreoInforme({ nombre: 'T' }, { nombre: 'A' }, 'X', { urgente: 0, atencion: 0, bien: 28 }, 'https://e/n');
  assertStringIncludes(bien.html, 'Todo está en buen estado.');
});
