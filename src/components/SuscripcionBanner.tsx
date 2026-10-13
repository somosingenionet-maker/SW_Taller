import { avisoSuscripcion, type Suscripcion } from '../lib/data/suscripcion';

interface Props {
  suscripcion: Suscripcion;
  esAdmin: boolean;
  onAbrir: () => void;
}

const ESTILO = {
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  aviso: 'bg-amber-50 border-amber-200 text-amber-800',
  error: 'bg-rose-50 border-rose-200 text-rose-800',
} as const;

/** Franja bajo la cabecera con el estado de la prueba/suscripción; no sale si no hay nada que decir. */
export default function SuscripcionBanner({ suscripcion, esAdmin, onAbrir }: Props) {
  const aviso = avisoSuscripcion(suscripcion);
  if (!aviso) return null;
  return (
    <div className="flex justify-center px-3.5 pt-3.5 shrink-0 print:hidden">
      <div role="status" className={`w-[82%] max-w-4xl flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold ${ESTILO[aviso.nivel]}`}>
        <span>{aviso.texto}</span>
        {esAdmin && aviso.accion && (
          <button onClick={onAbrir} className="px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-current/20 font-bold transition cursor-pointer">
            {aviso.accion === 'suscribirse' ? 'Suscribirme' : 'Gestionar'}
          </button>
        )}
      </div>
    </div>
  );
}
