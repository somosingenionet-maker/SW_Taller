import { BarChart2, Bell, CalendarClock, Car, FileText, Package, ShoppingCart, Sun, Users, Wrench } from 'lucide-react';
import type { IconoId } from './navegacion';

const ICONOS: Record<IconoId, typeof Sun> = {
  hoy: Sun, taller: Wrench, citas: CalendarClock, clientes: Users, vehiculos: Car, alertas: Bell,
  facturas: FileText, rentabilidad: BarChart2, compras: ShoppingCart, inventario: Package,
};

export function Icono({ id }: { id: IconoId }) {
  const C = ICONOS[id];
  return <C aria-hidden="true" strokeWidth={1.8} />;
}
