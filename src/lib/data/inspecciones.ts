import { supabase } from '../supabase';
import { invocarFuncion } from './funciones';
import {
  descripcionLinea, puntosPendientesDeAnadir, redondear2, totalPuntos,
  type EstadoInspeccion, type EstadoPunto, type PuntoAprobable,
} from '../../utils/inspeccion';

export interface InspeccionPunto {
  id: string;
  categoria: string;
  nombre: string;
  posicion: number;
  estado: EstadoPunto | null;
  nota: string | null;
  /** Rutas dentro del almacenamiento privado; para verlas hay que pedir enlaces firmados (`urlsFotos`). */
  fotos: string[];
  reparacion: string | null;
  precio: number | null;
  decision: 'aprobado' | 'rechazado' | null;
  /** Servicio que la plantilla asociaba a este punto al crear la inspección (foto fija). */
  servicioNombre: string | null;
  reparacionSugerida: string | null;
  precioSugerido: number | null;
}

/** Prueba de que el cliente aceptó desde su portal (la IP y el dispositivo solo se leen aquí, en el taller). */
export interface AceptacionInspeccion {
  nombre: string; en: string; total: number; texto: string; ip: string | null; dispositivo: string | null;
}

export interface Inspeccion {
  id: string;
  ordenId: string;
  vehiculoId: string;
  clienteId: string;
  estado: EstadoInspeccion;
  km: number | null;
  realizadaPor: string | null;
  notaGeneral: string | null;
  terminadaEn: string | null;
  enviadaEn: string | null;
  respondidaEn: string | null;
  fotosBorradasEn: string | null;
  plantillaNombre: string | null;
  /** Cuándo se mandó el recordatorio automático (null = aún no). */
  seguimientoSinResponderEn: string | null;
  seguimientoPendientesEn: string | null;
  seguimientoDesactivado: boolean;
  aceptacion: AceptacionInspeccion | null;
  puntos: InspeccionPunto[];
}

const BUCKET = 'inspecciones';
const SELECT_PUNTOS = 'id, categoria, nombre, posicion, estado, nota, fotos, reparacion, precio, decision, servicio_nombre, reparacion_sugerida, precio_sugerido';
const SELECT =
  'id, orden_id, vehiculo_id, cliente_id, estado, km, realizada_por, nota_general, terminada_en, enviada_en, respondida_en, fotos_borradas_en, plantilla_nombre, seguimiento_sin_responder_en, seguimiento_pendientes_en, seguimiento_desactivado, ' +
  'aceptacion_nombre, aceptacion_en, aceptacion_total, aceptacion_texto, aceptacion_ip, aceptacion_dispositivo, ' +
  `inspeccion_puntos ( ${SELECT_PUNTOS} )`;

type PuntoRow = {
  id: string; categoria: string; nombre: string; posicion: number; estado: string | null; nota: string | null;
  fotos: string[]; reparacion: string | null; precio: number | string | null; decision: string | null;
  servicio_nombre: string | null; reparacion_sugerida: string | null; precio_sugerido: number | string | null;
};
type InspeccionRow = {
  id: string; orden_id: string; vehiculo_id: string; cliente_id: string; estado: string; km: number | null;
  realizada_por: string | null; nota_general: string | null; terminada_en: string | null; enviada_en: string | null;
  respondida_en: string | null; fotos_borradas_en: string | null; plantilla_nombre: string | null;
  seguimiento_sin_responder_en: string | null; seguimiento_pendientes_en: string | null; seguimiento_desactivado: boolean;
  aceptacion_nombre: string | null; aceptacion_en: string | null; aceptacion_total: number | string | null; aceptacion_texto: string | null;
  aceptacion_ip: string | null; aceptacion_dispositivo: string | null;
  inspeccion_puntos: PuntoRow[] | null;
};

