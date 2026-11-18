import { useState } from 'react';
import { Lock, Eye, EyeOff, Check } from 'lucide-react';
import { updatePassword } from '../lib/auth';
import { validarPassword, REQUISITOS_PASSWORD } from '../utils/password';
import PantallaAcceso from '../ui/Acceso';

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
    <PantallaAcceso>
      <h1>Nueva contraseña</h1>
      <p className="u-sub-acceso">Establece una contraseña nueva para tu cuenta.</p>

      <form onSubmit={handleSubmit}>
        <div className="u-campo">
          <label htmlFor="reset-clave">Nueva contraseña</label>
          <div className="u-input con-icono con-ojo">
            <Lock aria-hidden="true" />
            <input id="reset-clave" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required placeholder="••••••••" />
            <button type="button" className="u-ojo" onClick={() => setShowPassword((p) => !p)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
          <small>{REQUISITOS_PASSWORD}</small>
        </div>

        <div className="u-campo">
          <label htmlFor="reset-confirmar">Confirmar contraseña</label>
          <div className="u-input con-icono">
            <Lock aria-hidden="true" />
            <input id="reset-confirmar" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" required placeholder="••••••••" />
          </div>
        </div>

        {error && <div className="u-error" role="alert">{error}</div>}

        <button type="submit" disabled={saving} className="u-btn pri grande">
          {saving ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Check />}
          {saving ? 'Guardando...' : 'Guardar y entrar'}
        </button>
      </form>
    </PantallaAcceso>
  );
}
