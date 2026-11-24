import { fmt2 } from './moneda';
import { textoHoras } from './duracionTarea';

type Tipo = 'mano_de_obra' | 'producto';

/**
 * Lo escrito en el campo de cantidad → número. Mano de obra: horas con hasta 2 decimales (0,25 · 1,5 · 2,75);
 * productos: unidades enteras, mínimo 1. Vacío se queda vacío para poder borrar y reescribir.
 */
export function cantidadDesdeEntrada(tipo: Tipo, valor: string): number | '' {
  if (valor.trim() === '') return '';
  const n = Number(valor.replace(',', '.'));
  if (!Number.isFinite(n)) return '';
  return tipo === 'mano_de_obra' ? Math.max(0, Math.round(n * 100) / 100) : Math.max(1, Math.round(n));
}

/** ¿Se puede añadir la línea con esta cantidad? (más de 0 horas o al menos 1 unidad). */
export const cantidadValida = (c: number | ''): c is number => c !== '' && c > 0;

/** «1,5 h» en mano de obra; «2» en productos. */
export const textoCantidad = (tipo: Tipo, cantidad: number) =>
  tipo === 'mano_de_obra' ? textoHoras(cantidad) : cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 });

/** «42,50 €/h» en mano de obra; «42,50 €» en productos. */
export const textoPrecioLinea = (tipo: Tipo, precio: number) => `${fmt2(precio)} €${tipo === 'mano_de_obra' ? '/h' : ''}`;

/** Cantidad de una línea sin tipo (facturas): con coma decimal, «1,5». */
export const textoCantidadSimple = (cantidad: number) => cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 });
