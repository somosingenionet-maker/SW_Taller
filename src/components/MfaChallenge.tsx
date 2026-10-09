import { useEffect, useState } from 'react';
import { ShieldCheck, Check, LogOut } from 'lucide-react';
import { listarFactoresTotp, signOut, verificarCodigoMfa } from '../lib/auth';

/**
 * Pantalla que se muestra tras la contraseña cuando el usuario tiene la verificación en dos pasos
 * activada. Al acertar el código, Supabase emite el evento de sesión y App continúa sola.
 */
export default function MfaChallenge() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    listarFactoresTotp()
      .then((f) => (f.length ? setFactorId(f[0].id) : setError('No se encontró ningún método de verificación. Cierra sesión y vuelve a entrar.')))
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo consultar la verificación.'));
  }, []);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || codigo.length < 6) return;
    setError('');
    setVerificando(true);
    const err = await verificarCodigoMfa(factorId, codigo);
    setVerificando(false);
    if (err) { setError(err); setCodigo(''); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm bg-white/90 backdrop-blur-xl border border-white rounded-3xl shadow-2xl shadow-slate-400/20 p-8">
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4.5 h-4.5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Verificación en dos pasos</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">Abre tu aplicación autenticadora e introduce el código de 6 dígitos de Doonty.</p>

        <form onSubmit={enviar} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[^0-9 ]/g, ''))}
            aria-label="Código de verificación"
            placeholder="000000"
            className="w-full text-center tracking-[0.4em] text-2xl font-mono py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
          />

          {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

          <button
            type="submit"
            disabled={verificando || !factorId || codigo.replace(/\s/g, '').length < 6}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-600/20"
          >
            {verificando ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Check className="w-4 h-4" />}
            {verificando ? 'Verificando…' : 'Verificar y entrar'}
          </button>
        </form>

        <button onClick={() => void signOut()} className="mt-5 mx-auto flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition cursor-pointer">
          <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
        </button>
        <p className="text-[11px] text-slate-400 text-center mt-4">
          ¿Perdiste el acceso a tu aplicación? Escribe a comercial@somosingenio.net para que te la restablezcamos.
        </p>
      </div>
    </div>
  );
}
