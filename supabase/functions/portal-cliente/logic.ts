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
  id: string; vehiculo_id: string; estado: string; fecha_estimada_entrega: string | null; created_at: string;
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
