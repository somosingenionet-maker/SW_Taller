// Lógica pura del Portal del Cliente, separada de index.ts para poder
// testearla con `deno test` sin arrancar el servidor HTTP.

export type Cliente = { id: string; empresa_id: string; nombre: string; apellidos: string };

// El único control de acceso de "responder presupuesto": evita que un
// cliente autenticado por SU token apruebe/rechace el presupuesto de OTRO
// cliente adivinando o probando un otId ajeno.
export function puedeResponderPresupuesto(cliente: Cliente, ot: { cliente_id: string }): boolean {
  return ot.cliente_id === cliente.id;
}

export const ESTADOS_OT_ACTIVOS = new Set(['presupuesto', 'recibido', 'en_reparacion', 'listo']);

export type OtCliente = {
  id: string; numero: string; vehiculo_id: string; estado: string; fecha_estimada_entrega: string | null; created_at: string;
  total: number; presupuesto_estado: string | null; presupuesto_aprobado: boolean | null;
};

// Un vehículo puede tener una OT a nombre de este cliente sin estar
// formalmente asociado en cliente_vehiculo (p. ej. un vehículo de flota que
// factura otro contacto) — la lista a mostrar es la UNIÓN de ambas fuentes,
// nunca solo la relación explícita, o ese caso se queda sin nombre de vehículo.
export function calcularVehiculosAMostrar(asociadosIds: string[], ordenes: OtCliente[]): string[] {
  const activasVehiculoIds = ordenes.filter((o) => ESTADOS_OT_ACTIVOS.has(o.estado)).map((o) => o.vehiculo_id);
  return [...new Set([...asociadosIds, ...activasVehiculoIds])];
}

// Solo la OT activa más reciente por vehículo. Asume `ordenes` ya viene
// ordenado desc por fecha (created_at) — se queda con la primera coincidencia.
export function otActivaPorVehiculo(ordenes: OtCliente[]): Map<string, OtCliente> {
  const mapa = new Map<string, OtCliente>();
  for (const ot of ordenes) {
    if (ESTADOS_OT_ACTIVOS.has(ot.estado) && !mapa.has(ot.vehiculo_id)) mapa.set(ot.vehiculo_id, ot);
  }
  return mapa;
}

// Presupuestos enviados al cliente que siguen sin respuesta — los únicos que
// debe poder aprobar/rechazar desde el portal.
export function presupuestosPendientes(ordenes: OtCliente[]): OtCliente[] {
  return ordenes.filter((o) => o.presupuesto_estado === 'enviado' && o.presupuesto_aprobado == null);
}

// ---- Informe de inspección digital ----

export type InspeccionCliente = {
  id: string; orden_id: string; vehiculo_id: string; cliente_id: string; estado: string;
  nota_general: string | null; enviada_en: string | null; respondida_en: string | null; fotos_borradas_en: string | null;
};
export type PuntoCliente = {
  id: string; categoria: string; nombre: string; posicion: number; estado: string | null;
  nota: string | null; fotos: string[]; reparacion: string | null; precio: number | null; decision: string | null;
};

// Un cliente solo responde a SUS inspecciones, y solo mientras estén «enviadas» (una vez respondida, no se cambia).
export function puedeResponderInspeccion(cliente: Cliente, insp: Pick<InspeccionCliente, 'cliente_id' | 'estado'>): boolean {
  return insp.cliente_id === cliente.id && insp.estado === 'enviada';
}

/** Puntos sobre los que el cliente decide: con problema y con precio. */
export function puntosAprobables(puntos: Pick<PuntoCliente, 'estado' | 'precio'>[]): number {
  return puntos.filter((p) => (p.estado === 'urgente' || p.estado === 'atencion') && p.precio !== null && p.precio > 0).length;
}

/**
 * Lo que ve el cliente: primero lo urgente, luego lo que requiere atención y, de lo demás, solo cuántos
 * puntos están bien. Los «sin marcar» y «no aplica» no se enseñan. Las fotos llegan como enlaces que caducan.
 */
export function formatearInforme(
  insp: InspeccionCliente, vehiculo: string, puntos: PuntoCliente[], urls: Map<string, string>,
) {
  const detalle = (p: PuntoCliente) => ({
    id: p.id, categoria: p.categoria, nombre: p.nombre, nota: p.nota, reparacion: p.reparacion, precio: p.precio,
    decision: p.decision,
    fotos: p.fotos.map((r) => urls.get(r)).filter((u): u is string => !!u),
  });
  const ordenados = [...puntos].sort((a, b) => a.posicion - b.posicion);
  const urgentes = ordenados.filter((p) => p.estado === 'urgente').map(detalle);
  const atencion = ordenados.filter((p) => p.estado === 'atencion').map(detalle);
  const aprobables = ordenados.filter((p) => (p.estado === 'urgente' || p.estado === 'atencion') && p.precio !== null && p.precio > 0);
  return {
    id: insp.id,
    otId: insp.orden_id,
    vehiculo,
    estado: insp.estado,
    enviadaEn: insp.enviada_en,
    respondidaEn: insp.respondida_en,
    notaGeneral: insp.nota_general,
    fotosEliminadas: insp.fotos_borradas_en !== null,
    urgentes,
    atencion,
    bien: ordenados.filter((p) => p.estado === 'bien').length,
    totalAprobable: Math.round(aprobables.reduce((s, p) => s + (p.precio ?? 0), 0) * 100) / 100,
    puntosAprobables: aprobables.length,
  };
}

// ---- Aceptación del presupuesto con prueba ----

const fmtEuros = (n: number) => n.toFixed(2).replace('.', ',');

