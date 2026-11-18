// Constantes y formularios de la orden de trabajo: estados, comprobación de recepción, tipos de línea y valores iniciales.
import type { ReactNode } from 'react';
import { Package, Wrench } from 'lucide-react';
import type { LineaOTTipo, OTEstado } from '../../types';

export const ESTADO_META: Record<OTEstado, { label: string; color: string; bg: string; dot: string }> = {
  presupuesto:   { label: 'Presupuesto',   color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500' },
  recibido:      { label: 'Recibido',      color: 'text-slate-600',  bg: 'bg-slate-100', dot: 'bg-slate-500' },
  en_reparacion: { label: 'En reparación', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  listo:         { label: 'Listo',         color: 'text-cyan-700',   bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
  entregado:     { label: 'Entregado',     color: 'text-teal-700',   bg: 'bg-teal-100', dot: 'bg-teal-500' },
  cancelado:     { label: 'Cancelado',     color: 'text-rose-600',   bg: 'bg-rose-50', dot: 'bg-rose-500' },
};

/** Entrada de las fichas de la orden: ventana centrada que aparece con un fundido. */
export const ENTRADA_PANEL = () => ({ initial: { opacity: 0, scale: 0.97 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.97 }, transition: { duration: 0.16 } });

export const ESTADO_FLOW: OTEstado[] = [
  'presupuesto', 'recibido', 'en_reparacion', 'listo', 'entregado'
];

/** Comprobación fija al recibir el vehículo — misma lista para todas las empresas. */
export const CHECKLIST_RECEPCION_ITEMS = [
  'Neumáticos en buen estado',
  'Luces funcionando correctamente',
  'Sin daños visibles en la carrocería',
  'Documentación entregada (permiso, ITV)',
  'Objetos personales retirados',
];

export const MAX_FOTOS_RECEPCION = 4;

export const TIPO_META: Record<LineaOTTipo, { label: string; icon: ReactNode }> = {
  mano_de_obra: { label: 'Mano de obra', icon: <Wrench size={12} /> },
  producto:     { label: 'Producto',     icon: <Package size={12} /> },
};

export const IVA_DEFAULT = 21;

export interface LineaForm {
  tipo: LineaOTTipo;
  productoId?: string;
  descripcion: string;
  cantidad: number | '';
  precioUnitario: number | '';
  costoUnitario: number | '';
}

export const EMPTY_LINEA: LineaForm = {
  tipo: 'mano_de_obra',
  productoId: undefined,
  descripcion: '',
  cantidad: 1,
  precioUnitario: '',
  costoUnitario: '',
};

export interface OTForm {
  vehiculoId: string;
  clienteId: string;
  fechaRecepcion: string;
  fechaEstimadaEntrega: string;
  kilometrajeEntrada: number | '';
  descripcionProblema: string;
  diagnostico: string;
  tecnicoAsignado: string;
  notas: string;
  ivaPct: number;
  esCambioAceite: boolean;
}

export const EMPTY_OT_FORM: OTForm = {
  vehiculoId: '',
  clienteId: '',
  fechaRecepcion: new Date().toISOString().split('T')[0],
  fechaEstimadaEntrega: '',
  kilometrajeEntrada: '',
  descripcionProblema: '',
  diagnostico: '',
  tecnicoAsignado: '',
  notas: '',
  ivaPct: IVA_DEFAULT,
  esCambioAceite: false,
};
