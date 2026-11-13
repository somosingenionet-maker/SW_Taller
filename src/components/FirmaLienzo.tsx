import { useCallback, useEffect, useRef } from 'react';
import type { Punto } from '../utils/firma';

/** Proporción ancho / alto del recuadro de firma. */
const RELACION = 3;
/** Grosor del trazo como fracción del ancho: la firma se ve igual al dibujarla que al guardarla. */
const GROSOR = 0.008;

/** Los puntos van normalizados (ver utils/firma): el dibujo no depende del tamaño de pantalla. */
function pintar(ctx: CanvasRenderingContext2D, trazos: Punto[][], ancho: number) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.fillStyle = '#0f172a';
  ctx.lineWidth = GROSOR * ancho;
  for (const t of trazos) {
    if (t.length === 0) continue;
    if (t.length === 1) {
      ctx.beginPath();
      ctx.arc(t[0].x * ancho, t[0].y * ancho, (GROSOR * ancho) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(t[0].x * ancho, t[0].y * ancho);
    for (let i = 1; i < t.length - 1; i++) {
      ctx.quadraticCurveTo(t[i].x * ancho, t[i].y * ancho, ((t[i].x + t[i + 1].x) / 2) * ancho, ((t[i].y + t[i + 1].y) / 2) * ancho);
    }
    const u = t[t.length - 1];
    ctx.lineTo(u.x * ancho, u.y * ancho);
    ctx.stroke();
  }
}

/** PNG transparente de la firma con tamaño fijo (pesa pocos KB y se ve igual en cualquier aparato). */
export function exportarPng(trazos: Punto[][]): string {
  const ancho = 1000;
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = Math.round(ancho / RELACION);
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar la firma.');
  pintar(ctx, trazos, ancho);
  return lienzo.toDataURL('image/png');
}

interface Props {
  trazos: Punto[][];
  onTrazos: (t: Punto[][]) => void;
  etiqueta: string;
}

/** Recuadro donde se firma con el dedo, el lápiz o el ratón. */
export default function FirmaLienzo({ trazos, onTrazos, etiqueta }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const trazosRef = useRef(trazos);
  const dibujando = useRef(false);
  trazosRef.current = trazos;

  const redibujar = useCallback(() => {
    const c = canvas.current, b = caja.current;
    if (!c || !b) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ancho = Math.max(1, Math.round(b.clientWidth * dpr));
    const alto = Math.max(1, Math.round(b.clientHeight * dpr));
    if (c.width !== ancho || c.height !== alto) { c.width = ancho; c.height = alto; }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    pintar(ctx, trazosRef.current, c.width);
  }, []);

  useEffect(() => { redibujar(); }, [trazos, redibujar]);
  useEffect(() => {
    const b = caja.current;
    if (!b || typeof ResizeObserver === 'undefined') return;
    const o = new ResizeObserver(redibujar);
    o.observe(b);
    return () => o.disconnect();
  }, [redibujar]);

  const punto = (e: React.PointerEvent): Punto => {
    const r = (caja.current as HTMLDivElement).getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1 / RELACION, Math.max(0, (e.clientY - r.top) / r.width)) };
  };

  return (
    <div ref={caja} className="relative w-full border-2 border-dashed border-slate-300 rounded-xl bg-white select-none" style={{ aspectRatio: String(RELACION), touchAction: 'none' }}>
      <canvas
        ref={canvas} data-testid="lienzo-firma" aria-label={etiqueta}
        className="absolute inset-0 w-full h-full cursor-crosshair" style={{ touchAction: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
          dibujando.current = true;
          onTrazos([...trazosRef.current, [punto(e)]]);
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          e.preventDefault();
          const t = trazosRef.current;
          if (t.length === 0) return;
          onTrazos([...t.slice(0, -1), [...t[t.length - 1], punto(e)]]);
        }}
        onPointerUp={() => { dibujando.current = false; }}
        onPointerCancel={() => { dibujando.current = false; }}
      />
      {trazos.length === 0 && (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-300 pointer-events-none">{etiqueta}</span>
      )}
    </div>
  );
}
