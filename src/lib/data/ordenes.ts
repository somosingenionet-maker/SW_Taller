import { supabase } from '../supabase';
import type { OrdenTrabajo, LineaOT, EventoOT, OTEstado, LineaOTTipo, FiltroAceite, EstadoFiltro } from '../../types';
import type { Database } from '../database.types';

// empresa_id lo rellena el trigger set_empresa_id() en el servidor.
type OrdenInsert = Database['public']['Tables']['ordenes_trabajo']['Insert'];

const SELECT =
  'id, numero, vehiculo_id, cliente_id, estado, fecha_recepcion, fecha_estimada_entrega, ' +
  'fecha_entrega, kilometraje_entrada, kilometraje_salida, descripcion_problema, diagnostico, ' +
  'tecnico_asignado, subtotal, iva_pct, total_iva, total, notas, presupuesto_estado, ' +
  'presupuesto_aprobado, notificacion_enviada, updated_at, mecanico_actualizado_en, ' +
  'es_cambio_aceite, filtro_aire, filtro_aceite, filtro_combustible, filtro_habitaculo, aceite_anotado_en, ' +
  // De las firmas solo quién, cuándo y por cuánto: el dibujo (PNG) no viaja en los listados.
  'firma_presupuesto_nombre, firma_presupuesto_en, firma_presupuesto_total, firma_entrega_nombre, firma_entrega_en, ' +
  'checklist_recepcion, checklist_observaciones, fotos_recepcion, ' +
  'lineas_ot ( id, tipo, producto_id, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, posicion, completado, duracion_min, notificado_cliente ), ' +
  'eventos_ot ( fecha, descripcion )';

type LineaRow = {
  id: string; tipo: string; producto_id: string | null; descripcion: string; cantidad: number;
  precio_unitario: number; costo_unitario: number | null; subtotal: number; posicion: number;
  completado: boolean; notificado_cliente: boolean;
  /** Opcional: no todas las consultas lo piden (p. ej. las líneas facturables). */
  duracion_min?: number | null;
};
type EventoRow = { fecha: string; descripcion: string };
type ChecklistItemRow = { item: string; ok: boolean };
type OrdenRow = {
  id: string; numero: string; vehiculo_id: string; cliente_id: string; estado: string;
  fecha_recepcion: string; fecha_estimada_entrega: string | null; fecha_entrega: string | null;
  kilometraje_entrada: number; kilometraje_salida: number | null; descripcion_problema: string;
  diagnostico: string | null; tecnico_asignado: string | null; subtotal: number; iva_pct: number;
  total_iva: number; total: number; notas: string | null;
  presupuesto_estado: string | null; presupuesto_aprobado: boolean | null;
  notificacion_enviada: boolean | null; updated_at: string; mecanico_actualizado_en?: string | null;
  es_cambio_aceite?: boolean | null; aceite_anotado_en?: string | null;
  firma_presupuesto_nombre?: string | null; firma_presupuesto_en?: string | null; firma_presupuesto_total?: number | null;
  firma_entrega_nombre?: string | null; firma_entrega_en?: string | null;
  filtro_aire?: string | null; filtro_aceite?: string | null; filtro_combustible?: string | null; filtro_habitaculo?: string | null;
  checklist_recepcion: ChecklistItemRow[] | null; checklist_observaciones: string | null;
  fotos_recepcion: string[] | null;
  lineas_ot: LineaRow[] | null; eventos_ot: EventoRow[] | null;
};

export function mapLinea(l: LineaRow): LineaOT {
  return {
    id: l.id,
    tipo: l.tipo as LineaOTTipo,
    productoId: l.producto_id ?? undefined,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precioUnitario: l.precio_unitario,
    costoUnitario: l.costo_unitario ?? undefined,
    subtotal: l.subtotal,
    completado: l.completado,
    duracionMin: l.duracion_min ?? undefined,
    notificadoCliente: l.notificado_cliente,
  };
}