function mapPunto(p: PuntoRow): InspeccionPunto {
  return {
    id: p.id, categoria: p.categoria, nombre: p.nombre, posicion: p.posicion, estado: p.estado as EstadoPunto | null,
    nota: p.nota, fotos: p.fotos ?? [], reparacion: p.reparacion,
    precio: p.precio === null ? null : Number(p.precio), decision: p.decision as InspeccionPunto['decision'],
    servicioNombre: p.servicio_nombre, reparacionSugerida: p.reparacion_sugerida,
    precioSugerido: p.precio_sugerido === null ? null : Number(p.precio_sugerido),
  };
}

function mapInspeccion(r: InspeccionRow): Inspeccion {
  return {
    id: r.id, ordenId: r.orden_id, vehiculoId: r.vehiculo_id, clienteId: r.cliente_id, estado: r.estado as EstadoInspeccion,
    km: r.km, realizadaPor: r.realizada_por, notaGeneral: r.nota_general, terminadaEn: r.terminada_en, enviadaEn: r.enviada_en,
    respondidaEn: r.respondida_en, fotosBorradasEn: r.fotos_borradas_en, plantillaNombre: r.plantilla_nombre,
    seguimientoSinResponderEn: r.seguimiento_sin_responder_en, seguimientoPendientesEn: r.seguimiento_pendientes_en,
    seguimientoDesactivado: r.seguimiento_desactivado,
    aceptacion: r.aceptacion_en ? {
      nombre: r.aceptacion_nombre ?? '', en: r.aceptacion_en, total: Number(r.aceptacion_total ?? 0), texto: r.aceptacion_texto ?? '',
      ip: r.aceptacion_ip, dispositivo: r.aceptacion_dispositivo,
    } : null,
    puntos: (r.inspeccion_puntos ?? []).map(mapPunto).sort((a, b) => a.posicion - b.posicion),
  };
}

export async function getInspeccionDeOrden(otId: string): Promise<Inspeccion | null> {
  const { data, error } = await supabase.from('inspecciones').select(SELECT).eq('orden_id', otId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapInspeccion(data as unknown as InspeccionRow) : null;
}

/** Abre la inspección de la orden con la plantilla elegida, la de por defecto o la estándar (o devuelve la que ya tiene). */
export async function crearInspeccion(otId: string, plantillaId?: string): Promise<Inspeccion> {
  const { error } = await supabase.rpc('crear_inspeccion', { p_orden_id: otId, p_plantilla_id: plantillaId });
  if (error) throw new Error(error.message);
  const insp = await getInspeccionDeOrden(otId);
  if (!insp) throw new Error('No se pudo abrir la inspección.');
  return insp;
}

export interface InspeccionResumen {
  id: string; ordenId: string; estado: EstadoInspeccion; enviadaEn: string | null; terminadaEn: string | null; createdAt: string;
  urgentes: number; atencion: number; bien: number;
}

/** Historial de inspecciones de un vehículo (más recientes primero). */
export async function listInspeccionesDeVehiculo(vehiculoId: string): Promise<InspeccionResumen[]> {
  const { data, error } = await supabase.from('inspecciones')
    .select('id, orden_id, estado, enviada_en, terminada_en, created_at, inspeccion_puntos ( estado )')
    .eq('vehiculo_id', vehiculoId).order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as { id: string; orden_id: string; estado: string; enviada_en: string | null; terminada_en: string | null; created_at: string; inspeccion_puntos: { estado: string | null }[] }[])
    .map((r) => ({
      id: r.id, ordenId: r.orden_id, estado: r.estado as EstadoInspeccion, enviadaEn: r.enviada_en, terminadaEn: r.terminada_en, createdAt: r.created_at,
      urgentes: r.inspeccion_puntos.filter((p) => p.estado === 'urgente').length,
      atencion: r.inspeccion_puntos.filter((p) => p.estado === 'atencion').length,
      bien: r.inspeccion_puntos.filter((p) => p.estado === 'bien').length,
    }));
}

