import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Piezas del nuevo diseño. Pequeñas, accesibles de serie (foco visible, teclado, nombres para lectores de pantalla) y sin estilos sueltos:
// todo sale de ui.css. Las pantallas nuevas se montan solo con esto.

type VarianteBoton = 'normal' | 'principal' | 'fantasma';
interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> { variante?: VarianteBoton; grande?: boolean; soloIcono?: boolean }
export function Boton({ variante = 'normal', grande, soloIcono, className = '', type = 'button', ...resto }: PropsBoton) {
  const clases = ['u-btn', variante === 'principal' ? 'pri' : variante === 'fantasma' ? 'fantasma' : '', grande ? 'grande' : '', soloIcono ? 'icono' : '', className].filter(Boolean).join(' ');
  return <button type={type} className={clases} {...resto} />;
}

export function Tarjeta({ children, className = '', ...resto }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`u-card ${className}`} {...resto}>{children}</div>;
}

/** Etiqueta de estado. Los estados de una orden tienen su color fijo en todos los talleres (no dependen del color de marca). */
export type TonoChip = 'presupuesto' | 'recibido' | 'en_reparacion' | 'listo' | 'entregado' | 'cancelado' | 'peligro' | 'neutro';
export function Chip({ tono = 'neutro', children, ...resto }: { tono?: TonoChip; children: ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={`u-chip ${tono}`} {...resto}>{children}</span>;
}

/** La matrícula, dibujada como una de verdad: es la seña de identidad del nuevo diseño. */
export function Placa({ matricula }: { matricula: string }) {
  return <span className="u-placa" role="img" aria-label={`Matrícula ${matricula}`}><b aria-hidden="true">E</b><span aria-hidden="true">{matricula}</span></span>;
}

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana centrada (nunca un panel pegado a un lado). Se cierra con la X, con Esc o pulsando fuera; el foco entra al abrirse, se queda dentro
 * (Tab) y vuelve a donde estaba al cerrarse. En el móvil ocupa toda la pantalla.
 */
export function Ventana({ titulo, onCerrar, amplia, children, etiquetaCerrar = 'Cerrar' }: { titulo: string; onCerrar: () => void; amplia?: boolean; children: ReactNode; etiquetaCerrar?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const primero = caja.current?.querySelector<HTMLElement>(FOCALIZABLES);
    (primero ?? caja.current)?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cerrar.current(); return; }
      if (e.key !== 'Tab' || !caja.current) return;
      const lista = [...caja.current.querySelectorAll<HTMLElement>(FOCALIZABLES)];
      if (lista.length === 0) { e.preventDefault(); return; }
      const a = lista[0], z = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', alTeclear, true);
    return () => { document.removeEventListener('keydown', alTeclear, true); previo?.focus?.(); };
  }, []);
  return (
    <div className="u-ventana" onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={caja} className={`u-ventana-caja${amplia ? ' amplia' : ''}`} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <div className="u-ventana-cab">
          <h2>{titulo}</h2>
          <Boton soloIcono variante="fantasma" onClick={onCerrar} aria-label={etiquetaCerrar}><X /></Boton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmentos<T extends string>({ opciones, valor, onCambio, etiqueta }: { opciones: { id: T; texto: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string }) {
  return (
    <div className="u-seg" role="group" aria-label={etiqueta}>
      {opciones.map((o) => <button key={o.id} type="button" aria-pressed={o.id === valor} onClick={() => onCambio(o.id)}>{o.texto}</button>)}
    </div>
  );
}

/** Estado vacío: una invitación, no una disculpa. */
export function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return <div className="u-vacio"><h3>{titulo}</h3>{texto && <p style={{ margin: '0 0 14px' }}>{texto}</p>}{accion}</div>;
}
