import React, { useState, useEffect } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { signIn, sendPasswordReset } from '../lib/auth';
import { getPlataformaLogo } from '../lib/data/plataforma';

interface LoginScreenProps {
  /** Error de sesión propagado desde App (p. ej. cuenta desactivada). */
  authError?: string | null;
}

export default function LoginScreen({ authError }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'recover'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);

  useEffect(() => {
    getPlataformaLogo().then(setLogo).catch(() => setLogo(null));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Autenticación real contra Supabase. Si tiene éxito, App reacciona al
    // cambio de sesión y muestra la aplicación (con la marca de la empresa
    // del usuario, ya autenticado).
    const err = await signIn(email, password);
    setLoading(false);
    if (err) setError(err);
  };

  const handleRecoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverError('');
    setRecoverLoading(true);
    const err = await sendPasswordReset(recoverEmail);
    setRecoverLoading(false);
    if (err) { setRecoverError(err); return; }
    setRecoverSent(true);
  };

  const switchToRecover = () => {
    setError('');
    setRecoverError('');
    setRecoverSent(false);
    setRecoverEmail(email);
    setMode('recover');
  };

  const switchToLogin = () => {
    setRecoverError('');
    setMode('login');
  };

  const mensajeError = error || authError;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-slate-950">
      {/* Marca — el logo real de la plataforma ya incluye el nombre "Doonty";
          el bloque con icono + texto solo es un placeholder mientras no se
          suba ninguno (Panel de administración > Super Admin). */}
      <div className="flex flex-col items-center gap-3 mb-8">
        {logo ? (
          <img src={logo} alt="Doonty Motor" className="h-14 w-auto max-w-[220px] object-contain" />
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <span className="text-white font-black text-2xl tracking-tighter">D</span>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Doonty Motor</span>
          </>
        )}
      </div>

      <div className="w-full max-w-sm">
        {mode === 'login' ? (
          <>
            <div className="mb-7">
              <h2 className="text-xl font-bold text-white tracking-tight">Iniciar sesión</h2>
              <p className="text-sm text-slate-400 mt-1">Accede a tu espacio de trabajo</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    placeholder="usuario@empresa.net"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    onClick={switchToRecover}
                    className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {mensajeError && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium px-4 py-2.5 rounded-lg">
                  {mensajeError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-600/20"
              >
                {loading ? (
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loading ? 'Verificando...' : 'Iniciar sesión'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="mb-7">
              <h2 className="text-xl font-bold text-white tracking-tight">Recuperar contraseña</h2>
              <p className="text-sm text-slate-400 mt-1">
                {recoverSent
                  ? 'Revisa tu correo para continuar.'
                  : 'Te enviamos un enlace para restablecerla.'}
              </p>
            </div>

            {recoverSent ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-200 leading-relaxed">
                    Si existe una cuenta con ese correo, te hemos enviado un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-slate-200 border border-white/10 hover:bg-white/5 transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleRecoverSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={recoverEmail}
                      onChange={(e) => setRecoverEmail(e.target.value)}
                      autoComplete="email"
                      required
                      placeholder="usuario@empresa.net"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                {recoverError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium px-4 py-2.5 rounded-lg">
                    {recoverError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={recoverLoading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition disabled:opacity-60 cursor-pointer shadow-lg shadow-blue-600/20"
                >
                  {recoverLoading ? (
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {recoverLoading ? 'Enviando...' : 'Enviar enlace'}
                </button>

                <button
                  type="button"
                  onClick={switchToLogin}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
                </button>
              </form>
            )}
          </>
        )}

        <p className="text-slate-600 text-xs mt-8 text-center">
          © 2026 Doonty — Desarrollado por{' '}
          <a
            href="https://www.somosingenio.net"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-400 underline underline-offset-2 transition"
          >
            InGenio
          </a>
          {' · '}
          <a href="/privacidad" className="hover:text-slate-400 underline underline-offset-2 transition">Privacidad</a>
          {' · '}
          <a href="/terminos" className="hover:text-slate-400 underline underline-offset-2 transition">Términos</a>
        </p>
      </div>
    </div>
  );
}
