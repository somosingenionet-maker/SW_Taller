// Reserva de cita online: QUÉ huecos hay y QUÉ se acepta. Puro (sin red ni base de datos) para probarlo a fondo:
// de esto depende que nadie reserve fuera de horario, en un día cerrado o sin sitio.
//
// Todo el horario del taller se interpreta en la hora de Madrid (Europe/Madrid), con cambio de hora incluido.

export const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
export type DiaSemana = typeof DIAS[number];
export type Tramo = [string, string];
export type Horario = Record<DiaSemana, Tramo[]>;

export interface ConfigReservas {
  horario: Partial<Horario>;
  /** Días cerrados («AAAA-MM-DD»): festivos, vacaciones… */
  cierres: string[];
  /** Citas que el taller puede atender a la vez. */
  capacidad: number;
  antelacionHoras: number;
  diasMax: number;
}

/** Una cita ya existente (no cancelada): cuándo empieza y cuándo acaba, en ms. */
export interface Ocupada { inicio: number; fin: number }

export const PASO_MINUTOS = 30;
const TZ = 'Europe/Madrid';
const MIN = 60_000;

const reFecha = /^(\d{4})-(\d{2})-(\d{2})$/;
const reHora = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ¿Es una fecha «AAAA-MM-DD» que existe de verdad (no 2026-02-30)? */
export function fechaValida(f: unknown): f is string {
  if (typeof f !== 'string') return false;
  const m = f.match(reFecha);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export const horaValida = (h: unknown): h is string => typeof h === 'string' && reHora.test(h);

export function sumarDias(fecha: string, n: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function diaSemanaDe(fecha: string): DiaSemana {
  const [y, m, d] = fecha.split('-').map(Number);
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const minutosDe = (hora: string) => { const [h, m] = hora.split(':').map(Number); return h * 60 + m; };
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const formato = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function camposMadrid(instante: number) {
  const p = Object.fromEntries(formato.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** «2026-11-17» + «10:00» en hora de Madrid → el instante real (UTC) en ms. Se ajusta dos veces por el cambio de hora. */
export function instanteMadrid(fecha: string, hora: string): number {
  const [y, mo, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const local = Date.UTC(y, mo - 1, d, h, mi);
  let t = local;
  for (let i = 0; i < 2; i++) {
    const c = camposMadrid(t);
    t += local - Date.UTC(c.y, c.mo - 1, c.d, c.h, c.mi, c.s);
  }
  return t;
}

/** El día («AAAA-MM-DD») y la hora («HH:MM») de Madrid de un instante. */
export function fechaMadrid(instante: number): string {
  const c = camposMadrid(instante);
  return `${c.y}-${String(c.mo).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;
}
export function horaMadrid(instante: number): string {
  const c = camposMadrid(instante);
  return `${String(c.h).padStart(2, '0')}:${String(c.mi).padStart(2, '0')}`;
}

/**
 * Horas de inicio posibles de un día, de 30 en 30 minutos dentro de cada tramo del horario, de modo que la cita
 * (con su duración) acabe antes de que cierre el tramo. Devuelve «HH:MM» ya filtrado por: día cerrado, antelación
 * mínima y sitio libre (menos citas solapadas que `capacidad`).
 */
export function huecosDelDia(
  fecha: string, cfg: ConfigReservas, duracionMin: number, ocupadas: Ocupada[], ahora: number,
): string[] {
  if (!fechaValida(fecha) || !(duracionMin > 0)) return [];
  if (cfg.cierres.includes(fecha)) return [];
  const tramos = cfg.horario[diaSemanaDe(fecha)] ?? [];
  const minimo = ahora + cfg.antelacionHoras * 60 * MIN;
  const salida: string[] = [];
  for (const [ini, fin] of tramos) {
    const i = minutosDe(ini), f = minutosDe(fin);
    for (let m = i; m + duracionMin <= f; m += PASO_MINUTOS) {
      const inicio = instanteMadrid(fecha, hhmm(m));
      if (inicio < minimo) continue;
      const finCita = inicio + duracionMin * MIN;
      const solapadas = ocupadas.filter((o) => o.inicio < finCita && o.fin > inicio).length;
      if (solapadas < cfg.capacidad) salida.push(hhmm(m));
    }
  }
  return salida;
}

/** Disponibilidad de los próximos `diasMax` días (empezando hoy, hora de Madrid). Solo incluye los días con algún hueco. */
export function disponibilidad(cfg: ConfigReservas, duracionMin: number, ocupadas: Ocupada[], ahora: number): Record<string, string[]> {
  const hoy = fechaMadrid(ahora);
  const salida: Record<string, string[]> = {};
  for (let i = 0; i <= cfg.diasMax; i++) {
    const f = sumarDias(hoy, i);
    const h = huecosDelDia(f, cfg, duracionMin, ocupadas, ahora);
    if (h.length) salida[f] = h;
  }
  return salida;
}

/** Último día reservable (inclusive), hora de Madrid. */
export const ultimoDia = (cfg: ConfigReservas, ahora: number) => sumarDias(fechaMadrid(ahora), cfg.diasMax);

// ---- Datos que envía el cliente ----

export interface SolicitudReserva {
  slug: string; tipoId: string; fecha: string; hora: string;
  nombre: string; apellidos: string; telefono: string; correo: string; vehiculo: string; matricula: string; motivo: string;
}

const reCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const recortar = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const telefonoValido = (t: string) => { const d = t.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; };
export const matriculaValida = (m: string) => /^[A-Z0-9-]{4,10}$/.test(m);

export type ResultadoSolicitud = { ok: true; datos: SolicitudReserva } | { ok: false; error: string };

export function validarSolicitud(b: Record<string, unknown>): ResultadoSolicitud {
  if (b.consentimiento !== true) return { ok: false, error: 'Debes aceptar el uso de tus datos para gestionar la cita.' };
  const nombre = recortar(b.nombre, 80);
  const apellidos = recortar(b.apellidos, 80);
  const telefono = recortar(b.telefono, 20);
  const correo = recortar(b.correo, 254).toLowerCase();
  const matricula = recortar(b.matricula, 12).toUpperCase().replace(/[\s]/g, '');
  const vehiculo = recortar(b.vehiculo, 80);
  const motivo = typeof b.motivo === 'string' ? b.motivo.replace(/\r\n/g, '\n').trim().slice(0, 300) : '';
  const slug = recortar(b.slug, 40).toLowerCase();
  const tipoId = recortar(b.tipoId, 80);
  if (nombre.length < 2) return { ok: false, error: 'Escribe tu nombre.' };
  if (apellidos.length < 2) return { ok: false, error: 'Escribe tus apellidos.' };
  if (!telefonoValido(telefono)) return { ok: false, error: 'Escribe un teléfono válido (9 cifras o más).' };
  if (!reCorreo.test(correo)) return { ok: false, error: 'Escribe un correo válido: te enviamos ahí la confirmación.' };
  if (matricula && !matriculaValida(matricula)) return { ok: false, error: 'La matrícula no parece válida. Puedes dejarla en blanco.' };
  if (!slug || !tipoId) return { ok: false, error: 'Faltan datos de la reserva.' };
  if (!fechaValida(b.fecha) || !horaValida(b.hora)) return { ok: false, error: 'Elige un día y una hora.' };
  return { ok: true, datos: { slug, tipoId, fecha: b.fecha, hora: b.hora, nombre, apellidos, telefono, correo, vehiculo, matricula, motivo } };
}

/** Texto del vehículo que se guarda en la cita: «Seat León · 1234ABC». */
export function descripcionVehiculo(vehiculo: string, matricula: string): string {
  return [vehiculo, matricula].filter(Boolean).join(' · ');
}

/** «martes 17 de noviembre de 2026 a las 10:00» (hora de Madrid). */
export function fechaHoraLarga(instante: number): string {
  const f = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(instante));
  return `${f} a las ${horaMadrid(instante)}`;
}
