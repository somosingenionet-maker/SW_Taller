// Horario de las reservas online en la pantalla de ajustes. Puro y probado; las mismas reglas que la base de datos
// (horario_reservas_valido), para avisar antes de guardar en vez de recibir un error técnico.

export const DIAS = [
  { id: 'lun', nombre: 'Lunes' }, { id: 'mar', nombre: 'Martes' }, { id: 'mie', nombre: 'Miércoles' }, { id: 'jue', nombre: 'Jueves' },
  { id: 'vie', nombre: 'Viernes' }, { id: 'sab', nombre: 'Sábado' }, { id: 'dom', nombre: 'Domingo' },
] as const;
export type DiaId = typeof DIAS[number]['id'];
export type Tramo = [string, string];
export type HorarioReservas = Record<DiaId, Tramo[]>;

export const HORARIO_POR_DEFECTO: HorarioReservas = {
  lun: [['09:00', '13:30'], ['16:00', '19:30']], mar: [['09:00', '13:30'], ['16:00', '19:30']], mie: [['09:00', '13:30'], ['16:00', '19:30']],
  jue: [['09:00', '13:30'], ['16:00', '19:30']], vie: [['09:00', '13:30'], ['16:00', '19:30']], sab: [], dom: [],
};

export const MAX_TRAMOS = 3;
const reHora = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lo que llega de la base de datos (cualquier JSON) → un horario completo y seguro. Días ausentes = cerrado. */
export function normalizarHorario(valor: unknown): HorarioReservas {
  const salida = Object.fromEntries(DIAS.map((d) => [d.id, [] as Tramo[]])) as HorarioReservas;
  if (!valor || typeof valor !== 'object') return salida;
  for (const d of DIAS) {
    const t = (valor as Record<string, unknown>)[d.id];
    if (Array.isArray(t)) {
      salida[d.id] = t.filter((x): x is Tramo => Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string').map((x) => [x[0], x[1]] as Tramo);
    }
  }
  return salida;
}

/** Texto del primer error del horario (con el nombre del día) o null si está bien. */
export function errorDeHorario(h: HorarioReservas): string | null {
  for (const d of DIAS) {
    const tramos = h[d.id];
    if (tramos.length > MAX_TRAMOS) return `${d.nombre}: como máximo ${MAX_TRAMOS} franjas.`;
    let anterior = '00:00';
    for (const [ini, fin] of tramos) {
      if (!reHora.test(ini) || !reHora.test(fin)) return `${d.nombre}: escribe las horas completas.`;
      if (fin <= ini) return `${d.nombre}: la franja ${ini}–${fin} acaba antes de empezar.`;
      if (ini < anterior) return `${d.nombre}: las franjas no pueden solaparse ni ir desordenadas.`;
      anterior = fin;
    }
  }
  return null;
}

/** «09:00–13:30 · 16:00–19:30» o «Cerrado». */
export function resumenDia(tramos: Tramo[]): string {
  return tramos.length === 0 ? 'Cerrado' : tramos.map(([a, b]) => `${a}–${b}`).join(' · ');
}

/** Dirección pública a partir del nombre del taller: sin tildes, en minúsculas, con guiones. */
export function slugDesdeNombre(nombre: string): string {
  const base = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return base.length >= 3 ? base : '';
}

export const slugValido = (s: string) => /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s);

export function codigoIframe(url: string): string {
  return `<iframe src="${url}" title="Reservar cita" style="width:100%;max-width:480px;height:780px;border:0;border-radius:16px" loading="lazy"></iframe>`;
}
