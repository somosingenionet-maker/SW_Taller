// Lógica pura del Portal del Mecánico, separada de index.ts para poder
// testearla con `deno test` sin arrancar el servidor HTTP (Deno.serve se
// ejecuta al importar index.ts).

export type Tecnico = { id: string; empresa_id: string; nombre: string };
export type OtParaAutorizar = { empresa_id: string; tecnico_asignado: string | null };

// El control de acceso real del Portal: no hay JWT de usuario, así que esto
// es lo único que evita que un técnico de un taller marque tareas de OTs de
// OTRO taller, o de un compañero. Un fallo aquí es una fuga de datos entre
// tenants.
export function puedeMarcarTarea(tecnico: Tecnico, ot: OtParaAutorizar): boolean {
  return ot.empresa_id === tecnico.empresa_id && ot.tecnico_asignado === tecnico.nombre;
}

// El técnico marcando la primera tarea es la señal de que el trabajo
// empezó de verdad — solo debe disparar el auto-avance a "en_reparacion"
// cuando la tarea se marca como hecha Y la OT seguía en "recibido" (si ya
// la habían avanzado a mano, o está en otro estado, no se toca).
export function debeIniciarReparacion(estadoActual: string, completado: boolean): boolean {
  return completado && estadoActual === 'recibido';
}

/** Estados en los que el mecánico ve la orden. «listo» sigue a la vista hasta que el taller la entrega. */
export const ESTADOS_VISIBLES = ['recibido', 'en_reparacion', 'listo'] as const;
/** Estados en los que puede marcar tareas, anotar tiempos y dejar notas. */
export const ESTADOS_EDITABLES = ['recibido', 'en_reparacion'] as const;

export type AccionEstado = 'empezar' | 'listo' | 'reabrir';

/**
 * Cambios de estado que puede hacer el mecánico. Devuelve el estado nuevo o null si no procede
 * (el resto — presupuesto, entregado, cancelado — son del taller: requieren su verificación).
 */
export function transicionMecanico(estadoActual: string, accion: AccionEstado): 'en_reparacion' | 'listo' | null {
  if (accion === 'empezar') return estadoActual === 'recibido' ? 'en_reparacion' : null;
  if (accion === 'listo') return estadoActual === 'recibido' || estadoActual === 'en_reparacion' ? 'listo' : null;
  return estadoActual === 'listo' ? 'en_reparacion' : null;
}

export const DURACION_MIN = 5;
export const DURACION_MAX = 1440;

/** Minutos válidos (entero entre 5 y 1440) o null. `undefined`/`null`/'' = no se anotó. */
export function normalizarDuracion(valor: unknown): { ok: true; minutos: number | null } | { ok: false } {
  if (valor === undefined || valor === null || valor === '') return { ok: true, minutos: null };
  const n = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isInteger(n) || n < DURACION_MIN || n > DURACION_MAX) return { ok: false };
  return { ok: true, minutos: n };
}

