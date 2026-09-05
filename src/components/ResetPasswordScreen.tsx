import { useState } from 'react';
import { Lock, Eye, EyeOff, Check, ShieldCheck } from 'lucide-react';
import { updatePassword } from '../lib/auth';
import { validarPassword, REQUISITOS_PASSWORD } from '../utils/password';

interface ResetPasswordScreenProps {
  /** Se llama al establecer la contraseña con éxito — App ya tiene la sesión activa y puede pasar al panel. */
  onDone: () => void;
}

export default function ResetPasswordScreen({ onDone }: ResetPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const errPw = validarPassword(password);
    if (errPw) { setError(errPw); return; }
    if (password !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }

    setSaving(true);
    const err = await updatePassword(password);
    setSaving(false);
    if (err) { setError(err); return; }
    onDone();
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
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Nueva contraseña</h2>
        </div>
        <p className="text-sm text-slate-500 mb-7">Establece una contraseña nueva para tu cuenta.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nueva contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">{REQUISITOS_PASSWORD}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Confirmar contraseña</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-600/20"
          >
            {saving ? (
              <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {saving ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
