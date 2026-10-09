import { useEffect, useState } from 'react';
import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { iniciarAltaTotp, listarFactoresTotp, quitarFactor, verificarCodigoMfa, type AltaTotp, type FactorTotp } from '../lib/auth';

interface Props { onClose: () => void }

/** Activar o desactivar la verificación en dos pasos (app autenticadora, TOTP) de la cuenta actual. */
export default function SeguridadModal({ onClose }: Props) {
  const [factores, setFactores] = useState<FactorTotp[] | null>(null);
  const [alta, setAlta] = useState<AltaTotp | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState<FactorTotp | null>(null);

  const cargar = () => listarFactoresTotp().then(setFactores).catch((e) => { setFactores([]); setError(e instanceof Error ? e.message : 'Error al consultar.'); });
  useEffect(() => { void cargar(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const empezar = async () => {
    setError(''); setOcupado(true);
    try { setAlta(await iniciarAltaTotp()); setCodigo(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo iniciar la activación.'); }
    finally { setOcupado(false); }
  };

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alta) return;
    setError(''); setOcupado(true);
    const err = await verificarCodigoMfa(alta.factorId, codigo);
    setOcupado(false);
    if (err) { setError(err); setCodigo(''); return; }
    setAlta(null);
    await cargar();
  };

  const quitar = async () => {
    if (!confirmarQuitar) return;
    const err = await quitarFactor(confirmarQuitar.id);
    setConfirmarQuitar(null);
    if (err) { setError(err); return; }
    setError('');
    await cargar();
  };

  const activo = (factores?.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Seguridad de la cuenta" className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-blue-600" /> Seguridad de la cuenta</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

        {factores === null ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : alta ? (
          <form onSubmit={confirmar} className="space-y-4">
            <ol className="text-sm text-slate-600 list-decimal pl-5 space-y-1">
              <li>Abre una aplicación autenticadora (Google Authenticator, Microsoft Authenticator, Authy, 1Password…).</li>
              <li>Escanea este código QR o escribe la clave a mano.</li>
              <li>Introduce el código de 6 dígitos que muestra la aplicación.</li>
            </ol>
            <img src={alta.qr} alt="Código QR para la aplicación autenticadora" className="w-44 h-44 mx-auto border border-slate-200 rounded-xl p-2" />
            <p className="text-[11px] text-slate-500 text-center break-all">¿No puedes escanear? Clave: <span className="font-mono font-semibold text-slate-700 select-all">{alta.secreto}</span></p>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7}
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/[^0-9 ]/g, ''))}
              aria-label="Código de verificación" placeholder="000000"
              className="w-full text-center tracking-[0.4em] text-xl font-mono py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAlta(null); setError(''); }} className="px-3.5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-2xl transition cursor-pointer">Cancelar</button>
              <button type="submit" disabled={ocupado || codigo.replace(/\s/g, '').length < 6}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                <Check className="w-4 h-4" /> {ocupado ? 'Verificando…' : 'Activar'}
              </button>
            </div>
          </form>
        ) : activo ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl p-4">
              <ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-green-800">Verificación en dos pasos activada</p>
                <p className="text-green-700 text-xs mt-0.5">Al iniciar sesión te pediremos el código de tu aplicación autenticadora, además de la contraseña.</p>
              </div>
            </div>
            <ul className="text-xs text-slate-500 space-y-1">
              {factores.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl px-3 py-2">
                  <span>{f.nombre} · desde {new Date(f.creado).toLocaleDateString('es-ES')}</span>
                  <button onClick={() => setConfirmarQuitar(f)} className="text-rose-600 hover:underline font-semibold cursor-pointer">Desactivar</button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold text-amber-800">Tu cuenta solo está protegida con contraseña</p>
                <p className="text-amber-700 text-xs mt-0.5">Con la verificación en dos pasos, aunque alguien consiga tu contraseña no podrá entrar sin el código de tu móvil. Recomendado, sobre todo si eres administrador.</p>
              </div>
            </div>
            <button onClick={() => void empezar()} disabled={ocupado}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
              <ShieldCheck className="w-4 h-4" /> {ocupado ? 'Preparando…' : 'Activar verificación en dos pasos'}
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!confirmarQuitar}
        title="Desactivar verificación en dos pasos"
        message="Tu cuenta volverá a protegerse solo con contraseña. ¿Seguro?"
        confirmLabel="Desactivar"
        variant="danger"
        onConfirm={() => void quitar()}
        onCancel={() => setConfirmarQuitar(null)}
      />
    </div>
  );
}