export function mapOrden(r: OrdenRow): OrdenTrabajo {
  const lineas = (r.lineas_ot ?? []).slice().sort((a, b) => a.posicion - b.posicion).map(mapLinea);
  const historial: EventoOT[] = (r.eventos_ot ?? [])
    .map((e) => ({ fecha: e.fecha, descripcion: e.descripcion }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    id: r.id,
    numero: r.numero,
    vehiculoId: r.vehiculo_id,
    clienteId: r.cliente_id,
    estado: r.estado as OTEstado,
    fechaRecepcion: r.fecha_recepcion,
    fechaEstimadaEntrega: r.fecha_estimada_entrega ?? undefined,
    fechaEntrega: r.fecha_entrega ?? undefined,
    kilometrajeEntrada: r.kilometraje_entrada,
    kilometrajeSalida: r.kilometraje_salida ?? undefined,
    descripcionProblema: r.descripcion_problema,
    diagnostico: r.diagnostico ?? undefined,
    tecnicoAsignado: r.tecnico_asignado ?? undefined,
    subtotal: r.subtotal,
    ivaPct: r.iva_pct,
    totalIva: r.total_iva,
    total: r.total,
    notas: r.notas ?? undefined,
    presupuestoEstado: (r.presupuesto_estado ?? undefined) as OrdenTrabajo['presupuestoEstado'],
    presupuestoAprobado: r.presupuesto_aprobado ?? undefined,
    notificacionEnviada: r.notificacion_enviada ?? undefined,
    fechaActualizacion: r.updated_at,
    mecanicoActualizadoEn: r.mecanico_actualizado_en ?? undefined,
    esCambioAceite: r.es_cambio_aceite === true,
    filtros: {
      aire: (r.filtro_aire ?? null) as EstadoFiltro,
      aceite: (r.filtro_aceite ?? null) as EstadoFiltro,
      combustible: (r.filtro_combustible ?? null) as EstadoFiltro,
      habitaculo: (r.filtro_habitaculo ?? null) as EstadoFiltro,
    },
    aceiteAnotadoEn: r.aceite_anotado_en ?? undefined,
    firmaPresupuesto: r.firma_presupuesto_en
      ? { nombre: r.firma_presupuesto_nombre ?? '', en: r.firma_presupuesto_en, total: r.firma_presupuesto_total ?? 0 } : undefined,
    firmaEntrega: r.firma_entrega_en ? { nombre: r.firma_entrega_nombre ?? '', en: r.firma_entrega_en } : undefined,
    checklistRecepcion: r.checklist_recepcion ?? undefined,
    checklistObservaciones: r.checklist_observaciones ?? undefined,
    fotosRecepcion: r.fotos_recepcion ?? undefined,
    lineas,
    historial,
  };
}

export function toRow(ot: OrdenTrabajo) {
  return {
    numero: ot.numero,
    vehiculo_id: ot.vehiculoId,
    cliente_id: ot.clienteId,
    estado: ot.estado,
    fecha_recepcion: ot.fechaRecepcion,
    fecha_estimada_entrega: ot.fechaEstimadaEntrega || null,
    fecha_entrega: ot.fechaEntrega || null,
    kilometraje_entrada: ot.kilometrajeEntrada ?? 0,
    kilometraje_salida: ot.kilometrajeSalida ?? null,
    descripcion_problema: ot.descripcionProblema,
    diagnostico: ot.diagnostico || null,
    tecnico_asignado: ot.tecnicoAsignado || null,
    subtotal: ot.subtotal,
    iva_pct: ot.ivaPct,
    total_iva: ot.totalIva,
    total: ot.total,
    notas: ot.notas || null,
    presupuesto_estado: ot.presupuestoEstado ?? null,
    presupuesto_aprobado: ot.presupuestoAprobado ?? null,
    notificacion_enviada: ot.notificacionEnviada ?? null,
    checklist_recepcion: ot.checklistRecepcion ?? null,
    checklist_observaciones: ot.checklistObservaciones || null,
    fotos_recepcion: ot.fotosRecepcion ?? [],
  };
}

export function lineaToRow(l: LineaOT, otId: string, posicion: number) {
  return {
    ot_id: otId,
    tipo: l.tipo,
    producto_id: l.productoId ?? null,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_unitario: l.precioUnitario,
    costo_unitario: l.costoUnitario ?? null,
    subtotal: l.subtotal,
    posicion,
    // El taller nunca edita esto desde su UI — se conserva el valor tal cual
    // venía (marcado por el mecánico desde su Portal), y solo es `false` de
    // entrada para una línea recién creada.
    completado: l.completado ?? false,
    // `false` solo cuando OrdenesTrabajoTab marca explícitamente una línea
    // recién añadida a una OT ya recibida como pendiente de avisar al
    // cliente — cualquier otro caso (línea original, o ya avisada) es `true`.
    notificado_cliente: l.notificadoCliente ?? true,
  };
}

function lineasToRows(otId: string, lineas: LineaOT[]) {
  return lineas.map((l, i) => lineaToRow(l, otId, i));
}

function eventosToRows(otId: string, historial: EventoOT[]) {
  return historial.map((e) => ({ ot_id: otId, fecha: e.fecha, descripcion: e.descripcion }));
}

export async function getOrden(id: string): Promise<OrdenTrabajo> {
  const { data, error } = await supabase.from('ordenes_trabajo').select(SELECT).eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapOrden(data as unknown as OrdenRow);
}

const TABLERO_ENTREGADO_DIAS = 30;

/**
 * Datos completos (líneas + historial) para el Tablero (Kanban) — a
 * diferencia de cargar todas las órdenes, no crece con el histórico de la empresa:
 * presupuesto/recibido/en_reparación/listo están naturalmente acotados (lo
 * que hay físicamente en curso), y "entregado" se limita a los últimos 30
 * días para no arrastrar años de entregas ya cerradas en una columna que
 * solo tiene sentido como "lo reciente".
 */
export async function listOrdenesTablero(): Promise<OrdenTrabajo[]> {
  const corteEntregado = new Date(Date.now() - TABLERO_ENTREGADO_DIAS * 86400000).toISOString();
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(SELECT)
    .or(
      `estado.in.(presupuesto,recibido,en_reparacion,listo),` +
      `and(estado.eq.entregado,updated_at.gte.${corteEntregado})`
    )
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapOrden(r as unknown as OrdenRow));
}

