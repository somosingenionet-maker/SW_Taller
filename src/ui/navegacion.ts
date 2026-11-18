// Menú del nuevo diseño, acciones de «Nuevo» y buscador global. Todo puro y probado: la pantalla solo lo pinta.
import type { Cliente, ModuloId, OrdenTrabajo, Vehiculo } from '../types';

/** Orden que el marco da a una pestaña al llegar a ella («Nuevo» abre su alta; «buscar» filtra por el texto). `n` cambia en cada orden para que se repita aunque sea igual. */
export interface Intencion { tipo: 'nuevo' | 'buscar'; texto?: string; n: number }

export type IconoId = 'hoy' | 'taller' | 'citas' | 'clientes' | 'vehiculos' | 'alertas' | 'facturas' | 'rentabilidad' | 'compras' | 'inventario';

export interface ItemMenu { id: ModuloId; etiqueta: string; icono: IconoId }
export interface SeccionMenu { titulo: string; items: ItemMenu[] }

/** El menú por tareas. «Hoy» (inicio) es de todos; el resto aparece solo si el usuario tiene ese módulo. */
const MENU: { titulo: string; items: ItemMenu[] }[] = [
  { titulo: 'Trabajo', items: [
    { id: 'inicio', etiqueta: 'Hoy', icono: 'hoy' },
    { id: 'taller', etiqueta: 'En el taller', icono: 'taller' },
    { id: 'citas', etiqueta: 'Citas', icono: 'citas' },
  ] },
  { titulo: 'Clientes y coches', items: [
    { id: 'clientes', etiqueta: 'Clientes', icono: 'clientes' },
    { id: 'vehiculos', etiqueta: 'Vehículos', icono: 'vehiculos' },
    { id: 'alertas', etiqueta: 'Alertas', icono: 'alertas' },
  ] },
  { titulo: 'Dinero', items: [
    { id: 'facturas', etiqueta: 'Facturas', icono: 'facturas' },
    { id: 'rentabilidad', etiqueta: 'Rentabilidad', icono: 'rentabilidad' },
  ] },
  { titulo: 'Compras y stock', items: [
    { id: 'compras', etiqueta: 'Compras', icono: 'compras' },
    { id: 'inventario', etiqueta: 'Inventario', icono: 'inventario' },
  ] },
];

export function construirMenu(modulos: ModuloId[]): SeccionMenu[] {
  return MENU
    .map((s) => ({ titulo: s.titulo, items: s.items.filter((i) => i.id === 'inicio' || modulos.includes(i.id)) }))
    .filter((s) => s.items.length > 0);
}

/** Los cuatro accesos de la barra inferior del móvil (lo demás va en «Más»). Solo los permitidos. */
export const ATAJOS_MOVIL: ModuloId[] = ['inicio', 'taller', 'citas', 'clientes'];
export function atajosMovil(modulos: ModuloId[]): ItemMenu[] {
  const todos = MENU.flatMap((s) => s.items);
  return ATAJOS_MOVIL.map((id) => todos.find((i) => i.id === id) as ItemMenu).filter((i) => i.id === 'inicio' || modulos.includes(i.id));
}

export type AccionNuevo = 'ot' | 'cita' | 'cliente' | 'vehiculo' | 'factura' | 'compra';
export interface OpcionNuevo { accion: AccionNuevo; etiqueta: string; modulo: ModuloId }
const NUEVO: OpcionNuevo[] = [
  { accion: 'ot', etiqueta: 'Recibir un coche', modulo: 'taller' },
  { accion: 'cita', etiqueta: 'Nueva cita', modulo: 'citas' },
  { accion: 'cliente', etiqueta: 'Nuevo cliente', modulo: 'clientes' },
  { accion: 'vehiculo', etiqueta: 'Nuevo vehículo', modulo: 'vehiculos' },
  { accion: 'factura', etiqueta: 'Nueva factura', modulo: 'facturas' },
  { accion: 'compra', etiqueta: 'Registrar compra', modulo: 'compras' },
];
export const opcionesNuevo = (modulos: ModuloId[]): OpcionNuevo[] => NUEVO.filter((o) => modulos.includes(o.modulo));

// ---------- Buscador global ----------

export type TipoResultado = 'orden' | 'vehiculo' | 'cliente';
export interface ResultadoBusqueda {
  tipo: TipoResultado;
  id: string;
  titulo: string;
  detalle: string;
  /** Matrícula para dibujarla en el resultado (vehículos y órdenes). */
  matricula?: string;
  /** Pestaña a la que lleva y texto con el que se abre su búsqueda. */
  modulo: ModuloId;
  busqueda: string;
}

/** Minúsculas, sin acentos, sin espacios ni guiones: «1234 abc» y «1234-ABC» son la misma matrícula. */
export const compacto = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\s\-_.]+/g, '');

/**
 * Busca en lo que ya está cargado en la aplicación. Cada resultado dice a qué pestaña lleva. Las órdenes salen primero (lo más urgente en un
 * taller), luego vehículos y clientes; empieza a buscar a partir de 2 caracteres.
 */
export function buscarGlobal(
  texto: string,
  datos: { clientes: Cliente[]; vehiculos: Vehiculo[]; ordenes: OrdenTrabajo[] },
  permitidos: { taller: boolean; vehiculos: boolean; clientes: boolean },
  limite = 8,
): ResultadoBusqueda[] {
  const q = compacto(texto);
  if (q.length < 2) return [];
  const veh = new Map(datos.vehiculos.map((v) => [v.id, v]));
  const cli = new Map(datos.clientes.map((c) => [c.id, c]));
  const out: ResultadoBusqueda[] = [];
  const nombre = (c?: Cliente) => (c ? `${c.nombre} ${c.apellidos}`.trim() : 'Cliente');

  if (permitidos.taller) {
    for (const o of datos.ordenes) {
      const v = veh.get(o.vehiculoId), c = cli.get(o.clienteId);
      if ([o.numero, v?.matricula, v?.marca, v?.modelo, c?.nombre, c?.apellidos].some((t) => t && compacto(t).includes(q))) {
        out.push({ tipo: 'orden', id: o.id, titulo: v ? `${v.marca} ${v.modelo}` : `Orden ${o.numero}`, detalle: `${o.numero} · ${nombre(c)}`, matricula: v?.matricula, modulo: 'taller', busqueda: o.numero });
      }
    }
  }
  if (permitidos.vehiculos) {
    for (const v of datos.vehiculos) {
      if ([v.matricula, v.marca, v.modelo, v.bastidor].some((t) => t && compacto(t).includes(q))) {
        const dueno = datos.clientes.find((c) => c.vehiculosAsociados?.includes(v.id));
        out.push({ tipo: 'vehiculo', id: v.id, titulo: `${v.marca} ${v.modelo}`, detalle: dueno ? nombre(dueno) : 'Vehículo', matricula: v.matricula, modulo: 'vehiculos', busqueda: v.matricula });
      }
    }
  }
  if (permitidos.clientes) {
    for (const c of datos.clientes) {
      if ([c.nombre, c.apellidos, `${c.nombre}${c.apellidos}`, c.nifNiePasaporte, c.telefono, c.correo].some((t) => t && compacto(t).includes(q))) {
        out.push({ tipo: 'cliente', id: c.id, titulo: nombre(c), detalle: [c.telefono, c.nifNiePasaporte].filter(Boolean).join(' · ') || 'Cliente', modulo: 'clientes', busqueda: c.nifNiePasaporte || c.nombre });
      }
    }
  }
  return out.slice(0, limite);
}
