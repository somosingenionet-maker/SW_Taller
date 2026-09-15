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
