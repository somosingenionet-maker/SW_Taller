import { Usuario, ModuloId } from '../types';

// Almacenamiento local que queda pendiente de migrar a Supabase:
//  - Usuarios legacy del Panel de Administración (migran con una Edge Function)
// El resto de entidades (vehículos, clientes, técnicos, OT, alertas,
// notificaciones, facturas, configuración de empresa) ya viven en Supabase
// (ver src/lib/data/*).

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
