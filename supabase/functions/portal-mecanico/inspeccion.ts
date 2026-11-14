// Inspección digital en el Portal del Mecánico. Mismo modelo de seguridad que el resto del portal: el
// token del enlace identifica al técnico y solo puede tocar inspecciones de órdenes asignadas a él, con
// la service role. Las fotos se suben DIRECTAMENTE al almacenamiento con una URL firmada de un solo uso
// (el técnico no tiene cuenta): primero se pide la URL, se sube y luego se registra la ruta.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  BORRADOR, NOTA_GENERAL_MAX, NOTA_PUNTO_MAX, REPARACION_MAX, esEstadoPunto, extensionDeMime,
  limpiarTexto, motivoSinHuecoFoto, necesitaDetalle, nuevaRutaFoto, puedeTerminar, resumenPuntos, rutaFotoValida,
} from '../_shared/inspeccion.ts';
import type { Tecnico } from './logic.ts';

const BUCKET = 'inspecciones';
const CADUCIDAD_URL_FIRMADA = 3600; // 1 hora

export interface Ayudas {
  json: (cuerpo: unknown, estado?: number) => Response;
  /** La orden, solo si es de este técnico (devuelve la Response de error si no). */
  ordenDelTecnico: (otId: string) => Promise<{ id: string; empresa_id: string; estado: string } | Response>;
  registrar: (otId: string, descripcion: string) => Promise<void>;
  editable: (estadoOrden: string) => boolean;
  mensajeSoloEnTaller: string;
}

interface PuntoRow {
  id: string; inspeccion_id: string; empresa_id: string; categoria: string; nombre: string; posicion: number;
  estado: string | null; nota: string | null; fotos: string[]; reparacion: string | null;
}
interface InspeccionRow { id: string; empresa_id: string; orden_id: string; estado: string; nota_general: string | null }

// ---- Lectura (va dentro de la respuesta general del portal) ----

/** Inspecciones abiertas de las órdenes dadas, con sus puntos y enlaces de lectura de las fotos (1 h). */
export async function cargarInspecciones(admin: SupabaseClient, empresaId: string, otIds: string[]) {
  if (!otIds.length) return {};
  const { data: insps } = await admin.from('inspecciones')
    .select('id, orden_id, estado, nota_general')
    .eq('empresa_id', empresaId).in('orden_id', otIds).in('estado', [BORRADOR, 'terminada']);
  const lista = (insps ?? []) as { id: string; orden_id: string; estado: string; nota_general: string | null }[];
  if (!lista.length) return {};
  const { data: puntos } = await admin.from('inspeccion_puntos')
    .select('id, inspeccion_id, categoria, nombre, posicion, estado, nota, fotos, reparacion')
    .in('inspeccion_id', lista.map((i) => i.id)).order('posicion');
  const filas = (puntos ?? []) as PuntoRow[];

  const rutas = [...new Set(filas.flatMap((p) => p.fotos))];
  const urls = new Map<string, string>();
  if (rutas.length) {
    const { data: firmadas } = await admin.storage.from(BUCKET).createSignedUrls(rutas, CADUCIDAD_URL_FIRMADA);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }

  const salida: Record<string, unknown> = {};
  for (const i of lista) {
    const suyos = filas.filter((p) => p.inspeccion_id === i.id);
    salida[i.orden_id] = {
      id: i.id, estado: i.estado, notaGeneral: i.nota_general,
      puntos: suyos.map((p) => ({
        id: p.id, categoria: p.categoria, nombre: p.nombre, estado: p.estado, nota: p.nota, reparacion: p.reparacion,
        fotos: p.fotos.map((ruta) => ({ ruta, url: urls.get(ruta) ?? null })),
      })),
    };
  }
  return salida;
}

// ---- Escritura ----

/** Inspección + punto (si se pide), verificando que son de una orden de este técnico y que siguen en borrador. */
async function inspeccionEditable(admin: SupabaseClient, a: Ayudas, inspeccionId: string, requerirBorrador: boolean) {
  const { data: insp } = await admin.from('inspecciones')
    .select('id, empresa_id, orden_id, estado, nota_general').eq('id', inspeccionId).maybeSingle();
  if (!insp) return a.json({ error: 'Inspección no encontrada.' }, 404);
  const ot = await a.ordenDelTecnico((insp as InspeccionRow).orden_id);
  if (ot instanceof Response) return ot;
  if (!a.editable(ot.estado)) return a.json({ error: a.mensajeSoloEnTaller }, 409);
  if (requerirBorrador && (insp as InspeccionRow).estado !== BORRADOR) {
    return a.json({ error: 'Esta inspección ya está terminada. Reábrela para cambiarla.' }, 409);
  }
  return { insp: insp as InspeccionRow, ot };
}

