import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  extensionDeMime, faltanPrecios, limpiarTexto, motivoSinHuecoFoto, nuevaRutaFoto, puedeTerminar, resumenPuntos,
  rutaDeUrlPublica, rutaFotoValida, esEstadoPunto, necesitaDetalle,
} from './inspeccion.ts';

const U = '123e4567-e89b-42d3-a456-426614174000';

Deno.test('estados válidos y cuáles piden detalle', () => {
  for (const e of ['bien', 'atencion', 'urgente', 'no_aplica']) assertEquals(esEstadoPunto(e), true);
  for (const e of ['mal', '', null, undefined, 3, 'BIEN']) assertEquals(esEstadoPunto(e), false);
  assertEquals(necesitaDetalle('urgente'), true);
  assertEquals(necesitaDetalle('atencion'), true);
  assertEquals(necesitaDetalle('bien'), false);
  assertEquals(necesitaDetalle(null), false);
});

Deno.test('limpiarTexto: recorta, vacío es null, demasiado largo o no-texto es error', () => {
  assertEquals(limpiarTexto('  hola  ', 10), 'hola');
  assertEquals(limpiarTexto('   ', 10), null);
  assertEquals(limpiarTexto(null, 10), null);
  assertEquals(limpiarTexto(undefined, 10), null);
  assertEquals(limpiarTexto('a'.repeat(11), 10), undefined);
  assertEquals(limpiarTexto('a'.repeat(10), 10), 'a'.repeat(10));
  assertEquals(limpiarTexto(123, 10), undefined);
  assertEquals(limpiarTexto('a\n\n\n\nb', 20), 'a\n\nb');
});

Deno.test('extensionDeMime solo admite imágenes conocidas', () => {
  assertEquals(extensionDeMime('image/jpeg'), 'jpg');
  assertEquals(extensionDeMime('image/webp'), 'webp');
  assertEquals(extensionDeMime('image/svg+xml'), null);
  assertEquals(extensionDeMime('application/pdf'), null);
  assertEquals(extensionDeMime(undefined), null);
});

Deno.test('nuevaRutaFoto genera la ruta y rechaza ids peligrosos', () => {
  assertEquals(nuevaRutaFoto('emp1', 'ins-2', U, 'jpg'), `emp1/ins-2/${U}.jpg`);
  assertThrows(() => nuevaRutaFoto('../otra', 'i', U, 'jpg'));
  assertThrows(() => nuevaRutaFoto('e', 'a/b', U, 'jpg'));
  assertThrows(() => nuevaRutaFoto('e', 'i', 'no-uuid', 'jpg'));
  assertThrows(() => nuevaRutaFoto('e', 'i', U, 'exe'));
  assertThrows(() => nuevaRutaFoto('', 'i', U, 'jpg'));
});

Deno.test('rutaFotoValida: solo rutas de esa empresa e inspección', () => {
  assertEquals(rutaFotoValida(`e1/i1/${U}.jpg`, 'e1', 'i1'), true);
  assertEquals(rutaFotoValida(`e2/i1/${U}.jpg`, 'e1', 'i1'), false);   // otra empresa
  assertEquals(rutaFotoValida(`e1/i2/${U}.jpg`, 'e1', 'i1'), false);   // otra inspección
  assertEquals(rutaFotoValida(`e1/i1/../i2/${U}.jpg`, 'e1', 'i1'), false);
  assertEquals(rutaFotoValida(`e1/i1/${U}.exe`, 'e1', 'i1'), false);
  assertEquals(rutaFotoValida('e1/i1/x.jpg', 'e1', 'i1'), false);
  assertEquals(rutaFotoValida(`e1/i1/${U}.jpg`.repeat(10), 'e1', 'i1'), false);
  assertEquals(rutaFotoValida(null, 'e1', 'i1'), false);
  assertEquals(rutaFotoValida(7, 'e1', 'i1'), false);
});

Deno.test('límites de fotos por punto y por inspección', () => {
  assertEquals(motivoSinHuecoFoto(0, 0), null);
  assertEquals(motivoSinHuecoFoto(2, 19), null);
  assertEquals(typeof motivoSinHuecoFoto(3, 5), 'string');
  assertEquals(typeof motivoSinHuecoFoto(1, 20), 'string');
});

Deno.test('rutaDeUrlPublica extrae la ruta del bucket y rechaza lo raro', () => {
  const base = 'https://x.supabase.co/storage/v1/object/public/fotos-recepcion/';
  assertEquals(rutaDeUrlPublica(`${base}emp/abc.jpg`, 'fotos-recepcion'), 'emp/abc.jpg');
  assertEquals(rutaDeUrlPublica(`${base}emp/abc.jpg?v=3`, 'fotos-recepcion'), 'emp/abc.jpg');
  assertEquals(rutaDeUrlPublica(`${base}emp/mi%20foto.jpg`, 'fotos-recepcion'), 'emp/mi foto.jpg');
  assertEquals(rutaDeUrlPublica(`${base}emp/abc.jpg`, 'logos-empresas'), null);
  assertEquals(rutaDeUrlPublica(`${base}../otra/abc.jpg`, 'fotos-recepcion'), null);
  assertEquals(rutaDeUrlPublica('https://otro.com/foto.jpg', 'fotos-recepcion'), null);
  assertEquals(rutaDeUrlPublica(null, 'fotos-recepcion'), null);
});

Deno.test('resumen, terminar y precios', () => {
  const p = [
    { estado: 'bien', precio: null }, { estado: 'bien', precio: null }, { estado: 'urgente', precio: 64 },
    { estado: 'atencion', precio: null }, { estado: 'no_aplica', precio: null }, { estado: null, precio: null },
  ] as const;
  assertEquals(resumenPuntos([...p]), { bien: 2, atencion: 1, urgente: 1, no_aplica: 1, sinMarcar: 1, total: 6 });
  assertEquals(puedeTerminar([...p]), true);
  assertEquals(puedeTerminar([{ estado: null, precio: null }]), false);
  assertEquals(puedeTerminar([]), false);
  assertEquals(faltanPrecios([...p]), 0); // el urgente tiene precio; la atención sin precio no bloquea
  assertEquals(faltanPrecios([{ estado: 'urgente', precio: null }, { estado: 'atencion', precio: null }]), 1);
  assertEquals(faltanPrecios([{ estado: 'urgente', precio: 0 }]), 1); // precio 0 no vale
  assertEquals(faltanPrecios([{ estado: 'bien', precio: null }]), 0);
});