export interface OrdenActiva {
  id: string;
  numero: string;
  estado: OTEstado;
  fechaRecepcion: string;
  vehiculoId: string;
}

/**
 * Solo las OTs con trabajo activo (recibido/en_reparación/listo) — a
 * diferencia de cargar todas las órdenes, no crece con el histórico de la empresa: el
 * número de vehículos físicamente en el taller a la vez está naturalmente
 * acotado. Pensada para paneles como Inicio, que no necesitan líneas ni
 * historial completos, solo lo mínimo para mostrar la lista.
 */
export async function listOrdenesActivas(): Promise<OrdenActiva[]> {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select('id, numero, estado, fecha_recepcion, vehiculo_id')
    .in('estado', ['recibido', 'en_reparacion', 'listo'])
    .order('fecha_recepcion', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    numero: r.numero as string,
    estado: r.estado as OTEstado,
    fechaRecepcion: r.fecha_recepcion as string,
    vehiculoId: r.vehiculo_id as string,
  }));
}

export interface OrdenListaRow {
  id: string;
  numero: string;
  estado: OTEstado;
  fechaRecepcion: string;
  presupuestoEstado?: 'pendiente' | 'enviado';
  presupuestoAprobado?: boolean;
  notificacionEnviada?: boolean;
  total: number;
  vehiculoMarca: string;
  vehiculoModelo: string;
  vehiculoMatricula: string;
  clienteNombre: string;
  clienteApellidos: string;
  tareasTotal: number;
  tareasHechas: number;
}

type BuscarOrdenesRow = {
  id: string; numero: string; estado: string; fecha_recepcion: string;
  presupuesto_estado: string | null; presupuesto_aprobado: boolean | null; notificacion_enviada: boolean | null;
  total: number; vehiculo_marca: string; vehiculo_modelo: string; vehiculo_matricula: string;
  cliente_nombre: string; cliente_apellidos: string;
  tareas_total: number; tareas_hechas: number; total_count: number;
};

/**
 * Búsqueda + paginación reales para la vista Lista — a diferencia de
 * cargar todas las órdenes, no trae toda la tabla ni las líneas/eventos de cada OT:
 * solo la página visible con lo mínimo para mostrar la fila, filtrado y
 * buscado en el propio Postgres (buscar_ordenes).
 */
