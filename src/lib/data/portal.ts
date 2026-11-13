import { invocarPortal } from './invocarPortal';

export interface PortalVehiculo {
  id: string;
  marca: string;
  modelo: string;
  matricula: string;
  estadoOt: 'presupuesto' | 'recibido' | 'en_reparacion' | 'listo' | null;
  fechaEstimadaEntrega: string | null;
}

export interface PortalPresupuestoLinea {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface PortalPresupuesto {
  otId: string;
  vehiculo: string;
  total: number;
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

export interface PortalData {
  empresa: { nombre: string; brandColor: string; logoUrl: string | null } | null;
  cliente: { nombre: string; apellidos: string };
  vehiculos: PortalVehiculo[];
  presupuestosPendientes: PortalPresupuesto[];
  alertas: PortalAlerta[];
  facturas: PortalFactura[];
}

const invokePortal = <T,>(body: Record<string, unknown>) => invocarPortal<T>('portal-cliente', body);

export async function getPortalData(token: string): Promise<PortalData> {
  return invokePortal<PortalData>({ token });
}

export async function responderPresupuesto(token: string, otId: string, aprobado: boolean): Promise<void> {
  await invokePortal<{ ok: true }>({ token, action: 'responder_presupuesto', otId, aprobado });
}
