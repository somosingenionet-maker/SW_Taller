import { useState } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import { registrarTaller } from '../lib/data/suscripcion';
import PantallaAcceso from '../ui/Acceso';

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

  return (
    <PantallaAcceso ancha>
      {hecho ? (
        <div role="status">
          <CheckCircle2 aria-hidden="true" style={{ width: 44, height: 44, color: 'var(--u-ok)', marginBottom: 12 }} />
          <h1>¡Casi listo!</h1>
          <p className="u-exito" style={{ marginTop: 16 }}><Mail aria-hidden="true" style={{ width: 18, height: 18, flex: 'none', marginTop: 2 }} /><span>{hecho}</span></p>
          <p className="u-leer">¿No llega? Espera un par de minutos. Si ya te habías registrado antes con este correo, entra en <a href="/" className="u-enlace-acceso">el acceso</a> y pulsa «¿Olvidaste tu contraseña?».</p>
        </div>
      ) : (
        <>
          <h1>Prueba Doonty Motor gratis</h1>
          <p className="u-sub-acceso">14 días con todo incluido. Sin tarjeta. Sin compromiso.</p>

          <form onSubmit={enviar}>
            <div className="u-campo">
              <label htmlFor="taller">Nombre del taller</label>
              <input id="taller" className="u-sola" value={nombreTaller} onChange={(e) => setNombreTaller(e.target.value)} required maxLength={80} autoComplete="organization" placeholder="Talleres Ejemplo S.L." />
            </div>
            <div className="u-campo">
              <label htmlFor="nombre">Tu nombre</label>
              <input id="nombre" className="u-sola" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} autoComplete="name" placeholder="Nombre y apellidos" />
            </div>
            <div className="u-campo">
              <label htmlFor="email">Correo electrónico</label>
              <input id="email" type="email" className="u-sola" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" placeholder="tu@taller.es" />
              <small>Te enviaremos un enlace para activar la cuenta y elegir tu contraseña.</small>
            </div>
            <div className="u-campo">
              <label htmlFor="nif">NIF / CIF <span style={{ color: 'var(--u-muted)', fontWeight: 400 }}>(opcional, lo puedes completar luego)</span></label>
              <input id="nif" className="u-sola" value={nif} onChange={(e) => setNif(e.target.value)} maxLength={14} placeholder="B12345678" />
            </div>

            {/* Señuelo: oculto para personas; los bots suelen rellenarlo. */}
            <div aria-hidden="true" style={{ position: 'absolute', left: -9999, height: 0, width: 0, overflow: 'hidden' }}>
              <label>No rellenar <input tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} name="web" /></label>
            </div>

            <label className="u-check">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} required />
              <span>
                Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer" className="u-enlace-acceso">Términos de Uso</a>, la{' '}
                <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="u-enlace-acceso">Política de Privacidad</a> y el{' '}
                <a href="/encargo-de-tratamiento" target="_blank" rel="noopener noreferrer" className="u-enlace-acceso">contrato de encargo de tratamiento</a>.
              </span>
            </label>

            {error && <div role="alert" className="u-error">{error}</div>}

            <button type="submit" disabled={enviando || !acepta} className="u-btn pri grande">{enviando ? 'Creando tu cuenta…' : 'Empezar mi prueba gratuita'}</button>
            <p className="u-aparte">¿Ya tienes cuenta? <a href="/" className="u-enlace-acceso">Entrar</a></p>
          </form>
        </>
      )}
    </PantallaAcceso>
  );
}