async function puntoDe(admin: SupabaseClient, inspeccionId: string, puntoId: unknown): Promise<PuntoRow | null> {
  if (typeof puntoId !== 'string' || !puntoId) return null;
  const { data } = await admin.from('inspeccion_puntos')
    .select('id, inspeccion_id, empresa_id, categoria, nombre, posicion, estado, nota, fotos, reparacion')
    .eq('id', puntoId).eq('inspeccion_id', inspeccionId).maybeSingle();
  return (data as PuntoRow | null) ?? null;
}

export async function manejarCrear(admin: SupabaseClient, a: Ayudas, otId: string) {
  const ot = await a.ordenDelTecnico(otId);
  if (ot instanceof Response) return ot;
  if (!a.editable(ot.estado)) return a.json({ error: a.mensajeSoloEnTaller }, 409);
  const { data, error } = await admin.rpc('crear_inspeccion', { p_orden_id: ot.id });
  if (error) return a.json({ error: 'No se pudo abrir la inspección.' }, 500);
  return a.json({ ok: true, inspeccionId: data });
}

/** Borra archivos del almacenamiento (silencioso: si alguno falla, lo recoge la limpieza de huérfanos). */
async function borrarArchivos(admin: SupabaseClient, rutas: string[]) {
  if (rutas.length) await admin.storage.from(BUCKET).remove(rutas);
}

export async function manejarPunto(
  admin: SupabaseClient, a: Ayudas, inspeccionId: string, puntoId: unknown, estado: unknown, nota: unknown, reparacion: unknown,
) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, true);
  if (ctx instanceof Response) return ctx;
  const p = await puntoDe(admin, inspeccionId, puntoId);
  if (!p) return a.json({ error: 'Punto no encontrado.' }, 404);
  if (estado !== null && !esEstadoPunto(estado)) return a.json({ error: 'Estado no reconocido.' }, 400);
  const e = estado === null ? null : estado;

  const cambios: Record<string, unknown> = { estado: e };
  if (necesitaDetalle(e)) {
    const n = limpiarTexto(nota, NOTA_PUNTO_MAX);
    const r = limpiarTexto(reparacion, REPARACION_MAX);
    if (n === undefined) return a.json({ error: `La nota admite hasta ${NOTA_PUNTO_MAX} caracteres.` }, 400);
    if (r === undefined) return a.json({ error: `La reparación admite hasta ${REPARACION_MAX} caracteres.` }, 400);
    cambios.nota = n; cambios.reparacion = r;
  } else {
    // Un punto «bien» o «no aplica» no lleva nota, reparación ni fotos: si las tenía, se quitan.
    cambios.nota = null; cambios.reparacion = null; cambios.fotos = [];
    await borrarArchivos(admin, p.fotos);
  }
  const { error } = await admin.from('inspeccion_puntos').update(cambios).eq('id', p.id);
  if (error) return a.json({ error: 'No se pudo guardar.' }, 500);
  return a.json({ ok: true });
}

export async function manejarFotoUrl(admin: SupabaseClient, a: Ayudas, inspeccionId: string, puntoId: unknown, mime: unknown) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, true);
  if (ctx instanceof Response) return ctx;
  const p = await puntoDe(admin, inspeccionId, puntoId);
  if (!p) return a.json({ error: 'Punto no encontrado.' }, 404);
  if (!necesitaDetalle(p.estado as never)) return a.json({ error: 'Solo los puntos en «atención» o «urgente» llevan fotos.' }, 409);
  const ext = extensionDeMime(mime);
  if (!ext) return a.json({ error: 'Formato de imagen no admitido.' }, 400);

  const { data: todas } = await admin.from('inspeccion_puntos').select('fotos').eq('inspeccion_id', inspeccionId);
  const total = ((todas ?? []) as { fotos: string[] }[]).reduce((n, x) => n + x.fotos.length, 0);
  const motivo = motivoSinHuecoFoto(p.fotos.length, total);
  if (motivo) return a.json({ error: motivo }, 409);

  const ruta = nuevaRutaFoto(ctx.insp.empresa_id, inspeccionId, crypto.randomUUID(), ext);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return a.json({ error: 'No se pudo preparar la subida.' }, 500);
  return a.json({ ok: true, ruta, token: data.token });
}

