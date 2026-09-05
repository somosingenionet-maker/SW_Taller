import React, { useState, useEffect } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock, Car, Wrench, Users, FileText, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { signIn, sendPasswordReset } from '../lib/auth';
import { getPlataformaLogo } from '../lib/data/plataforma';

interface LoginScreenProps {
  /** Error de sesión propagado desde App (p. ej. cuenta desactivada). */
  authError?: string | null;
}

const FEATURES = [
  { icon: Car, label: 'Vehículos' },
  { icon: Wrench, label: 'Taller y órdenes de trabajo' },
  { icon: Users, label: 'CRM de clientes' },
  { icon: FileText, label: 'Facturación' },
];

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
    <div className="min-h-screen flex bg-slate-950">
      {/* Panel de marca — oculto en móvil */}
      <div className="hidden md:flex md:w-3/5 lg:w-[62%] relative overflow-hidden flex-col justify-between p-12">
        {/* Fondo con gradiente animado */}
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-blue-600/30 blur-3xl animate-pulse" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 rounded-full bg-blue-400/10 blur-3xl animate-pulse" style={{ animationDelay: '3s' }} />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, white 6px, white 7px)',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 overflow-hidden">
              {logo ? (
                <img src={logo} alt="Tibox" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-black text-xl tracking-tighter">T</span>
              )}
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Tibox Motor</span>
          </div>
        </div>

        <div className="relative z-10 space-y-10 max-w-xl">
          <div className="space-y-4">
            <h1 className="text-6xl font-display font-bold text-white tracking-tight leading-[1.1]">
              El sistema operativo<br />de tu taller.
            </h1>
            <p className="text-slate-400 text-lg max-w-lg">
              Una plataforma para que cada taller gestione los vehículos de sus
              clientes, las órdenes de trabajo y la facturación — de forma simple
              y centralizada.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-white/5 border border-white/10">
                <Icon className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-sm font-medium text-slate-300">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-slate-600 text-xs">
          © 2026 Tibox — Desarrollado por{' '}
          <a
            href="https://www.somosingenio.net"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-400 underline underline-offset-2 transition"
          >
            InGenio
          </a>
        </p>
      </div>

      {/* Formulario */}
      <div className="flex-1 relative flex flex-col items-center justify-center px-4 py-12 bg-slate-950 md:bg-gradient-to-br md:from-slate-100 md:via-blue-50 md:to-indigo-100 overflow-hidden">
        {/* Fondo con más presencia en el lado claro — para que la tarjeta contraste de verdad */}
        <div className="hidden md:block absolute top-0 right-0 w-[28rem] h-[28rem] rounded-full bg-blue-300/40 blur-3xl" />
        <div className="hidden md:block absolute bottom-0 left-0 w-96 h-96 rounded-full bg-indigo-300/30 blur-3xl" />

        {/* Marca compacta — solo visible en móvil */}
        <div className="md:hidden relative z-10 flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30 overflow-hidden">
            {logo ? (
              <img src={logo} alt="Tibox" className="w-full h-full object-contain" />
            ) : (
              <span className="text-white font-black text-2xl tracking-tighter">T</span>
            )}
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Tibox Motor</span>
        </div>

        <div className="relative z-10 w-full max-w-sm md:bg-white/90 md:backdrop-blur-xl md:border md:border-white md:rounded-3xl md:shadow-2xl md:shadow-slate-400/20 md:p-8">
          {mode === 'login' ? (
            <>
              <div className="mb-7">
                <h2 className="text-xl font-bold text-white md:text-slate-800 tracking-tight">Iniciar sesión</h2>
                <p className="text-sm text-slate-400 md:text-slate-500 mt-1">Accede a tu espacio de trabajo</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 md:text-slate-600 mb-1.5">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 md:text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      placeholder="usuario@empresa.net"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white/5 md:bg-white border border-white/10 md:border-slate-200 text-white md:text-slate-900 placeholder:text-slate-500 md:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 md:text-slate-600">
                      Contraseña
                    </label>
                    <button
                      type="button"
                      onClick={switchToRecover}
                      className="text-xs font-semibold text-blue-400 md:text-blue-600 hover:text-blue-300 md:hover:text-blue-700 transition cursor-pointer"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 md:text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm bg-white/5 md:bg-white border border-white/10 md:border-slate-200 text-white md:text-slate-900 placeholder:text-slate-500 md:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 md:text-slate-400 hover:text-slate-300 md:hover:text-slate-600 transition cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {mensajeError && (
                  <div className="bg-rose-500/10 md:bg-rose-50 border border-rose-500/30 md:border-rose-200 text-rose-300 md:text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">
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
                <h2 className="text-xl font-bold text-white md:text-slate-800 tracking-tight">Recuperar contraseña</h2>
                <p className="text-sm text-slate-400 md:text-slate-500 mt-1">
                  {recoverSent
                    ? 'Revisa tu correo para continuar.'
                    : 'Te enviamos un enlace para restablecerla.'}
                </p>
              </div>

              {recoverSent ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3 bg-emerald-500/10 md:bg-emerald-50 border border-emerald-500/30 md:border-emerald-200 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 md:text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-200 md:text-emerald-700 leading-relaxed">
                      Si existe una cuenta con ese correo, te hemos enviado un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={switchToLogin}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-slate-200 md:text-slate-600 border border-white/10 md:border-slate-200 hover:bg-white/5 md:hover:bg-slate-50 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" /> Volver a iniciar sesión
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRecoverSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 md:text-slate-600 mb-1.5">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 md:text-slate-400" />
                      <input
                        type="email"
                        value={recoverEmail}
                        onChange={(e) => setRecoverEmail(e.target.value)}
                        autoComplete="email"
                        required
                        placeholder="usuario@empresa.net"
                        className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm bg-white/5 md:bg-white border border-white/10 md:border-slate-200 text-white md:text-slate-900 placeholder:text-slate-500 md:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                      />
                    </div>
                  </div>

                  {recoverError && (
                    <div className="bg-rose-500/10 md:bg-rose-50 border border-rose-500/30 md:border-rose-200 text-rose-300 md:text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">
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
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 md:text-slate-500 hover:text-slate-200 md:hover:text-slate-700 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
                  </button>
                </form>
              )}
            </>
          )}

          <p className="md:hidden text-slate-600 text-xs mt-8 text-center">
            © 2026 Tibox — Desarrollado por{' '}
            <a
              href="https://www.somosingenio.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-400 underline underline-offset-2 transition"
            >
              InGenio
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
