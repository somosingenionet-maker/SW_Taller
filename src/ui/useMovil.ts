import { useEffect, useState } from 'react';

/** Mismo punto de corte que el marco (menú de abajo en vez de la barra lateral): a partir de aquí las tablas anchas pasan a tarjetas. */
export const ANCHO_MOVIL = 860;
const CONSULTA = `(max-width: ${ANCHO_MOVIL}px)`;

/** ¿Pantalla de móvil? Se actualiza al girar el aparato o cambiar el tamaño de la ventana. */
export function useMovil(): boolean {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches);
  useEffect(() => {
    const m = window.matchMedia(CONSULTA);
    const alCambiar = () => setMovil(m.matches);
    alCambiar();
    m.addEventListener('change', alCambiar);
    return () => m.removeEventListener('change', alCambiar);
  }, []);
  return movil;
}
