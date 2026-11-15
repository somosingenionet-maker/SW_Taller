import { ShieldAlert, WifiOff, RefreshCw } from 'lucide-react';
import type { TipoErrorPortal } from '../lib/data/invocarPortal';
import { CLASE_TARJETA, PieExterno } from './externo/ui';

/** Pantalla completa de error de los portales públicos. Cada caso dice lo que de verdad pasa y qué hacer. */
export default function ErrorPortalPantalla({ tipo, mensaje, onReintentar }: { tipo: TipoErrorPortal; mensaje: string; onReintentar: () => void }) {
  const enlace = tipo === 'enlace';
  const titulo = enlace ? 'Enlace no válido' : tipo === 'conexion' ? 'Sin conexión' : 'No se pudo cargar';
  const texto = enlace ? `${mensaje} Pide al taller que te envíe uno nuevo.` : mensaje;
  const tono = tipo === 'conexion' ? 'bg-slate-100 text-slate-500' : enlace ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500';
  return (
    <div className="min-h-screen font-sans flex items-center justify-center px-4 bg-gradient-to-b from-slate-100 to-slate-50">
      <div className="w-full max-w-sm">
        <div className={`${CLASE_TARJETA} p-8 text-center`} role="alert">
          <span className={`mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center ${tono}`}>
            {tipo === 'conexion' ? <WifiOff className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
          </span>
          <h1 className="text-lg font-black text-slate-800 mb-1.5">{titulo}</h1>
          <p className="text-sm text-slate-500">{texto}</p>
          {!enlace && (
            <button type="button" onClick={onReintentar} className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold shadow-sm transition cursor-pointer">
              <RefreshCw className="w-4 h-4" /> Reintentar
            </button>
          )}
        </div>
        <PieExterno />
      </div>
    </div>
  );
}