/** Texto que el cliente lee y acepta. Lo construye el SERVIDOR y es exactamente lo que se guarda como prueba. */
export function textoAceptacion(numero: string, vehiculo: string, total: number): string {
  return `Acepto el presupuesto ${numero} para ${vehiculo} por un importe de ${fmtEuros(total)} € (IVA incluido) y autorizo la realización de los trabajos descritos.`;
}

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type ResultadoAceptacion =
  | { ok: true; nombre: string }
  | { ok: false; error: string; status: number };

/**
 * Valida lo que envía el cliente al aceptar. `totalVisto` es el importe que tenía en pantalla: si el taller lo
 * cambió mientras decidía, se rechaza (nadie acepta una cifra distinta de la que vio).
 */
export function validarAceptacion(
  entrada: { nombre: unknown; acepta: unknown; totalVisto: unknown }, totalActual: number,
): ResultadoAceptacion {
  if (entrada.acepta !== true) return { ok: false, error: 'Marca la casilla para aceptar el presupuesto.', status: 400 };
  const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.replace(/\s+/g, ' ').trim() : '';
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, error: 'Escribe tu nombre (entre 2 y 120 caracteres).', status: 400 };
  const visto = typeof entrada.totalVisto === 'number' ? redondear2(entrada.totalVisto) : NaN;
  if (!(totalActual > 0)) return { ok: false, error: 'Este presupuesto no tiene importe.', status: 400 };
  if (visto !== redondear2(totalActual)) {
    return { ok: false, error: 'El importe del presupuesto ha cambiado. Recarga la página y revísalo antes de aceptar.', status: 409 };
  }
  return { ok: true, nombre };
}

/** Navegador y sistema del cliente, recortado y sin saltos de línea (para guardarlo como prueba). */
export function dispositivoDe(userAgent: string | null): string | null {
  const ua = (userAgent ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
  return ua === '' ? null : ua;
}

/** IP del cliente tal como llega del proxy; null si no se conoce (no se guarda «desconocida»). */
export function ipDeCabecera(xForwardedFor: string | null): string | null {
  const ip = (xForwardedFor?.split(',')[0] ?? '').trim().slice(0, 64);
  return ip === '' ? null : ip;
}

// ---- Aceptación de la inspección punto por punto ----

export type PuntoElegible = { id: string; nombre: string; precio: number };

/** Puntos sobre los que el cliente puede decidir: con problema y con precio. */
export function puntosElegibles(puntos: { id: string; nombre: string; estado: string | null; precio: number | string | null }[]): PuntoElegible[] {
  return puntos
    .filter((p) => (p.estado === 'urgente' || p.estado === 'atencion') && p.precio !== null && Number(p.precio) > 0)
    .map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio) }));
}

export type ResultadoAceptacionInspeccion =
  | { ok: true; aprobados: string[]; rechazados: string[]; total: number; nombre: string | null }
  | { ok: false; error: string; status: number };

/**
 * Valida lo que envía el cliente: qué reparaciones aprueba (las demás con precio quedan rechazadas). Si aprueba
 * alguna hace falta nombre, casilla y el importe que tenía delante (suma de lo marcado). Aprobar ninguna es
 * rechazarlo todo y no pide datos.
 */
export function validarAceptacionInspeccion(
  entrada: { aprobados: unknown; nombre: unknown; acepta: unknown; totalVisto: unknown }, elegibles: PuntoElegible[],
): ResultadoAceptacionInspeccion {
  if (!Array.isArray(entrada.aprobados) || entrada.aprobados.some((x) => typeof x !== 'string')) {
    return { ok: false, error: 'Actualiza la página e inténtalo de nuevo.', status: 400 };
  }
  const ids = [...new Set(entrada.aprobados as string[])];
  const validos = new Set(elegibles.map((e) => e.id));
  if (ids.some((id) => !validos.has(id))) return { ok: false, error: 'Alguna de las reparaciones marcadas no existe en este informe.', status: 400 };
  const rechazados = elegibles.map((e) => e.id).filter((id) => !ids.includes(id));
  if (ids.length === 0) return { ok: true, aprobados: [], rechazados, total: 0, nombre: null };

  if (entrada.acepta !== true) return { ok: false, error: 'Marca la casilla para aceptar las reparaciones.', status: 400 };
  const nombre = typeof entrada.nombre === 'string' ? entrada.nombre.replace(/\s+/g, ' ').trim() : '';
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, error: 'Escribe tu nombre (entre 2 y 120 caracteres).', status: 400 };
  const total = redondear2(elegibles.filter((e) => ids.includes(e.id)).reduce((s, e) => s + e.precio, 0));
  const visto = typeof entrada.totalVisto === 'number' ? redondear2(entrada.totalVisto) : NaN;
  if (visto !== total) return { ok: false, error: 'El importe del informe ha cambiado. Recarga la página y revísalo antes de aceptar.', status: 409 };
  return { ok: true, aprobados: ids, rechazados, total, nombre };
}

/** Texto que queda guardado como prueba: qué reparaciones se aceptaron y por cuánto. */
export function textoAceptacionInspeccion(vehiculo: string, fechaIso: string | null, aprobados: { nombre: string; precio: number }[], total: number): string {
  const fecha = fechaIso ? new Date(fechaIso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : '';
  const lista = aprobados.map((a) => `${a.nombre} (${fmtEuros(a.precio)} €)`).join('; ');
  return `Acepto las siguientes reparaciones del informe de inspección${fecha ? ` del ${fecha}` : ''} de ${vehiculo}: ${lista}. Importe total: ${fmtEuros(total)} € (IVA no incluido), y autorizo su realización.`;
}
