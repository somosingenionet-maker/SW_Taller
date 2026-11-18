import type { ReactNode } from 'react';
import { esDisenoNuevo } from './disenoNuevo';
import { Ventana } from './componentes';

/**
 * Columna de detalle de las pantallas con lista + ficha. En el diseño actual sigue siendo la columna de la derecha; en el nuevo la ficha se abre
 * en una ventana centrada y amplia (por debajo de los formularios que se abren desde ella) y, sin ficha elegida, no ocupa sitio.
 */
export default function FichaLateral({ clase, titulo, onCerrar, children }: { clase: string; titulo: string; onCerrar: () => void; children: ReactNode }) {
  if (!esDisenoNuevo()) return <div className={clase}>{children}</div>;
  if (!children) return null;
  return <Ventana titulo={titulo} onCerrar={onCerrar} amplia sinCabecera capa={40}>{children}</Ventana>;
}