/** «45 min», «1 h», «1 h 30 min». */
export function textoDuracion(minutos: number): string {
  const h = Math.floor(minutos / 60), m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export const NOTA_MAX = 500;

/** Nota del mecánico lista para el historial: sin espacios sobrantes ni saltos repetidos, o null si queda vacía o se pasa. */
export function limpiarNota(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.replace(/\s+/g, ' ').trim();
  return texto.length === 0 || texto.length > NOTA_MAX ? null : texto;
}

/** Textos del historial de la orden: los lee el taller en la ficha. */
export const EVENTOS = {
  primeraTarea: (tecnico: string) => `Reparación iniciada — ${tecnico} marcó la primera tarea desde su Portal.`,
  empezar: (tecnico: string) => `Reparación iniciada por ${tecnico} desde su Portal.`,
  listo: (tecnico: string, pendientes: number) =>
    pendientes > 0
      ? `${tecnico} marcó el vehículo como listo con ${pendientes} ${pendientes === 1 ? 'tarea' : 'tareas'} sin marcar.`
      : `${tecnico} marcó el vehículo como listo: todas las tareas hechas.`,
  reabrir: (tecnico: string) => `${tecnico} reabrió la orden: vuelve a estar en reparación.`,
  tareaHecha: (tecnico: string, tarea: string, minutos: number | null) =>
    `${tecnico} terminó «${tarea}»${minutos ? ` (${textoDuracion(minutos)})` : ''}.`,
  tareaDeshecha: (tecnico: string, tarea: string) => `${tecnico} desmarcó «${tarea}».`,
  duracion: (tecnico: string, tarea: string, minutos: number) => `${tecnico} corrigió el tiempo de «${tarea}»: ${textoDuracion(minutos)}.`,
  nota: (tecnico: string, texto: string) => `Nota de ${tecnico}: ${texto}`,
  aceite: (tecnico: string, activo: boolean) =>
    activo ? `${tecnico} marcó la orden como cambio de aceite.` : `${tecnico} quitó la marca de cambio de aceite.`,
  filtro: (tecnico: string, filtro: Filtro, estado: EstadoFiltro) =>
    estado === 'cambiado' ? `${tecnico}: ${NOMBRE_FILTRO[filtro]} cambiado.`
      : estado === 'no_cambiado' ? `${tecnico}: ${NOMBRE_FILTRO[filtro]} NO se cambió.`
      : `${tecnico} dejó sin revisar el ${NOMBRE_FILTRO[filtro]}.`,
};

// ---- Cambio de aceite ----
export const FILTROS = ['aire', 'aceite', 'combustible', 'habitaculo'] as const;
export type Filtro = typeof FILTROS[number];
export type EstadoFiltro = 'cambiado' | 'no_cambiado' | null;
export const NOMBRE_FILTRO: Record<Filtro, string> = {
  aire: 'filtro de aire', aceite: 'filtro de aceite', combustible: 'filtro de combustible', habitaculo: 'filtro de habitáculo',
};

export function esFiltro(valor: unknown): valor is Filtro {
  return typeof valor === 'string' && (FILTROS as readonly string[]).includes(valor);
}

/** 'cambiado' | 'no_cambiado' | null (sin revisar). Cualquier otra cosa no vale. */
export function normalizarEstadoFiltro(valor: unknown): { ok: true; estado: EstadoFiltro } | { ok: false } {
  if (valor === null || valor === undefined || valor === '') return { ok: true, estado: null };
  return valor === 'cambiado' || valor === 'no_cambiado' ? { ok: true, estado: valor } : { ok: false };
}

/** Fecha «AAAA-MM-DD» real (no 2027-02-31) o null. Los límites (futura, máx. 5 años) los valida la base de datos. */
export function fechaValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor ? null : valor;
}

/** Kilómetros del próximo cambio: entero positivo o null (no se anotan). */
export function normalizarKm(valor: unknown): { ok: true; km: number | null } | { ok: false } {
  if (valor === null || valor === undefined || valor === '') return { ok: true, km: null };
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isInteger(n) && n > 0 && n <= 2_000_000 ? { ok: true, km: n } : { ok: false };
}

export type OtRow = {
  id: string; numero: string; vehiculo_id: string; estado: string; descripcion_problema: string;
  diagnostico?: string | null; kilometraje_entrada?: number | null;
  fecha_estimada_entrega?: string | null; created_at?: string;
  es_cambio_aceite?: boolean | null; aceite_anotado_en?: string | null;
  filtro_aire?: string | null; filtro_aceite?: string | null; filtro_combustible?: string | null; filtro_habitaculo?: string | null;
};
export type VehiculoRow = {
  id: string; marca: string; modelo: string; matricula: string;
  aceite_proxima_fecha?: string | null; aceite_proximo_km?: number | null;
};
export type LineaRow = { id: string; ot_id: string; descripcion: string; completado: boolean; duracion_min?: number | null };
export type EventoRow = { ot_id: string; fecha: string; descripcion: string };

/**
 * Momento real en que el coche entró al taller: el primer evento del historial que dice «recibido en
 * taller» (alta directa, recepción de un presupuesto u orden creada desde una cita). `fecha_recepcion`
 * no sirve: es solo un día y puede ser una fecha prevista. Sin evento, la creación de la orden.
 */
