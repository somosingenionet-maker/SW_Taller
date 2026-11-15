import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirIcs, enlaceGoogleCalendar, escaparIcs, fechaIcs, plegar } from './ics.ts';

const BASE = { uid: 'abc123', inicio: Date.UTC(2026, 10, 17, 9, 0), fin: Date.UTC(2026, 10, 17, 10, 0), resumen: 'Cita en Taller Ruiz', ahora: Date.UTC(2026, 10, 15, 12, 0) };

Deno.test('fechaIcs escribe la hora en UTC con Z', () => {
  assertEquals(fechaIcs(Date.UTC(2026, 10, 17, 9, 5, 7)), '20261117T090507Z');
});

Deno.test('escaparIcs escapa barra, punto y coma, coma y saltos de línea', () => {
  assertEquals(escaparIcs('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
});

Deno.test('el .ics tiene lo necesario, termina en CRLF y mantiene el UID entre versiones', () => {
  const v1 = construirIcs({ ...BASE, descripcion: 'Frenos, ruido', ubicacion: 'Calle Mayor 1, Elche' });
  assertStringIncludes(v1, 'BEGIN:VCALENDAR\r\n');
  assertStringIncludes(v1, 'UID:abc123@doonty.com\r\n');
  assertStringIncludes(v1, 'DTSTART:20261117T090000Z\r\n');
  assertStringIncludes(v1, 'DTEND:20261117T100000Z\r\n');
  assertStringIncludes(v1, 'SEQUENCE:0\r\n');
  assertStringIncludes(v1, 'STATUS:CONFIRMED\r\n');
  assertStringIncludes(v1, 'DESCRIPTION:Frenos\\, ruido\r\n');
  assertStringIncludes(v1, 'LOCATION:Calle Mayor 1\\, Elche\r\n');
  assertEquals(v1.endsWith('END:VCALENDAR\r\n'), true);
  const v2 = construirIcs({ ...BASE, inicio: BASE.inicio + 3600_000, fin: BASE.fin + 3600_000, secuencia: 1, confirmada: false });
  assertStringIncludes(v2, 'UID:abc123@doonty.com\r\n');
  assertStringIncludes(v2, 'SEQUENCE:1\r\n');
  assertStringIncludes(v2, 'STATUS:TENTATIVE\r\n');
});

Deno.test('sin descripción ni ubicación no hay líneas vacías', () => {
  const ics = construirIcs(BASE);
  assertEquals(ics.includes('DESCRIPTION:\r\n'), false);
  assertEquals(ics.includes('LOCATION'), false);
});

Deno.test('las líneas largas se parten a 75 bytes sin romper caracteres', () => {
  const larga = 'SUMMARY:' + 'ñ'.repeat(80);
  const trozos = plegar(larga).split('\r\n');
  assertEquals(trozos.length > 1, true);
  for (const t of trozos) assertEquals(new TextEncoder().encode(t).length <= 75, true);
  assertEquals(trozos.map((t, i) => (i === 0 ? t : t.slice(1))).join(''), larga);
});

Deno.test('el enlace de Google Calendar lleva fechas, título y lugar', () => {
  const u = new URL(enlaceGoogleCalendar({ inicio: BASE.inicio, fin: BASE.fin, resumen: 'Cita & más', ubicacion: 'Elche' }));
  assertEquals(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assertEquals(u.searchParams.get('text'), 'Cita & más');
  assertEquals(u.searchParams.get('dates'), '20261117T090000Z/20261117T100000Z');
  assertEquals(u.searchParams.get('location'), 'Elche');
  assertEquals(u.searchParams.has('details'), false);
});