export async function buscarOrdenes(params: {
  termino?: string; estado?: OTEstado | null; limit: number; offset: number;
}): Promise<{ data: OrdenListaRow[]; count: number }> {
  const { data, error } = await supabase.rpc('buscar_ordenes', {
    p_termino: params.termino ?? '',
    p_estado: params.estado ?? undefined,
    p_limit: params.limit,
    p_offset: params.offset,
  });
  if (error) throw new Error(error.message);
  const rows = (data as BuscarOrdenesRow[]) ?? [];
  return {
    data: rows.map((r) => ({
      id: r.id,
      numero: r.numero,
      estado: r.estado as OTEstado,
      fechaRecepcion: r.fecha_recepcion,
      presupuestoEstado: (r.presupuesto_estado ?? undefined) as OrdenListaRow['presupuestoEstado'],
      presupuestoAprobado: r.presupuesto_aprobado ?? undefined,
      notificacionEnviada: r.notificacion_enviada ?? undefined,
      total: Number(r.total),
      vehiculoMarca: r.vehiculo_marca,
      vehiculoModelo: r.vehiculo_modelo,
      vehiculoMatricula: r.vehiculo_matricula,
      clienteNombre: r.cliente_nombre,
      clienteApellidos: r.cliente_apellidos,
      tareasTotal: Number(r.tareas_total),
      tareasHechas: Number(r.tareas_hechas),
    })),
    count: rows.length > 0 ? Number(rows[0].total_count) : 0,
  };
}

/**
 * `ot.numero` que llega del llamador se ignora: el número real ('OT-2026-047') lo asigna
 * el servidor al insertar (trigger asignar_numero_ot), con un bloqueo por taller. Antes se
 * calculaba aquí contando filas, lo que repetía números al borrar una orden o al crear
 * dos a la vez, y chocaba entre talleres.
 */
export async function createOrden(ot: OrdenTrabajo): Promise<OrdenTrabajo> {
  const { numero: _numero, ...fila } = toRow(ot);
  // El interruptor de cambio de aceite solo se envía al crear: después tiene su propio guardado
  // (setCambioAceite), porque también lo puede tocar el mecánico y toRow() lo pisaría.
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .insert({ ...fila, es_cambio_aceite: ot.esCambioAceite === true } as unknown as OrdenInsert)
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const id = (data as { id: string }).id;

  // Líneas y eventos no dependen entre sí — insertarlos en paralelo en vez
  // de uno tras otro ahorra una ida y vuelta completa a la base de datos
  // en cada creación de OT.
  const [rLineas, rEventos] = await Promise.all([
    ot.lineas.length ? supabase.from('lineas_ot').insert(lineasToRows(id, ot.lineas)) : null,
    ot.historial.length ? supabase.from('eventos_ot').insert(eventosToRows(id, ot.historial)) : null,
  ]);
  if (rLineas?.error) throw new Error(rLineas.error.message);
  if (rEventos?.error) throw new Error(rEventos.error.message);

  return getOrden(id);
}

/**
 * Actualiza una OT. IMPORTANTE: la fila `ordenes_trabajo` se actualiza
 * primero, y las `lineas_ot` después — en ese orden. Es lo que hace que
 * "pasar a recibido y añadir una línea de producto en el mismo guardado"
 * descuente stock una sola vez (el trigger de transición de la OT ve las
 * líneas ya existentes; el trigger de inserción de línea ve el estado ya
 * actualizado) — ver el esquema para el detalle de los triggers de stock.
 *
 * A diferencia de `createOrden`, aquí las líneas se diferencian (insert de
 * las nuevas, update de las que ya existían, delete de las que se quitaron)
 * en vez de borrar todo y reinsertar: un borrado+reinserción dispararía los
 * triggers de stock en cada guardado aunque las líneas no hayan cambiado
 * (ruido falso en el libro de movimientos). El historial no tiene ningún
 * efecto secundario ligado a su ciclo de vida, así que se deja igual.
 */
