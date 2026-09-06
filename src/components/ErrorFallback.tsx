import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorFallbackProps {
  /** Vuelve a intentar renderizar sin recargar la página — útil si el fallo fue puntual. */
  onReset: () => void;
}

/**
 * Pantalla de último recurso cuando un error inesperado escapa de toda la
 * app (Sentry.ErrorBoundary en main.tsx). El error ya se reportó solo — aquí
 * solo se le da al usuario una salida clara en vez de una pantalla en blanco.
 */
export default function ErrorFallback({ onReset }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Algo salió mal</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Se produjo un error inesperado y ya quedó registrado automáticamente. Intenta recargar la página.
          </p>
        </div>
        <div className="space-y-2 pt-1">
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Recargar página
          </button>
          <button
            onClick={onReset}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50 transition cursor-pointer"
          >
            Intentar sin recargar
          </button>
        </div>
      </div>
    </div>
  );
}
