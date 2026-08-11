import { Vehiculo, Cliente, Alerta, NotificacionCliente, Usuario, ModuloId, Factura, OrdenTrabajo } from '../types';

export const INITIAL_VEHICULES: Vehiculo[] = [
  {
    id: 'veh-1',
    marca: 'Toyota',
    modelo: 'Auris Hybrid',
    anio: 2019,
    color: 'Blanco',
    combustible: 'hibrido',
    matricula: '2840-KPT',
    bastidor: 'SB1ZA3JE40E819385',
    kilometraje: 142500,
    itvVencimiento: '2026-07-15',
    seguroVencimiento: '2026-10-10',
    impuestoVencimiento: '2027-05-20',
    fechaRegistro: '2022-03-12'
  },
  {
    id: 'veh-2',
    marca: 'Seat',
    modelo: 'León TSI',
    anio: 2021,
    color: 'Gris',
    combustible: 'gasolina',
    matricula: '8912-LMN',
    bastidor: 'VSSZZZ5FZHR041920',
    kilometraje: 95400,
    itvVencimiento: '2026-06-25',
    seguroVencimiento: '2026-06-18',
    impuestoVencimiento: '2027-05-20',
    fechaRegistro: '2023-01-15'
  },
  {
    id: 'veh-3',
    marca: 'Peugeot',
    modelo: '3008 BlueHDi',
    anio: 2018,
    color: 'Negro',
    combustible: 'diesel',
    matricula: '5531-KXT',
    bastidor: 'VF3JRHNYHHS592183',
    kilometraje: 188300,
    itvVencimiento: '2026-12-05',
    seguroVencimiento: '2026-09-01',
    impuestoVencimiento: '2027-05-20',
    fechaRegistro: '2021-08-04'
  },
  {
    id: 'veh-4',
    marca: 'Volkswagen',
    modelo: 'Golf TDI',
    anio: 2017,
    color: 'Azul',
    combustible: 'diesel',
    matricula: '4410-JVZ',
    bastidor: 'WVWZZZAUZGW289410',
    kilometraje: 119800,
    itvVencimiento: '2027-02-14',
    seguroVencimiento: '2026-11-15',
    impuestoVencimiento: '2027-05-20',
    fechaRegistro: '2020-11-20'
  },
  {
    id: 'veh-5',
    marca: 'BMW',
    modelo: 'Serie 3 320d',
    anio: 2022,
    color: 'Plata',
    combustible: 'diesel',
    matricula: '0123-MBL',
    bastidor: 'WBA8C51040A591280',
    kilometraje: 62000,
    itvVencimiento: '2028-04-10',
    seguroVencimiento: '2026-07-30',
    impuestoVencimiento: '2027-05-20',
    fechaRegistro: '2024-04-10'
  }
];