/**
 * Calcula qué hacer con cada línea al guardar una OT existente: borrar las
 * que ya no están, actualizar las que siguen (por id), insertar las nuevas.
 * Pura a propósito (sin llamadas a Supabase) para poder probarla sin una
 * base de datos real — esta es exactamente la lógica que antes reescribía
 * TODA la tabla en cada guardado (ver el historial de esta función).
 */
export function diffLineas(idsExistentes: Set<string>, lineas: LineaOT[], otId: string) {
  const idsEntrantes = new Set(lineas.map((l) => l.id));
  const aBorrar = [...idsExistentes].filter((id) => !idsEntrantes.has(id));

  const aInsertar: ReturnType<typeof lineaToRow>[] = [];
  const aActualizar: (Omit<ReturnType<typeof lineaToRow>, 'completado'> & { id: string })[] = [];
  for (const [i, l] of lineas.entries()) {
    if (idsExistentes.has(l.id)) {
      // `completado` (y el tiempo de la tarea) son del mecánico: al actualizar una línea que ya
      // existe NO se envían. La copia que tiene abierta el taller puede ser de hace minutos y
      // enviarla desmarcaría tareas que el mecánico acaba de terminar desde su Portal.
      const { completado: _delMecanico, ...fila } = lineaToRow(l, otId, i);
      aActualizar.push({ id: l.id, ...fila });
    } else {
      aInsertar.push(lineaToRow(l, otId, i));
    }
  }
  return { aBorrar, aActualizar, aInsertar };
}

const claveEvento = (e: EventoOT) => `${new Date(e.fecha).getTime()}|${e.descripcion}`;

/**
 * Del historial completo que llega (`historial`), qué eventos todavía no están guardados. El
 * historial es de solo-añadir (ningún sitio de la app edita ni borra un evento pasado), así que son
 * los que no existen ya en la base de datos, comparando momento + texto.
 *
 * No vale contar («los que sobran al final»): el mecánico también escribe en el historial desde su
 * Portal, y con una copia vieja abierta en el taller la cuenta se descuadraba y la anotación nueva
 * del taller se perdía sin aviso.
 */
export function eventosPendientes(historial: EventoOT[], guardados: EventoOT[]): EventoOT[] {
  const yaEstan = new Set(guardados.map(claveEvento));
  return historial.filter((e) => !yaEstan.has(claveEvento(e)));
}

export async function updateOrden(ot: OrdenTrabajo): Promise<OrdenTrabajo> {
  const { error } = await supabase.from('ordenes_trabajo').update(toRow(ot)).eq('id', ot.id);
  if (error) throw new Error(error.message);

  const { data: existentes, error: eExist } = await supabase
    .from('lineas_ot').select('id').eq('ot_id', ot.id);
  if (eExist) throw new Error(eExist.message);
  const idsExistentes = new Set((existentes ?? []).map((r) => (r as { id: string }).id));

  const { aBorrar, aActualizar, aInsertar } = diffLineas(idsExistentes, ot.lineas, ot.id);

  if (aBorrar.length) {
    const { error: eDel } = await supabase.from('lineas_ot').delete().in('id', aBorrar);
    if (eDel) throw new Error(eDel.message);
  }

  // Antes cada línea existente se actualizaba con su propia consulta, una
  // por una (N idas y vueltas para N líneas) — un upsert hace lo mismo en
  // una sola consulta, sin importar cuántas líneas tenga la OT.
  if (aActualizar.length) {
    const { error: eUpd } = await supabase.from('lineas_ot').upsert(aActualizar);
    if (eUpd) throw new Error(eUpd.message);
  }
  if (aInsertar.length) {
    const { error: eIns } = await supabase.from('lineas_ot').insert(aInsertar);
    if (eIns) throw new Error(eIns.message);
  }

  // El historial es de solo-añadir: en vez de borrar toda la tabla y
  // reescribirla entera en cada guardado (cada vez más cara cuanta más
  // historia acumula la OT), basta con insertar los eventos pendientes.
  const { data: guardados, error: eCount } = await supabase
    .from('eventos_ot')
    .select('fecha, descripcion')
    .eq('ot_id', ot.id);
  if (eCount) throw new Error(eCount.message);
  const eventosNuevos = eventosPendientes(ot.historial, (guardados ?? []) as EventoOT[]);
  if (eventosNuevos.length) {
    const { error: eE } = await supabase.from('eventos_ot').insert(eventosToRows(ot.id, eventosNuevos));
    if (eE) throw new Error(eE.message);
  }

  return getOrden(ot.id);
}