/** Lo que recepción puede cambiar al revisar: textos, estado y precio de un punto. */
export async function guardarPunto(
  id: string, cambios: Partial<Pick<InspeccionPunto, 'estado' | 'nota' | 'reparacion' | 'precio'>>,
): Promise<void> {
  const { error } = await supabase.from('inspeccion_puntos').update(cambios).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Pone en un punto la reparación y el precio del servicio que sugería la plantilla. */
export async function aplicarSugerencia(punto: Pick<InspeccionPunto, 'id' | 'reparacion' | 'reparacionSugerida' | 'precioSugerido'>): Promise<void> {
  await guardarPunto(punto.id, {
    precio: punto.precioSugerido,
    // Si el mecánico ya escribió su propio texto, se respeta; solo se completa si estaba vacío.
    reparacion: punto.reparacion?.trim() ? punto.reparacion : punto.reparacionSugerida,
  });
}

export async function guardarNotaGeneral(inspeccionId: string, nota: string | null): Promise<void> {
  const { error } = await supabase.from('inspecciones').update({ nota_general: nota }).eq('id', inspeccionId);
  if (error) throw new Error(error.message);
}

async function anotarEvento(otId: string, descripcion: string): Promise<void> {
  const { error } = await supabase.from('eventos_ot').insert({ ot_id: otId, fecha: new Date().toISOString(), descripcion });
  if (error) throw new Error(error.message);
}

/** Devuelve la inspección a «terminada» (se puede volver a editar). No es posible si el cliente ya respondió. */
export async function reabrirInspeccion(inspeccion: Pick<Inspeccion, 'id' | 'ordenId'>): Promise<void> {
  const { error } = await supabase.from('inspecciones').update({ estado: 'terminada', enviada_en: null }).eq('id', inspeccion.id);
  if (error) throw new Error(error.message);
  await anotarEvento(inspeccion.ordenId, 'Inspección reabierta para corregirla.');
}

/** Pide al mecánico que la corrija: vuelve a «borrador». Solo si aún no se envió. */
export async function devolverAlMecanico(inspeccion: Pick<Inspeccion, 'id' | 'ordenId'>): Promise<void> {
  const { error } = await supabase.from('inspecciones').update({ estado: 'borrador', terminada_en: null }).eq('id', inspeccion.id).eq('estado', 'terminada');
  if (error) throw new Error(error.message);
  await anotarEvento(inspeccion.ordenId, 'Inspección devuelta al mecánico para revisarla.');
}

/** Marca la inspección como enviada y, si se pide, manda el correo con el enlace del portal. Devuelve el enlace. */
export async function enviarInspeccion(inspeccionId: string, porCorreo: boolean): Promise<{ enlace: string; correo: boolean }> {
  const r = await invocarFuncion<{ enlace: string; correo: boolean }>('inspeccion-enviar', { inspeccionId, porCorreo });
  return { enlace: String(r.enlace), correo: r.correo === true };
}

/** Enlaces de lectura (1 hora) de las fotos privadas. */
export async function urlsFotos(rutas: string[]): Promise<Record<string, string>> {
  if (!rutas.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(rutas, 3600);
  if (error) throw new Error(error.message);
  const mapa: Record<string, string> = {};
  for (const f of data ?? []) if (f.path && f.signedUrl) mapa[f.path] = f.signedUrl;
  return mapa;
}

export async function borrarFotoPunto(punto: Pick<InspeccionPunto, 'id' | 'fotos'>, ruta: string): Promise<void> {
  const { error } = await supabase.from('inspeccion_puntos').update({ fotos: punto.fotos.filter((f) => f !== ruta) }).eq('id', punto.id);
  if (error) throw new Error(error.message);
  await supabase.storage.from(BUCKET).remove([ruta]); // si falla, lo recoge la limpieza de huérfanos
}

/** Marca (o quita) «conservar las fotos de esta orden»: no se borrarán nunca mientras esté marcada. */
export async function setConservarFotos(otId: string, conservar: boolean): Promise<void> {
  const { error } = await supabase.from('ordenes_trabajo').update({ conservar_fotos: conservar }).eq('id', otId);
  if (error) throw new Error(error.message);
  await anotarEvento(otId, conservar ? 'Fotos marcadas para conservar (no se borrarán automáticamente).' : 'Fotos desmarcadas: vuelven a caducar con el plazo del taller.');
}

export async function getConservarFotos(otId: string): Promise<{ conservar: boolean; borradasEn: string | null }> {
  const { data, error } = await supabase.from('ordenes_trabajo').select('conservar_fotos, fotos_borradas_en').eq('id', otId).single();
  if (error) throw new Error(error.message);
  return { conservar: data.conservar_fotos, borradasEn: data.fotos_borradas_en };
}

/**
 * Añade a la orden las reparaciones que el cliente aprobó (como tareas de mano de obra, para que el mecánico
 * las vea y las marque) y recalcula los totales. Cada línea guarda el punto de origen, así no se duplican.
 * Escribe líneas y totales directamente (no reenvía la orden entera): el mecánico puede estar tocándola.
 */
export async function anadirAprobadasAOrden(otId: string, puntos: PuntoAprobable[]): Promise<{ anadidas: number; total: number }> {
  const { data: lineas, error } = await supabase.from('lineas_ot').select('subtotal, posicion, inspeccion_punto_id').eq('ot_id', otId);
  if (error) throw new Error(error.message);
  const filas = (lineas ?? []) as { subtotal: number; posicion: number; inspeccion_punto_id: string | null }[];

  const yaAnadidos = new Set(filas.map((l) => l.inspeccion_punto_id).filter((x): x is string => !!x));
  const nuevos = puntosPendientesDeAnadir(puntos, yaAnadidos);
  if (!nuevos.length) return { anadidas: 0, total: 0 };

  const base = filas.reduce((m, l) => Math.max(m, l.posicion), -1) + 1;
  const { error: eIns } = await supabase.from('lineas_ot').insert(nuevos.map((p, i) => ({
    ot_id: otId, tipo: 'mano_de_obra', descripcion: descripcionLinea(p), cantidad: 1, precio_unitario: p.precio!, subtotal: p.precio!,
    posicion: base + i, completado: false, notificado_cliente: true, inspeccion_punto_id: p.id,
  })));
  if (eIns) throw new Error(eIns.message);

  // Totales con lo que hay ahora en la base de datos (no con una copia vieja de la pantalla).
  const { data: todas, error: eTot } = await supabase.from('lineas_ot').select('subtotal').eq('ot_id', otId);
  if (eTot) throw new Error(eTot.message);
  const { data: ot, error: eOt } = await supabase.from('ordenes_trabajo').select('iva_pct').eq('id', otId).single();
  if (eOt) throw new Error(eOt.message);
  const subtotal = redondear2((todas ?? []).reduce((s, l) => s + Number((l as { subtotal: number }).subtotal), 0));
  const totalIva = redondear2(subtotal * (Number(ot.iva_pct) / 100));
  const { error: eUpd } = await supabase.from('ordenes_trabajo').update({ subtotal, total_iva: totalIva, total: redondear2(subtotal + totalIva) }).eq('id', otId);
  if (eUpd) throw new Error(eUpd.message);

  const anadido = totalPuntos(nuevos as { precio: number | null }[]);
  await anotarEvento(otId, `Añadidas ${nuevos.length} reparación(es) aprobadas de la inspección (${anadido.toFixed(2).replace('.', ',')} € + IVA).`);
  return { anadidas: nuevos.length, total: anadido };
}

/** Activa o desactiva los recordatorios automáticos de este informe. */
export async function setSeguimientoDesactivado(inspeccionId: string, desactivado: boolean): Promise<void> {
  const { error } = await supabase.from('inspecciones').update({ seguimiento_desactivado: desactivado }).eq('id', inspeccionId);
  if (error) throw new Error(error.message);
}

/** Enlace del portal del cliente de esta inspección (null si el cliente aún no tiene). */
export async function getEnlaceCliente(clienteId: string): Promise<string | null> {
  const { data, error } = await supabase.from('clientes').select('portal_token').eq('id', clienteId).single();
  if (error) throw new Error(error.message);
  return data.portal_token ? `${window.location.origin}/portal/${data.portal_token}` : null;
}
