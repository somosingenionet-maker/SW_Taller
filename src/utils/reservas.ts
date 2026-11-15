// Utilidades de la página pública de reservas (calendario y franjas). Puras y probadas.

export const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const NOMBRES_DIA_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const dos = (n: number) => String(n).padStart(2, '0');
export const claveFecha = (y: number, m: number, d: number) => `${y}-${dos(m + 1)}-${dos(d)}`;

export interface CeldaDia { fecha: string | null; dia: number | null; disponible: boolean }

/** Cuadrícula de un mes (semana de lunes a domingo): celdas vacías al principio y días marcados como disponibles o no. */
export function cuadriculaMes(año: number, mes: number, disponibles: ReadonlySet<string> | Record<string, unknown>): CeldaDia[] {
  const tiene = (f: string) => (disponibles instanceof Set ? disponibles.has(f) : f in disponibles);
  const primero = new Date(Date.UTC(año, mes, 1)).getUTCDay();           // 0 = domingo
  const huecosInicio = (primero + 6) % 7;                                // lunes = 0
  const diasMes = new Date(Date.UTC(año, mes + 1, 0)).getUTCDate();
  const celdas: CeldaDia[] = Array.from({ length: huecosInicio }, () => ({ fecha: null, dia: null, disponible: false }));
  for (let d = 1; d <= diasMes; d++) {
    const f = claveFecha(año, mes, d);
    celdas.push({ fecha: f, dia: d, disponible: tiene(f) });
  }
  while (celdas.length % 7 !== 0) celdas.push({ fecha: null, dia: null, disponible: false });
  return celdas;
}

/** Meses (año, mes) que hay que poder recorrer para cubrir todos los días con hueco. */
export function mesesConHueco(fechas: string[]): { año: number; mes: number }[] {
  const vistos = new Set<string>();
  const salida: { año: number; mes: number }[] = [];
  for (const f of [...fechas].sort()) {
    const [y, m] = f.split('-').map(Number);
    const k = `${y}-${m}`;
    if (!vistos.has(k)) { vistos.add(k); salida.push({ año: y, mes: m - 1 }); }
  }
  return salida;
}

/** Reparte las horas en mañana (antes de las 14:00) y tarde. */
export function partirHoras(horas: string[]): { manana: string[]; tarde: string[] } {
  return { manana: horas.filter((h) => h < '14:00'), tarde: horas.filter((h) => h >= '14:00') };
}

/** «martes 17 de noviembre» a partir de «2026-11-17». */
export function etiquetaDia(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${dia} ${d} de ${NOMBRES_MES[m - 1]}`;
}

/** «1 h», «45 min», «1 h 30 min». */
export function textoDuracionCita(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}
