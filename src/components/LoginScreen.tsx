import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock, Car, Wrench, Users, FileText } from 'lucide-react';
import { signIn } from '../lib/auth';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <span className="text-white font-black text-xl tracking-tighter">T</span>
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
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
            <span className="text-white font-black text-2xl tracking-tighter">T</span>
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Tibox Motor</span>
        </div>

        <div className="relative z-10 w-full max-w-sm md:bg-white/90 md:backdrop-blur-xl md:border md:border-white md:rounded-3xl md:shadow-2xl md:shadow-slate-400/20 md:p-8">
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
              <label className="block text-xs font-semibold text-slate-300 md:text-slate-600 mb-1.5">
                Contraseña
              </label>
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
