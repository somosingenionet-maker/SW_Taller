import type { ModuloId } from '../types';

// Guía de primeros pasos de un taller nuevo. Los pasos se calculan con los datos que el taller ya
// tiene (no hay nada que marcar a mano ni tabla propia): cuando haces algo, el paso se tacha solo.

export type PestanaEmpresa = 'identidad' | 'fiscal' | 'marca' | 'recordatorios' | 'tecnicos';

export type AccionPaso =
  | { tipo: 'empresa'; pestana: PestanaEmpresa }
  | { tipo: 'modulo'; modulo: ModuloId };

export interface DatosGuia {
  razonSocial: string;
  nif: string;
  direccionFiscal: string;
  tieneLogo: boolean;
  nTecnicos: number;
  nClientes: number;
  nVehiculos: number;
  nOrdenes: number;
  recordatoriosActivos: boolean;
}

export interface PasoGuia {
  id: string;
  titulo: string;
  descripcion: string;
  hecho: boolean;
  /** Recomendado pero no necesario para empezar a trabajar. */
  opcional: boolean;
  accion: AccionPaso;
  etiquetaAccion: string;
}

const lleno = (s: string | undefined | null) => (s ?? '').trim().length > 0;

export function pasosGuia(d: DatosGuia): PasoGuia[] {
  return [
    {
      id: 'datos', titulo: 'Completa los datos fiscales de tu taller', opcional: false,
      descripcion: 'Razón social, NIF y dirección: salen en tus presupuestos y facturas.',
      hecho: lleno(d.razonSocial) && lleno(d.nif) && lleno(d.direccionFiscal),
      accion: { tipo: 'empresa', pestana: 'fiscal' }, etiquetaAccion: 'Abrir datos fiscales',
    },
    {
      id: 'logo', titulo: 'Sube tu logo y elige tu color', opcional: true,
      descripcion: 'Tus clientes lo verán en los presupuestos, en los correos y en su portal.',
      hecho: d.tieneLogo,
      accion: { tipo: 'empresa', pestana: 'marca' }, etiquetaAccion: 'Personalizar',
    },
    {
      id: 'tecnicos', titulo: 'Da de alta a tus mecánicos', opcional: false,
      descripcion: 'Cada uno recibe un enlace para ver sus coches y marcar tareas desde el móvil.',
      hecho: d.nTecnicos > 0,
      accion: { tipo: 'empresa', pestana: 'tecnicos' }, etiquetaAccion: 'Añadir mecánicos',
    },
    {
      id: 'clientes', titulo: 'Añade o importa tus clientes', opcional: false,
      descripcion: 'Uno a uno o desde un archivo CSV (botón «Importar» en Clientes).',
      hecho: d.nClientes > 0,
      accion: { tipo: 'modulo', modulo: 'clientes' }, etiquetaAccion: 'Ir a Clientes',
    },
    {
      id: 'vehiculos', titulo: 'Añade o importa sus vehículos', opcional: false,
      descripcion: 'Con su matrícula y kilómetros. También se pueden importar desde un CSV.',
      hecho: d.nVehiculos > 0,
      accion: { tipo: 'modulo', modulo: 'vehiculos' }, etiquetaAccion: 'Ir a Vehículos',
    },
    {
      id: 'orden', titulo: 'Crea tu primera orden de trabajo', opcional: false,
      descripcion: 'Un presupuesto o la recepción de un coche: de ahí salen el tablero y la factura.',
      hecho: d.nOrdenes > 0,
      accion: { tipo: 'modulo', modulo: 'taller' }, etiquetaAccion: 'Ir a Taller',
    },
    {
      id: 'avisos', titulo: 'Activa los avisos automáticos a tus clientes', opcional: true,
      descripcion: 'ITV, seguro, impuesto y cambio de aceite: se envían solos por correo.',
      hecho: d.recordatoriosActivos,
      accion: { tipo: 'empresa', pestana: 'recordatorios' }, etiquetaAccion: 'Activar avisos',
    },
  ];
}

export interface ResumenGuia {
  pasos: PasoGuia[];
  hechos: number;
  total: number;
  /** Primer paso por hacer: el que se resalta. Null si ya está todo. */
  siguiente: PasoGuia | null;
  completa: boolean;
}

export function resumenGuia(d: DatosGuia): ResumenGuia {
  const pasos = pasosGuia(d);
  const hechos = pasos.filter((p) => p.hecho).length;
  return { pasos, hechos, total: pasos.length, siguiente: pasos.find((p) => !p.hecho) ?? null, completa: hechos === pasos.length };
}
