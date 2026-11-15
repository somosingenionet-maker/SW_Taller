import { invocarPortal } from './invocarPortal';

export interface ReservaEmpresa {
  nombre: string; brandColor: string | null; logoUrl: string | null; telefono: string | null; correo: string | null; ciudad: string | null;
}
export interface TipoReserva { id: string; nombre: string; duracionMin: number }
export interface InfoReservas {
  empresa: ReservaEmpresa;
  tipos: TipoReserva[];
  confirmacion: 'automatica' | 'manual';
  antelacionHoras: number;
  diasMax: number;
}
export interface DisponibilidadReservas {
  /** Por día («AAAA-MM-DD»), las horas («HH:MM», hora de Madrid) en que se puede empezar. Solo días con hueco. */
  dias: Record<string, string[]>;
  duracionMin: number;
}
export interface DatosReserva {
  slug: string; tipoId: string; fecha: string; hora: string;
  nombre: string; telefono: string; correo: string; vehiculo: string; matricula: string; motivo: string;
  consentimiento: boolean; captchaToken: string;
  /** Campo señuelo: siempre vacío en una persona. */
  web: string;
}
export interface ResultadoReserva { ok: true; estado: 'confirmada' | 'pendiente'; cuando: string; enlace: string; tipo?: string }
export interface CitaPublicaDatos {
  empresa: ReservaEmpresa;
  cita: { cuando: string; estado: 'pendiente' | 'confirmada' | 'cancelada' | 'convertida'; tipo: string | null; vehiculo: string | null; motivo: string; duracionMin: number; cancelable: boolean };
}

const llamar = <T,>(body: Record<string, unknown>) => invocarPortal<T>('reservas-publicas', body);

export const getInfoReservas = (slug: string) => llamar<InfoReservas>({ action: 'info', slug });
export const getDisponibilidad = (slug: string, tipoId: string) => llamar<DisponibilidadReservas>({ action: 'disponibilidad', slug, tipoId });
export const reservarCita = (d: DatosReserva) => llamar<ResultadoReserva>({ action: 'reservar', ...d });
export const getCitaPublica = (token: string) => llamar<CitaPublicaDatos>({ action: 'cita', token });
export const cancelarCitaPublica = (token: string) => llamar<{ ok: true }>({ action: 'cancelar', token });
