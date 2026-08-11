export interface Vehiculo {
  id: string;
  marca: string;
  modelo: string;
  anio?: number;
  color?: string;
  combustible?: 'gasolina' | 'diesel' | 'hibrido' | 'electrico' | 'otro';
  matricula: string;
  bastidor: string;
  kilometraje: number;
  itvVencimiento: string;       // YYYY-MM-DD
  seguroVencimiento: string;    // YYYY-MM-DD
  impuestoVencimiento: string;  // YYYY-MM-DD
  fechaRegistro: string;
}

// ─── Órdenes de Trabajo ───────────────────────────────────────────────────────

export type OTEstado =
  | 'presupuesto'
  | 'recibido'
  | 'en_reparacion'
  | 'listo'
  | 'entregado'
  | 'cancelado';

export type LineaOTTipo = 'mano_de_obra' | 'pieza' | 'material';

export interface EventoOT {
  fecha: string;       // ISO timestamp
  descripcion: string; // Texto legible del evento
}

export interface LineaOT {
  id: string;
  tipo: LineaOTTipo;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  /** Coste real para el taller. Usado en rentabilidad para calcular margen. */
  costoUnitario?: number;
  subtotal: number;
}

export interface OrdenTrabajo {
  id: string;
  numero: string;
  vehiculoId: string;
  clienteId: string;
  estado: OTEstado;
  fechaRecepcion: string;
  fechaEstimadaEntrega?: string;
  fechaEntrega?: string;
  kilometrajeEntrada: number;
  kilometrajeSalida?: number;
  /** Síntoma descrito por el cliente. */
  descripcionProblema: string;
  /** Diagnóstico del mecánico. */
  diagnostico?: string;
  tecnicoAsignado?: string;
  lineas: LineaOT[];
  subtotal: number;
  ivaPct: number;
  totalIva: number;
  total: number;
  notas?: string;
  /** Indica si el presupuesto ya fue enviado al cliente. */
  presupuestoEstado?: 'pendiente' | 'enviado';
  /** true cuando el presupuesto fue aprobado por el cliente: se salta el estado 'presupuesto' al recibir el vehículo. */
  presupuestoAprobado?: boolean;
  /** Marca que ya se notificó al cliente cuando el estado es 'listo'. */
  notificacionEnviada?: boolean;
  /** Timestamp ISO de la última modificación — usado para ordenar la lista. */
  fechaActualizacion: string;
  /** Registro cronológico de eventos de esta OT. */
  historial: EventoOT[];
  /** Factura generada desde esta OT. */
  facturaId?: string;
}

export interface InteraccionCliente {
  id: string;
  fecha: string;
  tipo: 'llamada' | 'email' | 'visita' | 'whatsapp' | 'registro_contrato';
  notas: string;
}

export interface Cliente {
  id: string;
  nombre: string;
  apellidos: string;
  nifNiePasaporte: string;
  correo: string;
  telefono: string;
  direccion: string;
  ciudad?: string;
  pais?: string;
  interacciones: InteraccionCliente[];
  fechaRegistro: string;
  /** IDs de los vehículos de flota (taller) asociados a este cliente. */
  vehiculosAsociados?: string[];
}

export type AlertaTipo = 'itv' | 'mantenimiento' | 'seguro' | 'impuesto';

export interface Alerta {
  id: string;
  vehiculoId: string;
  tipo: AlertaTipo;
  descripcion: string;
  estado: 'activa' | 'pendiente' | 'atendida';
  /** Fecha límite para alertas por vencimiento (ITV, seguro, impuesto). */
  fechaLimite?: string;
  /** Kilometraje límite para alertas por odómetro (mantenimiento). */
  kilometrajeLimite?: number;
}

export interface NotificacionCliente {
  id: string;
  clienteId: string;
  vehiculoId?: string;
  tipoEnvio: 'email' | 'sms' | 'whatsapp';
  asunto?: string;
  mensaje: string;
  fechaEnvio: string;
  leido: boolean;
  tipoEvento: 'mantenimiento_preventivo' | 'itv_proxima' | 'vencimiento_seguro' | 'reparacion_lista';
}

export interface Tecnico {
  id: string;
  nombre: string;
  especialidad?: string;
  activo: boolean;
}

/** Identificador de módulo funcional. Controla qué pestañas ve cada usuario. */
export type ModuloId = 'vehiculos' | 'clientes' | 'taller' | 'alertas' | 'rentabilidad' | 'facturas';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  /** SHA-256(SALT + contraseña). Nunca se almacena la contraseña en claro. */
  passwordHash: string;
  rol: 'admin' | 'usuario';
  modulos: ModuloId[];
  activo: boolean;
  fechaCreacion: string;
}

export interface LineaDocumento {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface Factura {
  id: string;
  numero: string;
  clienteId: string;
  vehiculoId?: string;
  /** IDs de las Órdenes de Trabajo cuyas líneas se importaron a esta factura. */
  otIds: string[];
  fecha: string;
  fechaVencimiento: string;
  estado: 'borrador' | 'emitida' | 'pagada' | 'vencida' | 'cancelada';
  lineas: LineaDocumento[];
  notas: string;
  subtotal: number;
  ivaPct: number;
  totalIva: number;
  total: number;
}
