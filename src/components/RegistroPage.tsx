import { useState } from 'react';
import { CheckCircle2, Mail, Rocket } from 'lucide-react';
import { registrarTaller } from '../lib/data/suscripcion';

/** Alta pública de un taller: prueba gratuita de 14 días sin tarjeta. */
export default function RegistroPage() {
  const [nombreTaller, setNombreTaller] = useState('');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [nif, setNif] = useState('');
  const [web, setWeb] = useState(''); // señuelo anti-bots
  const [acepta, setAcepta] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setEnviando(true);
    try {
      setHecho(await registrarTaller({ nombreTaller, nombre, email, nif, aceptaTerminos: acepta, web }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar el alta.');
    } finally {
      setEnviando(false);
    }
  };

  const campo = 'w-full px-3 py-2.5 border border-slate-600 bg-slate-800/60 text-white rounded-xl text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-3xl shadow-2xl p-8">
        {hecho ? (
          <div className="text-center space-y-4" role="status">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">¡Casi listo!</h1>
            <p className="text-sm text-slate-300 flex items-start gap-2 text-left"><Mail className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" /> {hecho}</p>
            <p className="text-xs text-slate-400">¿No llega? Espera un par de minutos. Si ya te habías registrado antes con este correo, entra en <a href="/" className="text-blue-400 underline">el acceso</a> y pulsa «¿Olvidaste tu contraseña?».</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0"><Rocket className="w-4.5 h-4.5 text-white" /></div>
              <h1 className="text-xl font-bold text-white tracking-tight">Prueba Doonty Motor gratis</h1>
            </div>
            <p className="text-sm text-slate-400 mb-6">14 días con todo incluido. Sin tarjeta. Sin compromiso.</p>

            <form onSubmit={enviar} className="space-y-3.5">
              <div>
                <label htmlFor="taller" className="block text-xs font-semibold text-slate-300 mb-1.5">Nombre del taller</label>
                <input id="taller" className={campo} value={nombreTaller} onChange={(e) => setNombreTaller(e.target.value)} required maxLength={80} autoComplete="organization" placeholder="Talleres Ejemplo S.L." />
              </div>
              <div>
                <label htmlFor="nombre" className="block text-xs font-semibold text-slate-300 mb-1.5">Tu nombre</label>
                <input id="nombre" className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} autoComplete="name" placeholder="Nombre y apellidos" />
              </div>
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-1.5">Correo electrónico</label>
                <input id="email" type="email" className={campo} value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="tu@taller.es" />
                <p className="text-[11px] text-slate-500 mt-1">Te enviaremos un enlace para activar la cuenta y elegir tu contraseña.</p>
              </div>
              <div>
                <label htmlFor="nif" className="block text-xs font-semibold text-slate-300 mb-1.5">NIF / CIF <span className="text-slate-500 font-normal">(opcional, lo puedes completar luego)</span></label>
                <input id="nif" className={campo} value={nif} onChange={(e) => setNif(e.target.value)} maxLength={14} placeholder="B12345678" />
              </div>

              {/* Señuelo: oculto para personas; los bots suelen rellenarlo. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label>No rellenar <input tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} name="web" /></label>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer">
                <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 accent-blue-600" required />
                <span>
                  Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Términos de Uso</a>, la{' '}
                  <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Política de Privacidad</a> y el{' '}
                  <a href="/encargo-de-tratamiento" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">contrato de encargo de tratamiento</a>.
                </span>
              </label>

              {error && <div role="alert" className="bg-rose-950/60 border border-rose-800 text-rose-200 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

              <button type="submit" disabled={enviando || !acepta}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-600/20">
                {enviando ? 'Creando tu cuenta…' : 'Empezar mi prueba gratuita'}
              </button>
              <p className="text-center text-xs text-slate-500">¿Ya tienes cuenta? <a href="/" className="text-blue-400 underline">Entrar</a></p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
