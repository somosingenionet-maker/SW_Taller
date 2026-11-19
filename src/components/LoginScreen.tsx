import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Mail, Lock, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { signIn, sendPasswordReset } from '../lib/auth';
import PantallaAcceso from '../ui/Acceso';

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

  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);
  const [recoverError, setRecoverError] = useState('');
  const [recoverLoading, setRecoverLoading] = useState(false);

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
    <PantallaAcceso>
      {mode === 'login' ? (
        <>
          <h1>Iniciar sesión</h1>
          <p className="u-sub-acceso">Accede a tu espacio de trabajo</p>

          <form onSubmit={handleSubmit}>
            <div className="u-campo">
              <label htmlFor="acceso-correo">Correo electrónico</label>
              <div className="u-input con-icono">
                <Mail aria-hidden="true" />
                <input id="acceso-correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required placeholder="usuario@empresa.net" />
              </div>
            </div>

            <div className="u-campo">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label htmlFor="acceso-clave" style={{ margin: 0 }}>Contraseña</label>
                <button type="button" onClick={switchToRecover} className="u-enlace-acceso" style={{ fontSize: 14 }}>¿Olvidaste tu contraseña?</button>
              </div>
              <div className="u-input con-icono con-ojo">
                <Lock aria-hidden="true" />
                <input id="acceso-clave" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="••••••••" />
                <button type="button" className="u-ojo" onClick={() => setShowPassword((p) => !p)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>

            {mensajeError && <div className="u-error" role="alert">{mensajeError}</div>}

            <button type="submit" disabled={loading} className="u-btn pri grande">
              {loading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <LogIn />}
              {loading ? 'Verificando...' : 'Iniciar sesión'}
            </button>
            <p className="u-aparte">¿Aún no tienes cuenta? <a href="/registro" className="u-enlace-acceso">Prueba 14 días gratis</a></p>
          </form>
        </>
      ) : (
        <>
          <h1>Recuperar contraseña</h1>
          <p className="u-sub-acceso">{recoverSent ? 'Revisa tu correo para continuar.' : 'Te enviamos un enlace para restablecerla.'}</p>

          {recoverSent ? (
            <div>
              <div className="u-exito" role="status">
                <CheckCircle2 aria-hidden="true" style={{ width: 18, height: 18, flex: 'none', marginTop: 2 }} />
                <span>Si existe una cuenta con ese correo, te hemos enviado un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.</span>
              </div>
              <button type="button" onClick={switchToLogin} className="u-btn grande"><ArrowLeft /> Volver a iniciar sesión</button>
            </div>
          ) : (
            <form onSubmit={handleRecoverSubmit}>
              <div className="u-campo">
                <label htmlFor="acceso-recuperar">Correo electrónico</label>
                <div className="u-input con-icono">
                  <Mail aria-hidden="true" />
                  <input id="acceso-recuperar" type="email" value={recoverEmail} onChange={(e) => setRecoverEmail(e.target.value)} autoComplete="email" required placeholder="usuario@empresa.net" />
                </div>
              </div>
              {recoverError && <div className="u-error" role="alert">{recoverError}</div>}
              <button type="submit" disabled={recoverLoading} className="u-btn pri grande">
                {recoverLoading ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Send />}
                {recoverLoading ? 'Enviando...' : 'Enviar enlace'}
              </button>
              <button type="button" onClick={switchToLogin} className="u-btn fantasma grande"><ArrowLeft /> Volver a iniciar sesión</button>
            </form>
          )}
        </>
      )}
    </PantallaAcceso>
  );
}
