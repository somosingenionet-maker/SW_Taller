import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { KeyRound, X } from 'lucide-react';

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

/**
 * Una fila de lista en forma de tarjeta, para el móvil (donde una tabla ancha obliga a deslizar de lado). Arriba, el título y el importe; debajo,
 * las líneas de detalle; al pie, lo que quieras (estado…) y a la derecha los botones de acción. El importe no se parte nunca: el € va pegado.
 * Si se pasa `onClick`, toda la tarjeta se puede pulsar (las acciones no disparan ese clic).
 */
export function TarjetaLista({ titulo, importe, lineas, pie, acciones, onClick, atenuada, seleccionada, className = '', ...resto }: {
  titulo: ReactNode; importe?: ReactNode; lineas?: ReactNode[]; pie?: ReactNode; acciones?: ReactNode; onClick?: () => void; atenuada?: boolean; seleccionada?: boolean;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'title'>) {
  const clases = ['u-tl', onClick ? 'u-tl-pulsable' : '', atenuada ? 'u-tl-atenuada' : '', seleccionada ? 'u-tl-sel' : '', className].filter(Boolean).join(' ');
  return (
    <div className={clases} {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } } : {})} {...resto}>
      <div className="u-tl-cab"><div className="u-tl-tit">{titulo}</div>{importe != null && <div className="u-tl-imp">{importe}</div>}</div>
      {lineas?.filter(Boolean).map((l, i) => <div key={i} className="u-tl-lin">{l}</div>)}
      {(pie || acciones) && (
        <div className="u-tl-pie">
          <div className="u-tl-pie-izq">{pie}</div>
          {acciones && <div className="u-tl-acc" onClick={(e) => e.stopPropagation()}>{acciones}</div>}
        </div>
      )}
    </div>
  );
}

/** El llavero: la seña de identidad de Doonty. Cada coche del taller es un llavero cuyo color es el de su estado (el tablero es el panel de llaves). */
export function Llavero({ estado }: { estado?: string }) {
  return <span className={`u-llave u-e-${estado ?? 'neutro'}`} aria-hidden="true"><KeyRound /></span>;
}

/** La matrícula como texto, bien legible (monoespaciada y espaciada) y sin marco. */
export function Matricula({ matricula }: { matricula: string }) {
  return <span className="u-matri" data-testid="matricula">{matricula}</span>;
}

const FOCALIZABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana centrada (nunca un panel pegado a un lado). Se cierra con la X, con Esc o pulsando fuera; el foco entra al abrirse, se queda dentro
 * (Tab) y vuelve a donde estaba al cerrarse. En el móvil ocupa toda la pantalla.
 */
export function Ventana({ titulo, onCerrar, amplia, children, etiquetaCerrar = 'Cerrar', sinCabecera, capa }: { titulo: string; onCerrar: () => void; amplia?: boolean; children: ReactNode; etiquetaCerrar?: string; /** El contenido ya trae su propia cabecera y su botón de cerrar. */ sinCabecera?: boolean; /** z-index propio: las fichas de detalle van por debajo de los formularios que se abren encima. */ capa?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const primero = caja.current?.querySelector<HTMLElement>(FOCALIZABLES);
    (primero ?? caja.current)?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Si el foco está en otra ventana abierta encima (un formulario), Esc es para ella, no para esta.
        const foco = document.activeElement;
        if (foco && foco !== document.body && caja.current && !caja.current.contains(foco)) return;
        e.stopPropagation(); cerrar.current(); return;
      }
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
    <div className="u-ventana" style={capa ? { zIndex: capa } : undefined} onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div ref={caja} className={`u-ventana-caja${amplia ? ' amplia' : ''}`} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        {!sinCabecera && (
          <div className="u-ventana-cab">
            <h2>{titulo}</h2>
            <Boton soloIcono variante="fantasma" onClick={onCerrar} aria-label={etiquetaCerrar}><X /></Boton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