export const INITIAL_CLIENTES: Cliente[] = [
  {
    id: 'cli-1',
    nombre: 'Alejandro',
    apellidos: 'Gómez Ruiz',
    nifNiePasaporte: '45123987M',
    correo: 'alejandro.gomez@gmail.com',
    telefono: '+34 611 223 344',
    direccion: 'Calle Mayor 45, 2ºA, Madrid',
    interacciones: [
      { id: 'int-cli-1-1', fecha: '2026-05-10', tipo: 'llamada', notas: 'Solicita presupuesto para la revisión de los 150.000 km de su Toyota Auris.' },
      { id: 'int-cli-1-2', fecha: '2026-05-12', tipo: 'registro_contrato', notas: 'Registro de la ficha de cliente en el sistema CRM de Backoffice.' }
    ],
    fechaRegistro: '2024-02-10'
  },
  {
    id: 'cli-2',
    nombre: 'María Pilar',
    apellidos: 'Sánchez Ortiz',
    nifNiePasaporte: '02894156X',
    correo: 'pilar.sanchez.cortes@outlook.com',
    telefono: '+34 655 443 322',
    direccion: 'Avenida de la Constitución 12, Sevilla',
    interacciones: [
      { id: 'int-cli-2-1', fecha: '2026-04-18', tipo: 'visita', notas: 'Usuario habitual. Solicita presupuesto de renting a largo plazo.' },
      { id: 'int-cli-2-2', fecha: '2026-06-01', tipo: 'whatsapp', notas: 'Consulta si el Seat León (veh-2) está disponible libre de avería.' }
    ],
    fechaRegistro: '2023-11-05'
  },
  {
    id: 'cli-3',
    nombre: 'Carlos',
    apellidos: 'Benítez Varga',
    nifNiePasaporte: 'Y1284562P',
    correo: 'carlos.benitez@ingenio.es',
    telefono: '+34 688 991 122',
    direccion: 'Paseo de Gracia 89, Barcelona',
    interacciones: [
      { id: 'int-cli-3-1', fecha: '2026-05-20', tipo: 'email', notas: 'Reportó leve ruido metálico en Peugeot 3008 tras entrega. Se agendó revisión.' }
    ],
    fechaRegistro: '2025-01-20'
  },
  {
    id: 'cli-4',
    nombre: 'Lucía',
    apellidos: 'Fernández Cobo',
    nifNiePasaporte: '71924158W',
    correo: 'lucia.fc@gmail.com',
    telefono: '+34 600 112 233',
    direccion: 'Calle Alcalá 120, Madrid',
    interacciones: [
      { id: 'int-cli-4-1', fecha: '2026-06-05', tipo: 'llamada', notas: 'Nueva cliente. Solicita cita para diagnóstico de ruido en frenos de su BMW Serie 3.' }
    ],
    fechaRegistro: '2026-06-05'
  }
];

export const INITIAL_ALERTAS: Alerta[] = [
  {
    id: 'al-1',
    vehiculoId: 'veh-2',
    tipo: 'itv',
    descripcion: 'Inspección Técnica de Vehículo (ITV) vence el 2026-06-25.',
    estado: 'activa',
    fechaLimite: '2026-06-25'
  },
  {
    id: 'al-2',
    vehiculoId: 'veh-2',
    tipo: 'seguro',
    descripcion: 'Póliza de seguro a todo riesgo de Mapfre vence el 2026-06-18.',
    estado: 'activa',
    fechaLimite: '2026-06-18'
  },
  {
    id: 'al-3',
    vehiculoId: 'veh-4',
    tipo: 'mantenimiento',
    descripcion: 'Cambio de aceite de motor y filtros recomendado a los 120.000 kms (kilometraje actual: 119.800 km).',
    estado: 'activa',
    kilometrajeLimite: 120000
  },
  {
    id: 'al-4',
    vehiculoId: 'veh-1',
    tipo: 'itv',
    descripcion: 'ITV del vehículo vence pronto el 2026-07-15.',
    estado: 'pendiente',
    fechaLimite: '2026-07-15'
  }
];

export const INITIAL_NOTIFICACIONES: NotificacionCliente[] = [
  {
    id: 'not-3',
    clienteId: 'cli-3',
    vehiculoId: 'veh-3',
    tipoEnvio: 'sms',
    mensaje: 'inGenio taller: Carlos, su vehiculo Peugeot 3008 (5531-KXT) ya tiene solucionado el problema del piloto motor tras cambiar la válvula EGR. Puede retirar el coche cuando desee. Coste final: 480.00 €.',
    fechaEnvio: '2026-04-02 18:00',
    leido: true,
    tipoEvento: 'reparacion_lista'
  }
];

// Acceso seguro a localStorage: devuelve el valor por defecto si la clave
// no existe o si el JSON almacenado está corrupto.
const getLocalStorageItem = <T>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.error(`Error reading ${key} from localStorage`, err);
    return defaultValue;
  }
};

