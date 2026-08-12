import { Usuario, ModuloId } from '../types';

// Almacenamiento local que queda pendiente de migrar a Supabase:
//  - Configuración de empresa (empresa_config)
//  - Usuarios legacy del Panel de Administración (migran con una Edge Function)
// El resto de entidades (vehículos, clientes, técnicos, OT, alertas,
// notificaciones, facturas) ya viven en Supabase (ver src/lib/data/*).

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
