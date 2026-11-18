import { useEffect, useState } from 'react';
import { Check, LogOut } from 'lucide-react';
import { listarFactoresTotp, signOut, verificarCodigoMfa } from '../lib/auth';
import PantallaAcceso from '../ui/Acceso';

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
    <PantallaAcceso>
      <h1>Verificación en dos pasos</h1>
      <p className="u-sub-acceso">Abre tu aplicación autenticadora e introduce el código de 6 dígitos de Doonty.</p>

      <form onSubmit={enviar}>
        <div className="u-campo">
          <input
            className="u-sola"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={7}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/[^0-9 ]/g, ''))}
            aria-label="Código de verificación"
            placeholder="000000"
            style={{ textAlign: 'center', letterSpacing: '.4em', fontSize: 28, fontFamily: 'var(--u-f-plate)', padding: '14px' }}
          />
        </div>

        {error && <div role="alert" className="u-error">{error}</div>}

        <button type="submit" disabled={verificando || !factorId || codigo.replace(/\s/g, '').length < 6} className="u-btn pri grande">
          {verificando ? <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <Check />}
          {verificando ? 'Verificando…' : 'Verificar y entrar'}
        </button>
      </form>

      <button type="button" onClick={() => void signOut()} className="u-btn fantasma grande" style={{ marginTop: 12 }}><LogOut /> Cerrar sesión</button>
      <p className="u-aparte" style={{ fontSize: 13 }}>¿Perdiste el acceso a tu aplicación? Escribe a comercial@somosingenio.net para que te la restablezcamos.</p>
    </PantallaAcceso>
  );
}
