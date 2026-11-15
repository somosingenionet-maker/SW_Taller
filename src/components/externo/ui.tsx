import type { CSSProperties, ReactNode } from 'react';

/** Piezas comunes de los enlaces externos (portal del cliente, del mecánico, reserva y mi cita) para que se vean como una sola familia. */

/** Mezcla el color del taller con negro o blanco: tonos del mismo color sin pedirle al taller más de uno. */
export const oscurecer = (color: string, pct: number) => `color-mix(in srgb, ${color} ${100 - pct}%, black)`;
export const aclarar = (color: string, pct: number) => `color-mix(in srgb, ${color} ${100 - pct}%, white)`;

/** Tarjeta blanca flotante: la misma en todas las pantallas. */
export const CLASE_TARJETA = 'bg-white rounded-3xl border border-slate-100 shadow-[0_10px_32px_-12px_rgba(15,23,42,0.18)]';

/** Fondo de la página: un velo del color del taller que se funde con el gris claro. */
export function PaginaExterna({ color, children, className = '', style }: { color: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`min-h-screen font-sans text-slate-800 pb-10 ${className}`}
      style={{ background: `linear-gradient(180deg, ${aclarar(color, 92)} 0, #f8fafc 420px)`, ...style }}>
      {children}
    </div>
  );
}

/** Cabecera centrada con el color del taller: logo, nombre, saludo y, si hace falta, botones arriba a la derecha. */
export function HeroExterno({ color, logoUrl, empresa, titulo, subtitulo, acciones, testId, iniciales, icono }: {
  color: string; logoUrl?: string | null; empresa?: string; titulo: string; subtitulo?: ReactNode; acciones?: ReactNode; testId?: string;
  /** Si no hay logo: la inicial del taller (o un icono). */
  iniciales?: string; icono?: ReactNode;
}) {
  const fondo: CSSProperties = { background: `linear-gradient(145deg, ${aclarar(color, 8)} 0%, ${color} 45%, ${oscurecer(color, 38)} 100%)` };
  return (
    <header className="relative overflow-hidden rounded-b-[40px] px-5 pt-5 pb-14 text-white" style={fondo}>
      {/* Adornos: dos círculos suaves que dan profundidad sin recargar. */}
      <span aria-hidden="true" className="pointer-events-none absolute -top-16 -right-12 w-56 h-56 rounded-full bg-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute top-24 -left-20 w-48 h-48 rounded-full bg-white/[0.07]" />
      <div className="relative max-w-md mx-auto">
        <div className="flex justify-end gap-2 min-h-[2.5rem]">{acciones}</div>
        <div className="flex flex-col items-center text-center -mt-1" data-testid={testId}>
          <div className="w-[72px] h-[72px] rounded-[22px] bg-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.35)] ring-4 ring-white/25 flex items-center justify-center overflow-hidden">
            {logoUrl ? <img src={logoUrl} alt={empresa ?? ''} className="w-full h-full object-contain p-1.5" />
              : icono ?? <span className="text-2xl font-black" style={{ color }}>{(iniciales ?? empresa?.[0] ?? 'D').toUpperCase()}</span>}
          </div>
          {empresa && <p className="mt-3 text-white/85 font-bold text-[11px] uppercase tracking-[0.14em] max-w-full truncate">{empresa}</p>}
          <h1 className="mt-2 text-[26px] leading-tight font-black tracking-tight">{titulo}</h1>
          {subtitulo && <p className="mt-1.5 text-sm text-white/85 max-w-xs">{subtitulo}</p>}
        </div>
      </div>
    </header>
  );
}

/** Columna de contenido que sube sobre la cabecera. */
export function ColumnaExterna({ children, ancho = 'md', solapa = true, className = '' }: { children: ReactNode; ancho?: 'md' | 'xl'; solapa?: boolean; className?: string }) {
  // `solapa`: sube sobre la cabecera (si lo primero es una tarjeta). Sin él, la columna empieza justo debajo (si lo primero es un título suelto).
  return <div className={`${ancho === 'xl' ? 'max-w-xl' : 'max-w-md'} mx-auto px-4 ${solapa ? '-mt-9' : 'mt-5'} relative space-y-4 ${className}`}>{children}</div>;
}

/** Encabezado de tarjeta: icono en baldosa de color + título + subtítulo. */
export function CabeceraTarjeta({ icono, titulo, subtitulo, color, tono = 'marca', derecha }: {
  icono: ReactNode; titulo: string; subtitulo?: ReactNode; color?: string; tono?: 'marca' | 'verde' | 'ambar' | 'rojo' | 'gris'; derecha?: ReactNode;
}) {
  const estilos: Record<string, string> = { verde: 'bg-emerald-50 text-emerald-600', ambar: 'bg-amber-50 text-amber-600', rojo: 'bg-rose-50 text-rose-600', gris: 'bg-slate-100 text-slate-500' };
  const marca = tono === 'marca' && color ? { backgroundColor: aclarar(color, 88), color } : undefined;
  return (
    <div className="flex items-center gap-3">
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${tono === 'marca' ? '' : estilos[tono]}`} style={marca}>{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold text-slate-800 leading-tight">{titulo}</p>
        {subtitulo && <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>}
      </div>
      {derecha}
    </div>
  );
}

/** Pie de las páginas externas. */
export function PieExterno({ children }: { children?: ReactNode }) {
  return (
    <footer className="text-center text-[11px] text-slate-400 pt-4 space-y-1">
      {children && <p>{children}</p>}
      <p className="font-semibold tracking-wide">Doonty Motor</p>
    </footer>
  );
}

/** Botones redondos translúcidos de la cabecera. */
export const CLASE_BOTON_CABECERA = 'p-2.5 rounded-full text-white bg-white/20 hover:bg-white/30 backdrop-blur-sm transition cursor-pointer disabled:opacity-60';

/** Pantalla de carga de los enlaces externos. */
export function CargandoExterno() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50 flex items-center justify-center" role="status" aria-label="Cargando">
      <div className="animate-spin w-9 h-9 border-[3px] border-slate-200 border-t-slate-500 rounded-full" />
    </div>
  );
}
