import { compacto } from '../ui/navegacion';

/** Lo mínimo de un servicio del catálogo para buscarlo (ver lib/data/servicios). */
interface ServicioBuscable { nombre: string; reparacion: string; activo: boolean }

/** Servicios activos que encajan con lo escrito (sin tildes, mayúsculas ni espacios); con el campo vacío, todos. */
export function serviciosQueCoinciden<T extends ServicioBuscable>(servicios: T[], texto: string): T[] {
  const q = compacto(texto);
  const activos = servicios.filter((s) => s.activo);
  return q ? activos.filter((s) => compacto(`${s.nombre} ${s.reparacion}`).includes(q)) : activos;
}
