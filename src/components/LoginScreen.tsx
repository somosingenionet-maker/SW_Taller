import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { Usuario } from '../types';
import { getUsuarios, getEmpresaConfig } from '../data/mockData';
import { hashPassword, migrateLegacyPasswords } from '../utils/auth';

interface LoginScreenProps {
  onLogin: (user: Usuario) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const empresaConfig = getEmpresaConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Convierte contraseñas guardadas en texto plano por versiones anteriores
    await migrateLegacyPasswords();

    const inputHash = await hashPassword(password);
    const usuarios = getUsuarios();
    const user = usuarios.find(
      u => u.email.toLowerCase() === email.trim().toLowerCase() && u.passwordHash === inputHash
    );

    if (!user) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.');
      setLoading(false);
      return;
    }

    if (!user.activo) {
      setError('Tu cuenta está desactivada. Contacta con el administrador.');
      setLoading(false);
      return;
    }

    setLoading(false);
    onLogin(user);
  };

  const initials = empresaConfig.nombre
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'E';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4">
      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header band */}
        <div className="bg-slate-950 px-8 py-8 flex flex-col items-center gap-4 border-b border-slate-800">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg"
            style={{ backgroundColor: empresaConfig.brandColor }}
          >
            {empresaConfig.logoBase64 ? (
              <img src={empresaConfig.logoBase64} alt="logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-white font-black text-2xl tracking-tighter">{initials}</span>
            )}
          </div>
          <div className="text-center">
            <h1 className="text-white font-bold text-lg tracking-tight">{empresaConfig.nombre}</h1>
            <p className="text-slate-400 text-xs mt-0.5">{empresaConfig.tagline}</p>
          </div>
        </div>

        {/* Form */}
        <div className="px-8 py-7">
          <h2 className="text-sm font-bold text-slate-700 mb-5 text-center">Acceso al sistema</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  placeholder="usuario@empresa.net"
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold text-white transition disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: empresaConfig.brandColor }}
            >
              {loading ? (
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Verificando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>

      <p className="text-slate-600 text-xs mt-6">
        © 2026 inGenio Datos y Comunicaciones — Entorno privado de backoffice
      </p>
    </div>
  );
}
