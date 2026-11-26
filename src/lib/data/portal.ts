import { invocarPortal } from './invocarPortal';

export interface PortalVehiculo {
  id: string;
  marca: string;
  modelo: string;
  matricula: string;
  estadoOt: 'presupuesto' | 'recibido' | 'en_reparacion' | 'listo' | null;
  /** Presupuesto aceptado y coche aún fuera (las versiones antiguas de la función no lo envían). */
  presupuestoAceptado?: boolean;
  fechaEstimadaEntrega: string | null;
}

export interface PortalPresupuestoLinea {
  /** En mano de obra la cantidad son horas. Puede faltar si la función del servidor es anterior. */
  tipo?: 'mano_de_obra' | 'producto';
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PortalPresupuesto {
  otId: string;
  numero: string;
  vehiculo: string;
  total: number;
  /** Texto que el cliente acepta, escrito por el servidor: es exactamente lo que se guarda como prueba. */
  textoAceptacion: string;
  lineas: PortalPresupuestoLinea[];
}

export interface PortalAlerta {
  tipo: 'itv' | 'seguro' | 'impuesto' | 'aceite';
  fechaLimite: string | null;
  kilometrajeLimite: number | null;
}

export interface PortalFactura {
  numero: string;
  fecha: string;
  estado: string;
  total: number;
}

export interface PortalInformePunto {
  id: string;
  categoria: string;
  nombre: string;
  nota: string | null;
  reparacion: string | null;
  precio: number | null;
  decision: 'aprobado' | 'rechazado' | null;
  /** Enlaces de lectura que caducan a la hora (cada visita pide los suyos). */
  fotos: string[];
}

/** Informe de inspección digital que el taller le envió al cliente. */
export interface PortalInforme {
  id: string;
  otId: string;
  vehiculo: string;
  estado: 'enviada' | 'respondida';
  enviadaEn: string | null;
  respondidaEn: string | null;
  notaGeneral: string | null;
  fotosEliminadas: boolean;
  urgentes: PortalInformePunto[];
  atencion: PortalInformePunto[];
  bien: number;
  totalAprobable: number;
  puntosAprobables: number;
}

export interface PortalData {
  empresa: { nombre: string; brandColor: string; logoUrl: string | null } | null;
  cliente: { nombre: string; apellidos: string };
  vehiculos: PortalVehiculo[];
  presupuestosPendientes: PortalPresupuesto[];
  /** Ausente con una versión antigua de la función. */
  informes?: PortalInforme[];
  alertas: PortalAlerta[];
  facturas: PortalFactura[];
}

const invokePortal = <T,>(body: Record<string, unknown>) => invocarPortal<T>('portal-cliente', body);

export async function getPortalData(token: string): Promise<PortalData> {
  return invokePortal<PortalData>({ token });
}

/** Rechazar no pide datos; aceptar exige nombre, casilla marcada y el importe que el cliente tenía delante. */
export async function responderPresupuesto(
  token: string, otId: string, aprobado: boolean, aceptacion?: { nombre: string; totalVisto: number },
): Promise<void> {
  await invokePortal<{ ok: true }>({
    token, action: 'responder_presupuesto', otId, aprobado,
    ...(aprobado && aceptacion ? { nombre: aceptacion.nombre, acepta: true, totalVisto: aceptacion.totalVisto } : {}),
  });
}

/**
 * Responde al informe de inspección: `aprobados` son las reparaciones que el cliente marca (las demás con precio
 * quedan rechazadas). Aprobar alguna exige nombre y el importe que tenía delante; no aprobar ninguna no pide nada.
 */
export async function responderInspeccion(
  token: string, inspeccionId: string, aprobados: string[], aceptacion?: { nombre: string; totalVisto: number },
): Promise<void> {
  await invokePortal<{ ok: true }>({
    token, action: 'responder_inspeccion', inspeccionId, aprobados,
    ...(aprobados.length && aceptacion ? { nombre: aceptacion.nombre, acepta: true, totalVisto: aceptacion.totalVisto } : {}),
  });
}