const setLocalStorageItem = <T>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing ${key} to localStorage`, err);
  }
};

export const getVehiculos = () => getLocalStorageItem<Vehiculo[]>('ingenio_vehiculos', INITIAL_VEHICULES);
export const saveVehiculos = (data: Vehiculo[]) => setLocalStorageItem('ingenio_vehiculos', data);

export const getClientes = () => getLocalStorageItem<Cliente[]>('ingenio_clientes', INITIAL_CLIENTES);
export const saveClientes = (data: Cliente[]) => setLocalStorageItem('ingenio_clientes', data);

export const getAlertas = () => getLocalStorageItem<Alerta[]>('ingenio_alertas', INITIAL_ALERTAS);
export const saveAlertas = (data: Alerta[]) => setLocalStorageItem('ingenio_alertas', data);

export const getNotificaciones = () => getLocalStorageItem<NotificacionCliente[]>('ingenio_notificaciones', INITIAL_NOTIFICACIONES);
export const saveNotificaciones = (data: NotificacionCliente[]) => setLocalStorageItem('ingenio_notificaciones', data);


export interface EmpresaConfig {
  nombre: string;
  tagline: string;
  razonSocial: string;
  nif: string;
  direccionFiscal: string;
  correo: string;
  telefono: string;
  web: string;
  ciudad: string;
  brandColor: string;
  logoBase64: string;
}

export const DEFAULT_EMPRESA_CONFIG: EmpresaConfig = {
  nombre: 'inGenio',
  tagline: 'Sistema de Gestión de Flota y CRM de Backoffice',
  razonSocial: 'inGenio Datos y Comunicaciones S.L.',
  nif: 'B-89419102',
  direccionFiscal: 'Calle Mayor 45, Planta 2, Madrid',
  correo: 'proyectos@somosingenio.net',
  telefono: '(+34) 696 722 198',
  web: 'www.somosingenio.net',
  ciudad: 'Madrid (España)',
  brandColor: '#2563eb',
  logoBase64: '',
};

// Se hace spread con DEFAULT_EMPRESA_CONFIG para que configuraciones guardadas
// en versiones anteriores (sin los campos nuevos) reciban los valores por
// defecto en lugar de devolver `undefined`.
export const getEmpresaConfig = (): EmpresaConfig => ({
  ...DEFAULT_EMPRESA_CONFIG,
  ...getLocalStorageItem<Partial<EmpresaConfig>>('ingenio_empresa_config', DEFAULT_EMPRESA_CONFIG),
});

export const saveEmpresaConfig = (data: EmpresaConfig) =>
  setLocalStorageItem('ingenio_empresa_config', data);

const ALL_MODULOS: ModuloId[] = ['vehiculos', 'clientes', 'taller', 'alertas', 'rentabilidad', 'facturas'];

export const DEFAULT_ADMIN: Usuario = {
  id: 'usr-admin',
  nombre: 'Administrador',
  email: 'admin@ingenio.net',
  // SHA-256 de 'admin123' (ver utils/auth.ts)
  passwordHash: '108062f7485618c99bf2752056bdaf172c87cc3d0d883b78e40049aa20886447',
  rol: 'admin',
  modulos: ALL_MODULOS,
  activo: true,
  fechaCreacion: '2024-01-01',
};

export const getUsuarios = (): Usuario[] =>
  getLocalStorageItem<Usuario[]>('ingenio_usuarios', [DEFAULT_ADMIN]);

export const saveUsuarios = (data: Usuario[]) =>
  setLocalStorageItem('ingenio_usuarios', data);

export const getFacturas = (): Factura[] =>
  getLocalStorageItem<Factura[]>('ingenio_facturas', []);

export const saveFacturas = (data: Factura[]) =>
  setLocalStorageItem('ingenio_facturas', data);

export const INITIAL_ORDENES_TRABAJO: OrdenTrabajo[] = [
  {
    id: 'ot-1',
    numero: 'OT-2026-001',
    vehiculoId: 'veh-4',
    clienteId: 'cli-3',
    estado: 'entregado',
    fechaRecepcion: '2026-05-10',
    fechaEstimadaEntrega: '2026-05-13',
    fechaEntrega: '2026-05-13',
    kilometrajeEntrada: 114000,
    kilometrajeSalida: 114005,
    descripcionProblema: 'El coche no arranca bien por las mañanas y a veces se apaga solo.',
    diagnostico: 'Batería de arranque en mal estado. Tensión en frío: 9.8V. Recomendada sustitución inmediata.',
    tecnicoAsignado: 'Miguel Ángel',
    lineas: [
      { id: 'lot-1-1', tipo: 'pieza', descripcion: 'Batería Varta E39 AGM 70Ah', cantidad: 1, precioUnitario: 175, costoUnitario: 110, subtotal: 175 },
      { id: 'lot-1-2', tipo: 'mano_de_obra', descripcion: 'Mano de obra sustitución batería', cantidad: 0.5, precioUnitario: 60, costoUnitario: 25, subtotal: 30 },
    ],
    subtotal: 205,
    ivaPct: 21,
    totalIva: 43.05,
    total: 248.05,
    notas: 'Fallo de arranque inicial por baja tensión con clima invernal.',
    fechaActualizacion: '2026-05-13T10:00:00.000Z',
    historial: [
      { fecha: '2026-05-10T09:00:00.000Z', descripcion: 'Vehículo recibido en taller' },
      { fecha: '2026-05-10T11:30:00.000Z', descripcion: 'Presupuesto generado' },
      { fecha: '2026-05-10T12:00:00.000Z', descripcion: 'Presupuesto enviado al cliente' },
      { fecha: '2026-05-10T14:00:00.000Z', descripcion: 'Reparación iniciada' },
      { fecha: '2026-05-13T09:00:00.000Z', descripcion: 'Trabajo completado' },
      { fecha: '2026-05-13T10:00:00.000Z', descripcion: 'Vehículo entregado al cliente' },
    ],
  },
  {
    id: 'ot-2',
    numero: 'OT-2026-002',
    vehiculoId: 'veh-4',
    clienteId: 'cli-3',
    estado: 'en_reparacion' as const,
    fechaRecepcion: '2026-06-10',
    fechaEstimadaEntrega: '2026-06-14',
    kilometrajeEntrada: 119800,
    descripcionProblema: 'Luz de revisión encendida. Consumo de aceite elevado.',
    diagnostico: 'Revisión diagnóstico: código P0011 (distribución árbol de levas). Requiere cambio de aceite y revisión de la válvula de control de distribución.',
    tecnicoAsignado: 'Miguel Ángel',
    lineas: [
      { id: 'lot-2-1', tipo: 'pieza', descripcion: 'Aceite motor 5W30 (5L)', cantidad: 1, precioUnitario: 45, costoUnitario: 28, subtotal: 45 },
      { id: 'lot-2-2', tipo: 'pieza', descripcion: 'Filtro de aceite', cantidad: 1, precioUnitario: 18, costoUnitario: 8, subtotal: 18 },
      { id: 'lot-2-3', tipo: 'pieza', descripcion: 'Válvula control distribución VW', cantidad: 1, precioUnitario: 120, costoUnitario: 75, subtotal: 120 },
      { id: 'lot-2-4', tipo: 'mano_de_obra', descripcion: 'Mano de obra diagnóstico y reparación', cantidad: 2, precioUnitario: 60, costoUnitario: 25, subtotal: 120 },
    ],
    subtotal: 303,
    ivaPct: 21,
    totalIva: 63.63,
    total: 366.63,
    fechaActualizacion: '2026-06-10T09:00:00.000Z',
    historial: [
      { fecha: '2026-06-10T09:00:00.000Z', descripcion: 'Vehículo recibido en taller' },
      { fecha: '2026-06-10T10:00:00.000Z', descripcion: 'Presupuesto generado' },
      { fecha: '2026-06-10T10:30:00.000Z', descripcion: 'Presupuesto enviado al cliente' },
      { fecha: '2026-06-11T08:00:00.000Z', descripcion: 'Reparación iniciada' },
    ],
  },
  {
    id: 'ot-3',
    numero: 'OT-2026-003',
    vehiculoId: 'veh-4',
    clienteId: 'cli-2',
    estado: 'presupuesto',
    presupuestoEstado: 'enviado',
    fechaRecepcion: '2026-06-12',
    fechaEstimadaEntrega: '2026-06-16',
    kilometrajeEntrada: 95400,
    descripcionProblema: 'Ruido metálico en la parte delantera al frenar.',
    diagnostico: 'Pastillas de freno delanteras al límite. Discos con marcas de desgaste. Recomiendo cambio completo del sistema delantero.',
    tecnicoAsignado: 'Raúl García',
    lineas: [
      { id: 'lot-3-1', tipo: 'pieza', descripcion: 'Kit pastillas Brembo delanteras', cantidad: 1, precioUnitario: 85, costoUnitario: 50, subtotal: 85 },
      { id: 'lot-3-2', tipo: 'pieza', descripcion: 'Discos de freno delanteros (par)', cantidad: 1, precioUnitario: 130, costoUnitario: 80, subtotal: 130 },
      { id: 'lot-3-3', tipo: 'mano_de_obra', descripcion: 'Sustitución frenos delanteros', cantidad: 1.5, precioUnitario: 60, costoUnitario: 25, subtotal: 90 },
    ],
    subtotal: 305,
    ivaPct: 21,
    totalIva: 64.05,
    total: 369.05,
    fechaActualizacion: '2026-06-12T08:00:00.000Z',
    historial: [
      { fecha: '2026-06-12T08:00:00.000Z', descripcion: 'Presupuesto creado' },
      { fecha: '2026-06-12T08:30:00.000Z', descripcion: 'Presupuesto enviado al cliente' },
    ],
  },
  {
    id: 'ot-4',
    numero: 'OT-2026-004',
    vehiculoId: 'veh-4',
    clienteId: 'cli-1',
    estado: 'recibido',
    fechaRecepcion: '2026-06-12',
    kilometrajeEntrada: 62000,
    descripcionProblema: 'Revisión previa al verano. Quiere revisar aire acondicionado y frenos traseros.',
    tecnicoAsignado: 'Raúl García',
    lineas: [],
    subtotal: 0,
    ivaPct: 21,
    totalIva: 0,
    total: 0,
    fechaActualizacion: '2026-06-12T11:00:00.000Z',
    historial: [
      { fecha: '2026-06-12T11:00:00.000Z', descripcion: 'Vehículo recibido en taller' },
    ],
  },
];

export const getOrdenesTrabajo = (): OrdenTrabajo[] => {
  const data = getLocalStorageItem<OrdenTrabajo[]>('ingenio_ordenes_trabajo', INITIAL_ORDENES_TRABAJO);
  const ESTADO_LABEL: Record<string, string> = {
    presupuesto:   'Presupuesto creado',
    recibido:      'Vehículo recibido en taller',
    en_reparacion: 'Reparación iniciada',
    listo:         'Trabajo completado',
    entregado:     'Vehículo entregado al cliente',
    cancelado:     'OT cancelada',
    cotizacion:    'Presupuesto creado',
  };
  return data.map(ot => {
    const estadoNormalizado = (ot.estado as string) === 'cotizacion' ? 'presupuesto' as const : ot.estado;
    const historialBase: OrdenTrabajo['historial'] = ot.historial?.length
      ? ot.historial
      : [{ fecha: ot.fechaRecepcion + 'T00:00:00.000Z', descripcion: ESTADO_LABEL[ot.estado as string] ?? 'OT creada' }];
    return {
      fechaActualizacion: ot.fechaRecepcion + 'T00:00:00.000Z',
      ...ot,
      estado: estadoNormalizado,
      historial: historialBase,
    };
  });
};

export const saveOrdenesTrabajo = (data: OrdenTrabajo[]) =>
  setLocalStorageItem('ingenio_ordenes_trabajo', data);
