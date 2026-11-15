// Archivo de calendario (.ics) y enlace de Google Calendar de una cita. Puros y probados.
// Mismo UID siempre para la misma cita: al reprogramar se envía con SEQUENCE mayor y el calendario del cliente
// actualiza el evento en vez de crear otro.

export interface DatosIcs {
  uid: string;
  inicio: number;        // ms desde epoch (UTC)
  fin: number;
  resumen: string;
  descripcion?: string | null;
  ubicacion?: string | null;
  /** 0 la primera vez; +1 en cada cambio de fecha. */
  secuencia?: number;
  /** pendiente → TENTATIVE (aún sin confirmar el taller). */
  confirmada?: boolean;
  ahora?: number;
}

const dos = (n: number) => String(n).padStart(2, '0');
/** 20261117T100000Z */
export function fechaIcs(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}Z`;
}

/** Escapa el texto de una propiedad (RFC 5545): barra, punto y coma, coma y saltos de línea. */
export const escaparIcs = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Líneas de más de 75 bytes se parten con CRLF + espacio, sin cortar un carácter UTF-8 por la mitad. */
export function plegar(linea: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = '';
  let bytes = 0;
  let limite = 75;
  for (const ch of linea) {
    const b = enc.encode(ch).length;
    if (bytes + b > limite) { partes.push(actual); actual = ' '; bytes = 1; limite = 75; }
    actual += ch; bytes += b;
  }
  partes.push(actual);
  return partes.join('\r\n');
}

export function construirIcs(d: DatosIcs): string {
  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Doonty Motor//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${d.uid}@doonty.com`,
    `DTSTAMP:${fechaIcs(d.ahora ?? Date.now())}`,
    `SEQUENCE:${d.secuencia ?? 0}`,
    `DTSTART:${fechaIcs(d.inicio)}`,
    `DTEND:${fechaIcs(d.fin)}`,
    `SUMMARY:${escaparIcs(d.resumen)}`,
    ...(d.descripcion ? [`DESCRIPTION:${escaparIcs(d.descripcion)}`] : []),
    ...(d.ubicacion ? [`LOCATION:${escaparIcs(d.ubicacion)}`] : []),
    `STATUS:${d.confirmada === false ? 'TENTATIVE' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio de cita',
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lineas.map(plegar).join('\r\n') + '\r\n';
}

/** Enlace que abre Google Calendar con el evento ya relleno. */
export function enlaceGoogleCalendar(d: Pick<DatosIcs, 'inicio' | 'fin' | 'resumen' | 'descripcion' | 'ubicacion'>): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: d.resumen, dates: `${fechaIcs(d.inicio)}/${fechaIcs(d.fin)}` });
  if (d.descripcion) p.set('details', d.descripcion);
  if (d.ubicacion) p.set('location', d.ubicacion);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