export async function manejarFotoRegistrar(admin: SupabaseClient, a: Ayudas, inspeccionId: string, puntoId: unknown, ruta: unknown) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, true);
  if (ctx instanceof Response) return ctx;
  const p = await puntoDe(admin, inspeccionId, puntoId);
  if (!p) return a.json({ error: 'Punto no encontrado.' }, 404);
  if (!rutaFotoValida(ruta, ctx.insp.empresa_id, inspeccionId)) return a.json({ error: 'Foto no válida.' }, 400);
  if (p.fotos.includes(ruta)) return a.json({ ok: true });

  const { data: todas } = await admin.from('inspeccion_puntos').select('fotos').eq('inspeccion_id', inspeccionId);
  const total = ((todas ?? []) as { fotos: string[] }[]).reduce((n, x) => n + x.fotos.length, 0);
  const motivo = motivoSinHuecoFoto(p.fotos.length, total);
  if (motivo) { await borrarArchivos(admin, [ruta]); return a.json({ error: motivo }, 409); }

  // Que el archivo exista de verdad: no se registran rutas inventadas.
  const carpeta = `${ctx.insp.empresa_id}/${inspeccionId}`;
  const nombre = ruta.slice(carpeta.length + 1);
  const { data: existe } = await admin.storage.from(BUCKET).list(carpeta, { search: nombre, limit: 1 });
  if (!(existe ?? []).some((f) => f.name === nombre)) return a.json({ error: 'La foto no se subió correctamente.' }, 409);

  const { error } = await admin.from('inspeccion_puntos').update({ fotos: [...p.fotos, ruta] }).eq('id', p.id);
  if (error) return a.json({ error: 'No se pudo guardar la foto.' }, 500);
  return a.json({ ok: true });
}

export async function manejarFotoBorrar(admin: SupabaseClient, a: Ayudas, inspeccionId: string, puntoId: unknown, ruta: unknown) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, true);
  if (ctx instanceof Response) return ctx;
  const p = await puntoDe(admin, inspeccionId, puntoId);
  if (!p) return a.json({ error: 'Punto no encontrado.' }, 404);
  if (typeof ruta !== 'string' || !p.fotos.includes(ruta)) return a.json({ error: 'Foto no encontrada.' }, 404);
  const { error } = await admin.from('inspeccion_puntos').update({ fotos: p.fotos.filter((f) => f !== ruta) }).eq('id', p.id);
  if (error) return a.json({ error: 'No se pudo borrar la foto.' }, 500);
  await borrarArchivos(admin, [ruta]);
  return a.json({ ok: true });
}

export async function manejarTerminar(admin: SupabaseClient, a: Ayudas, tecnico: Tecnico, inspeccionId: string, notaGeneral: unknown) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, true);
  if (ctx instanceof Response) return ctx;
  const nota = limpiarTexto(notaGeneral, NOTA_GENERAL_MAX);
  if (nota === undefined) return a.json({ error: `La nota general admite hasta ${NOTA_GENERAL_MAX} caracteres.` }, 400);

  const { data } = await admin.from('inspeccion_puntos').select('estado, precio').eq('inspeccion_id', inspeccionId);
  const puntos = ((data ?? []) as { estado: never; precio: number | null }[]);
  if (!puedeTerminar(puntos)) return a.json({ error: 'Marca al menos un punto antes de terminar.' }, 400);
  const r = resumenPuntos(puntos);

  const ahora = new Date().toISOString();
  const { error } = await admin.from('inspecciones')
    .update({ estado: 'terminada', terminada_en: ahora, realizada_por: tecnico.nombre, nota_general: nota })
    .eq('id', inspeccionId).eq('estado', BORRADOR);
  if (error) return a.json({ error: 'No se pudo terminar la inspección.' }, 500);
  await a.registrar(ctx.ot.id, `Inspección terminada por ${tecnico.nombre}: ${r.urgente} urgente(s), ${r.atencion} en atención, ${r.bien} bien.`);
  return a.json({ ok: true });
}

export async function manejarReabrir(admin: SupabaseClient, a: Ayudas, tecnico: Tecnico, inspeccionId: string) {
  const ctx = await inspeccionEditable(admin, a, inspeccionId, false);
  if (ctx instanceof Response) return ctx;
  if (ctx.insp.estado !== 'terminada') return a.json({ error: 'Solo se puede reabrir una inspección terminada y aún no enviada al cliente.' }, 409);
  const { error } = await admin.from('inspecciones').update({ estado: BORRADOR, terminada_en: null }).eq('id', inspeccionId).eq('estado', 'terminada');
  if (error) return a.json({ error: 'No se pudo reabrir.' }, 500);
  await a.registrar(ctx.ot.id, `${tecnico.nombre} reabrió la inspección para corregirla.`);
  return a.json({ ok: true });
}
