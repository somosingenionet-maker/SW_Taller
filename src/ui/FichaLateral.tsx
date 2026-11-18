import type { ReactNode } from 'react';
import { Ventana } from './componentes';

/** Ficha de detalle de las pantallas con lista: se abre en una ventana centrada y amplia (por debajo de los formularios que se abren desde ella). Sin ficha elegida no ocupa sitio. */
export default function FichaLateral({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  if (!children) return null;
  return <Ventana titulo={titulo} onCerrar={onCerrar} amplia sinCabecera capa={40}>{children}</Ventana>;
}
