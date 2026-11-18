import { Check } from 'lucide-react';
import type { OTEstado } from '../types';
import { NOMBRE_ESTADO, PASOS_ORDEN, siguientePaso } from './etapasOrden';

/** Cabecera guiada de una orden: en qué paso va, cuáles se han hecho y un único botón con lo que toca después. */
/** `aviso`: algo pendiente con el cliente que conviene tener a la vista (p. ej. «Falta enviar el presupuesto»); si trae `onClick`, lleva a donde se resuelve. */
export default function PasosOrden({ estado, onSiguiente, aviso }: { estado: OTEstado; onSiguiente: (a: OTEstado) => void; aviso?: { texto: string; onClick?: () => void; tono?: 'pendiente' | 'espera' | 'mal' } }) {
  const actual = PASOS_ORDEN.indexOf(estado);
  const sig = siguientePaso(estado);
  if (estado === 'cancelado') return <div className="u-pasos-cab" data-testid="pasos-orden"><span className="u-chip cancelado">Orden cancelada</span></div>;
  return (
    <div className={`u-pasos-cab${aviso ? ' con-aviso' : ''}`} data-testid="pasos-orden">
      <ol className="u-pasos" aria-label="Pasos de la orden">
        {PASOS_ORDEN.map((p, i) => (
          <li key={p} className={i < actual ? 'hecho' : i === actual ? 'actual' : ''} aria-current={i === actual ? 'step' : undefined}>
            <span className="u-paso-num" aria-hidden="true">{i < actual ? <Check size={13} /> : i + 1}</span>
            <span>{NOMBRE_ESTADO[p]}</span>
          </li>
        ))}
      </ol>
      {aviso && (aviso.onClick
        ? <button type="button" className={`u-aviso-paso ${aviso.tono ?? 'pendiente'}`} onClick={aviso.onClick} data-testid="aviso-paso">{aviso.texto}</button>
        : <span className={`u-aviso-paso ${aviso.tono ?? 'espera'}`} data-testid="aviso-paso">{aviso.texto}</span>)}
      {sig && <button type="button" className="u-btn pri" onClick={() => onSiguiente(sig.estado)} data-testid="orden-siguiente">{sig.accion} →</button>}
    </div>
  );
}
