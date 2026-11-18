import { avisoSuscripcion, type Suscripcion } from '../lib/data/suscripcion';

interface Props {
  suscripcion: Suscripcion;
  esAdmin: boolean;
  onAbrir: () => void;
}

/** Franja de aviso con el estado de la prueba/suscripción; no sale si no hay nada que decir. */
export default function SuscripcionBanner({ suscripcion, esAdmin, onAbrir }: Props) {
  const aviso = avisoSuscripcion(suscripcion);
  if (!aviso) return null;
  return (
    <div role="status" className={`u-aviso ${aviso.nivel === 'error' ? 'peligro' : aviso.nivel === 'aviso' ? 'aviso' : 'info'}`}>
      <span>{aviso.texto}</span>
      {esAdmin && aviso.accion && <button type="button" className="u-enlace" onClick={onAbrir}>{aviso.accion === 'suscribirse' ? 'Suscribirme' : 'Gestionar'}</button>}
    </div>
  );
}