export function ingresoDe(ot: Pick<OtRow, 'id' | 'created_at'>, eventos: EventoRow[]): string | null {
  const primero = eventos
    .filter((e) => e.ot_id === ot.id && /recibido en taller/i.test(e.descripcion))
    .map((e) => e.fecha)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  return primero ?? ot.created_at ?? null;
}

/**
 * Momento en que el coche se marcó como listo: el ÚLTIMO evento del historial que lo dice, sea porque
 * lo marcó el mecánico («… marcó el vehículo como listo…») o el taller («Trabajo completado»). Si
 * se reabrió y se volvió a terminar, vale la última vez. Sin evento, null.
 */
export function listoEnDe(otId: string, eventos: EventoRow[]): string | null {
  const ultimo = eventos
    .filter((e) => e.ot_id === otId && /vehículo como listo|trabajo completado/i.test(e.descripcion))
    .map((e) => e.fecha)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  return ultimo ?? null;
}

/** Solo las notas que dejó ESTE técnico (para que las vea al volver a abrir el coche). */
export function notasDe(otId: string, tecnico: string, eventos: EventoRow[]): { fecha: string; texto: string }[] {
  const prefijo = `Nota de ${tecnico}: `;
  return eventos
    .filter((e) => e.ot_id === otId && e.descripcion.startsWith(prefijo))
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
    .map((e) => ({ fecha: e.fecha, texto: e.descripcion.slice(prefijo.length) }));
}

const ORDEN_GRUPO: Record<string, number> = { en_reparacion: 0, recibido: 1, listo: 2 };

// Arma la respuesta del portal cruzando OTs + vehículos + tareas en memoria
// (las consultas ya vienen filtradas por empresa/técnico desde SQL; aquí
// solo se combinan y se ordenan). Un fallo aquí mostraría al técnico las
// tareas de otra OT, o un vehículo equivocado. Nunca incluye precios, horas
// cobradas ni datos del cliente.
// Orden: lo que está en reparación, luego lo que falta por empezar, luego lo
// ya listo; dentro de cada grupo, el coche que entró antes va primero.
export function formatearOrdenesPortal(
  ordenes: OtRow[], vehiculos: VehiculoRow[], lineas: LineaRow[],
  eventos: EventoRow[] = [], tecnico = '',
) {
  return ordenes
    .map((o) => {
      const v = vehiculos.find((x) => x.id === o.vehiculo_id);
      return {
        id: o.id,
        numero: o.numero,
        estado: o.estado,
        descripcionProblema: o.descripcion_problema,
        diagnostico: o.diagnostico ?? null,
        kilometrajeEntrada: o.kilometraje_entrada ?? null,
        fechaEstimadaEntrega: o.fecha_estimada_entrega ?? null,
        ingreso: ingresoDe(o, eventos),
        listoEn: o.estado === 'listo' ? listoEnDe(o.id, eventos) : null,
        vehiculo: v ? { marca: v.marca, modelo: v.modelo, matricula: v.matricula } : null,
        esCambioAceite: o.es_cambio_aceite === true,
        filtros: {
          aire: o.filtro_aire ?? null, aceite: o.filtro_aceite ?? null,
          combustible: o.filtro_combustible ?? null, habitaculo: o.filtro_habitaculo ?? null,
        },
        // El próximo cambio solo se enseña si se anotó a raíz de ESTA orden (si no, sería el del ciclo anterior).
        aceiteProximo: o.aceite_anotado_en && v?.aceite_proxima_fecha
          ? { fecha: v.aceite_proxima_fecha, km: v.aceite_proximo_km ?? null } : null,
        tareas: lineas
          .filter((l) => l.ot_id === o.id)
          .map((l) => ({ id: l.id, descripcion: l.descripcion, completado: l.completado, duracionMin: l.duracion_min ?? null })),
        notas: notasDe(o.id, tecnico, eventos),
      };
    })
    .sort((a, b) =>
      (ORDEN_GRUPO[a.estado] ?? 9) - (ORDEN_GRUPO[b.estado] ?? 9)
      || new Date(a.ingreso ?? 0).getTime() - new Date(b.ingreso ?? 0).getTime());
}