// ---- Cambio de aceite: cada dato se guarda por separado, en el momento de marcarlo ----

async function anotarEvento(otId: string, descripcion: string): Promise<void> {
  const { error } = await supabase.from('eventos_ot').insert({ ot_id: otId, fecha: new Date().toISOString(), descripcion });
  if (error) throw new Error(error.message);
}

export const NOMBRE_FILTRO: Record<FiltroAceite, string> = {
  aire: 'Filtro de aire', aceite: 'Filtro de aceite', combustible: 'Filtro de combustible', habitaculo: 'Filtro de habitáculo',
};

/** Texto del historial al marcar un filtro desde el taller. */
export function eventoFiltro(filtro: FiltroAceite, estado: EstadoFiltro): string {
  const nombre = NOMBRE_FILTRO[filtro].toLowerCase();
  return estado === 'cambiado' ? `Taller: ${nombre} cambiado.`
    : estado === 'no_cambiado' ? `Taller: ${nombre} NO se cambió.`
    : `Taller: ${nombre} sin revisar.`;
}

/** Marca o quita «es un cambio de aceite» en una orden ya creada. */
export async function setCambioAceite(otId: string, activo: boolean): Promise<OrdenTrabajo> {
  const { error } = await supabase.from('ordenes_trabajo').update({ es_cambio_aceite: activo } as never).eq('id', otId);
  if (error) throw new Error(error.message);
  await anotarEvento(otId, activo ? 'Orden marcada como cambio de aceite.' : 'Se quitó la marca de cambio de aceite.');
  return getOrden(otId);
}

/** Marca un filtro del check list (o lo deja sin revisar con `null`). */
export async function marcarFiltro(otId: string, filtro: FiltroAceite, estado: EstadoFiltro): Promise<OrdenTrabajo> {
  const { error } = await supabase.from('ordenes_trabajo').update({ [`filtro_${filtro}`]: estado } as never).eq('id', otId);
  if (error) throw new Error(error.message);
  await anotarEvento(otId, eventoFiltro(filtro, estado));
  return getOrden(otId);
}

/** Anota en la ficha del vehículo el próximo cambio de aceite a raíz de esta orden (y el último = hoy). */
export async function anotarProximoCambio(otId: string, fecha: string, km: number | null): Promise<OrdenTrabajo> {
  const { error } = await supabase.rpc('anotar_cambio_aceite' as never, {
    p_ot_id: otId, p_proxima_fecha: fecha, p_proximo_km: km, p_autor: 'el taller',
  } as never);
  if (error) throw new Error(error.message);
  return getOrden(otId);
}

export async function deleteOrden(id: string): Promise<void> {
  const { error } = await supabase.from('ordenes_trabajo').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Numero de cada OT por id — para citas con `otId` que solo necesitan mostrar "Convertida en OT {numero}", sin traer el resto del histórico. */
export async function getNumerosOT(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase.from('ordenes_trabajo').select('id, numero').in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r) => [r.id as string, r.numero as string]));
}

export interface OrdenVehiculoRow {
  id: string;
  numero: string;
  descripcionProblema: string;
  estado: OTEstado;
  fechaRecepcion: string;
  total: number;
  vehiculoId: string;
}

/**
 * Historial de OTs de UN vehículo — a diferencia de cargar todas las órdenes, se pide
 * solo cuando el panel de detalle de ese vehículo está abierto, y sin
 * líneas/eventos (VehiclesTab solo los necesita al expandir una OT concreta,
 * ver getHistorialOT). El histórico de un vehículo es legítimamente
 * multi-año (es su ficha de servicio), así que aquí no se acota por fecha.
 */
