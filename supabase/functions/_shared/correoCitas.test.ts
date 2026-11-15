import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirCorreoCita, type DatosCita, type TipoCorreoCita } from './correoCitas.ts';

const BASE: DatosCita = {
  empresa: { nombre: 'Talleres <Ruiz> & Hijos', brand_color: '#ff0000', logo_url: 'https://x/l.png', correo: 'a@b.es', telefono: '600' },
  nombre: '<b>Ana</b>', cuando: 'martes, 17 de noviembre de 2026 a las 10:00', tipo: 'Revisión', vehiculo: 'Seat <León>', motivo: 'Frenos & ruido',
  telefono: '600 000 001', correo: 'ana@x.es', duracionMin: 60, enlace: 'https://motor.doonty.com/cita/abc',
};
const TIPOS: TipoCorreoCita[] = ['cliente_confirmada', 'cliente_pendiente', 'taller_nueva', 'cliente_cancelada', 'taller_cancelada', 'cliente_confirmada_taller', 'cliente_cancelada_taller', 'cliente_recordatorio'];

Deno.test('todos los correos escapan lo que viene del taller y del cliente', () => {
  for (const t of TIPOS) {
    const { asunto, html } = construirCorreoCita(t, BASE);
    for (const peligro of ['<b>Ana</b>', '<León>', '<Ruiz>']) assertEquals(html.includes(peligro), false, `${t}: ${peligro}`);
    assertStringIncludes(html, 'Talleres &lt;Ruiz&gt; &amp; Hijos');
    assertStringIncludes(html, 'martes, 17 de noviembre de 2026 a las 10:00');
    assertEquals(typeof asunto, 'string');
  }
});

Deno.test('confirmada vs pendiente: dicen cosas distintas y llevan el enlace para cancelar', () => {
  const c = construirCorreoCita('cliente_confirmada', BASE);
  assertStringIncludes(c.html, 'está <strong>confirmada</strong>');
  assertStringIncludes(c.html, 'href="https://motor.doonty.com/cita/abc"');
  assertStringIncludes(c.asunto, 'confirmada');
  const p = construirCorreoCita('cliente_pendiente', BASE);
  assertStringIncludes(p.html, 'te <strong>confirmará</strong>');
  assertStringIncludes(p.asunto, 'recibido');
});

Deno.test('el aviso al taller lleva el contacto del cliente y no lleva enlace de cancelación', () => {
  const t = construirCorreoCita('taller_nueva', BASE);
  assertStringIncludes(t.html, '600 000 001');
  assertStringIncludes(t.html, 'ana@x.es');
  assertStringIncludes(t.html, 'etiqueta «Online»');
  assertEquals(t.html.includes('cancela o revisa tu cita'), false);
  assertStringIncludes(t.asunto, 'Nueva reserva online');
});

Deno.test('el recordatorio avisa de que es automático y solo uno; sin enlace no hay frase de cancelar', () => {
  const r = construirCorreoCita('cliente_recordatorio', BASE);
  assertStringIncludes(r.html, 'solo uno por cita');
  assertStringIncludes(r.asunto, 'mañana');
  const sin = construirCorreoCita('cliente_confirmada', { ...BASE, enlace: null });
  assertEquals(sin.html.includes('cancela o revisa tu cita'), false);
});

Deno.test('los campos opcionales ausentes no dejan filas vacías ni «undefined»', () => {
  const { html } = construirCorreoCita('cliente_confirmada', { empresa: { nombre: 'T' }, nombre: 'Ana', cuando: 'mañana' });
  assertEquals(html.includes('undefined'), false);
  assertEquals(html.includes('null'), false);
  assertEquals(html.includes('Servicio'), false);
  assertEquals(html.includes('Vehículo'), false);
  assertEquals(html.includes('Motivo'), false);
});

Deno.test('los avisos al taller llevan nombre y apellidos; al cliente se le saluda solo por el nombre', () => {
  const d = { ...BASE, nombre: 'Ana', apellidos: 'García Ruiz' };
  const nueva = construirCorreoCita('taller_nueva', d);
  assertStringIncludes(nueva.asunto, 'Ana García Ruiz');
  assertStringIncludes(nueva.html, 'Ana García Ruiz');
  assertStringIncludes(construirCorreoCita('taller_cancelada', d).asunto, 'Ana García Ruiz');
  const cliente = construirCorreoCita('cliente_confirmada', d);
  assertStringIncludes(cliente.html, 'Hola Ana,');
  assertEquals(cliente.html.includes('García Ruiz'), false);
  assertEquals(construirCorreoCita('taller_nueva', { ...BASE, nombre: 'Ana' }).asunto.includes('undefined'), false);
});
