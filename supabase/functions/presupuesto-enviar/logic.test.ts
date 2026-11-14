import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirCorreoPresupuesto, motivoNoEnviable } from './logic.ts';

const base = { estado: 'presupuesto', total: 123.4, presupuesto_aprobado: null, aceptacion_presupuesto_en: null };

Deno.test('motivoNoEnviable: solo un presupuesto con importe, sin aceptar', () => {
  assertEquals(motivoNoEnviable(base), null);
  assertEquals(motivoNoEnviable({ ...base, presupuesto_aprobado: false }), null);   // rechazado antes: se puede reenviar corregido
  assertEquals(motivoNoEnviable({ ...base, aceptacion_presupuesto_en: '2026-11-14T10:00:00Z', presupuesto_aprobado: true }), 'El cliente ya aceptó este presupuesto.');
  assertEquals(motivoNoEnviable({ ...base, presupuesto_aprobado: true }), 'El cliente ya aprobó este presupuesto.');
  assertEquals(motivoNoEnviable({ ...base, estado: 'recibido' }), 'Solo se envía el presupuesto de una orden que aún está en estado Presupuesto.');
  assertEquals(motivoNoEnviable({ ...base, total: 0 }), 'El presupuesto no tiene importe: añade líneas antes de enviarlo.');
});

Deno.test('el correo lleva las líneas, el total con coma, el enlace, y escapa lo que viene del taller o del cliente', () => {
  const { asunto, html } = construirCorreoPresupuesto(
    { nombre: 'Talleres <Ruiz> & Hijos', brand_color: '#ff0000', logo_url: 'https://x/l.png', correo: 'a@b.es', telefono: '600' },
    { nombre: '<b>Ana</b>' }, 'Seat León (1234ABC)', 'OT-2026-101',
    [{ descripcion: 'Pastillas <delanteras>', cantidad: 1, subtotal: 64 }, { descripcion: 'Líquido', cantidad: 2, subtotal: 38.5 }],
    123.4, 'https://motor.doonty.com/portal/abc');
  assertStringIncludes(asunto, 'OT-2026-101');
  assertStringIncludes(html, 'href="https://motor.doonty.com/portal/abc"');
  assertStringIncludes(html, '123,40 €');
  assertStringIncludes(html, '64,00 €');
  assertStringIncludes(html, 'Líquido × 2');
  assertEquals(html.includes('<b>Ana</b>'), false);
  assertEquals(html.includes('<delanteras>'), false);
  assertStringIncludes(html, 'Pastillas &lt;delanteras&gt;');
  assertStringIncludes(html, 'Talleres &lt;Ruiz&gt; &amp; Hijos');
});

Deno.test('con muchas líneas se resumen, y un color o logo inválidos se ignoran', () => {
  const lineas = Array.from({ length: 11 }, (_, i) => ({ descripcion: `L${i}`, cantidad: 1, subtotal: 1 }));
  const { html } = construirCorreoPresupuesto({ nombre: 'T', brand_color: 'rojo', logo_url: 'http://inseguro/x.png' }, { nombre: 'A' }, 'X', 'OT-1', lineas, 11, 'https://e/n');
  assertStringIncludes(html, '…y 3 líneas más');
  assertEquals(html.includes('http://inseguro'), false);
  assertStringIncludes(html, '#2563eb');
});