export async function listOrdenesPorVehiculo(vehiculoId: string): Promise<OrdenVehiculoRow[]> {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select('id, numero, descripcion_problema, estado, fecha_recepcion, total, vehiculo_id')
    .eq('vehiculo_id', vehiculoId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    numero: r.numero as string,
    descripcionProblema: r.descripcion_problema as string,
    estado: r.estado as OTEstado,
    fechaRecepcion: r.fecha_recepcion as string,
    total: r.total as number,
    vehiculoId: r.vehiculo_id as string,
  }));
}

/** Historial de eventos de UNA OT — se pide solo al expandir esa OT concreta en la ficha del vehículo. */
export async function getHistorialOT(otId: string): Promise<EventoOT[]> {
  const { data, error } = await supabase
    .from('eventos_ot')
    .select('fecha, descripcion')
    .eq('ot_id', otId)
    .order('fecha');
  if (error) throw new Error(error.message);
  return (data ?? []).map((e) => ({ fecha: e.fecha as string, descripcion: e.descripcion as string }));
}

export interface OrdenFacturable {
  id: string;
  numero: string;
  vehiculoId: string;
  estado: OTEstado;
  total: number;
  lineas: LineaOT[];
}

/**
 * OTs de UN vehículo listas para facturar (listo/entregado, con líneas) —
 * usada solo por el modal "Nueva Factura". A diferencia de cargar todas las órdenes,
 * no trae eventos_ot (nunca se muestran ahí) y está acotada a un vehículo.
 */
type FacturableRow = {
  id: string; numero: string; vehiculo_id: string; estado: string; total: number;
  lineas_ot: LineaRow[] | null;
};

export async function listOrdenesFacturables(vehiculoId: string): Promise<OrdenFacturable[]> {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select(
      'id, numero, vehiculo_id, estado, total, ' +
      'lineas_ot ( id, tipo, producto_id, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, posicion, completado, notificado_cliente )'
    )
    .eq('vehiculo_id', vehiculoId)
    .in('estado', ['listo', 'entregado']);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FacturableRow[])
    .map((r) => ({
      id: r.id,
      numero: r.numero,
      vehiculoId: r.vehiculo_id,
      estado: r.estado as OTEstado,
      total: r.total,
      lineas: (r.lineas_ot ?? []).slice().sort((a, b) => a.posicion - b.posicion).map(mapLinea),
    }))
    .filter((ot) => ot.lineas.length > 0);
}

/** Conteo de clientes distintos con una OT en curso — para el KPI "Con OT Abierta" del CRM, sin traer ninguna fila de ordenes_trabajo al cliente. */
export async function contarClientesConOTAbierta(): Promise<number> {
  const { data, error } = await supabase.rpc('contar_clientes_con_ot_abierta');
  if (error) throw new Error(error.message);
  return data as number;
}

export interface OrdenAgendaRow {
  id: string;
  numero: string;
  estado: OTEstado;
  fechaRecepcion: string;
  vehiculoMarca: string;
  vehiculoModelo: string;
  vehiculoMatricula: string;
  clienteNombre: string;
  clienteApellidos: string;
}

type OrdenAgendaRowDb = {
  id: string; numero: string; estado: string; fecha_recepcion: string;
  vehiculo_marca: string; vehiculo_modelo: string; vehiculo_matricula: string;
  cliente_nombre: string; cliente_apellidos: string;
};

/**
 * OTs cuya fecha de recepción cae en el rango dado (activas o ya
 * entregadas, nunca presupuestos ni canceladas) — para la Agenda: no
 * importa si vinieron de una cita convertida o se crearon directo desde
 * Taller, todo lo que va a entrar (o entró) al taller debe verse aquí.
 */
export async function listOrdenesPorRangoRecepcion(desde: string, hasta: string): Promise<OrdenAgendaRow[]> {
  const { data, error } = await supabase.rpc('ordenes_por_rango_recepcion', { p_desde: desde, p_hasta: hasta });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OrdenAgendaRowDb[]).map((r) => ({
    id: r.id,
    numero: r.numero,
    estado: r.estado as OTEstado,
    fechaRecepcion: r.fecha_recepcion,
    vehiculoMarca: r.vehiculo_marca,
    vehiculoModelo: r.vehiculo_modelo,
    vehiculoMatricula: r.vehiculo_matricula,
    clienteNombre: r.cliente_nombre,
    clienteApellidos: r.cliente_apellidos,
  }));
}
