import { ShieldAlert, WifiOff, RefreshCw } from 'lucide-react';
import type { TipoErrorPortal } from '../lib/data/invocarPortal';

/** Pantalla completa de error de los portales públicos. Cada caso dice lo que de verdad pasa y qué hacer. */
export default function ErrorPortalPantalla({ tipo, mensaje, onReintentar }: { tipo: TipoErrorPortal; mensaje: string; onReintentar: () => void }) {
  const enlace = tipo === 'enlace';
  const titulo = enlace ? 'Enlace no válido' : tipo === 'conexion' ? 'Sin conexión' : 'No se pudo cargar';
  const texto = enlace ? `${mensaje} Pide al taller que te envíe uno nuevo.` : mensaje;
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-sm text-center" role="alert">
        {tipo === 'conexion' ? <WifiOff className="w-10 h-10 text-slate-400 mx-auto mb-3" /> : <ShieldAlert className={`w-10 h-10 mx-auto mb-3 ${enlace ? 'text-rose-400' : 'text-amber-400'}`} />}
        <h1 className="text-base font-extrabold text-slate-800 mb-1.5">{titulo}</h1>
        <p className="text-sm text-slate-500">{texto}</p>
        {!enlace && (
          <button type="button" onClick={onReintentar} className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold cursor-pointer">
            <RefreshCw className="w-4 h-4" /> Reintentar
          </button>
        )}
      </div>
    </div>
  );
}
