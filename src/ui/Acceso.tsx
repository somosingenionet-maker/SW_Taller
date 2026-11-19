import { type ReactNode } from 'react';
import { KeyRound } from 'lucide-react';

/** Marco de las pantallas de acceso (entrar, alta, contraseña nueva, verificación): panel de marca a la izquierda y el formulario centrado. */
export default function PantallaAcceso({ ancha, children }: { ancha?: boolean; children: ReactNode }) {
  const marca = <><img className="u-logo-img" src="/logo-doonty.svg" alt="" /><span>Doonty <em>Motor</em></span></>;
  return (
    <div className="u-acceso">
      <aside className="u-acceso-marca" aria-hidden="true">
        <div className="u-logo">{marca}</div>
        <div>
          <h2>Tu taller, en orden.</h2>
          <ul>
            <li>Recibe el coche, presupuesta, avisa al cliente y entrega, todo en un mismo sitio.</li>
            <li>Cada cliente con sus coches, su historial y su propio enlace para seguir la reparación.</li>
            <li>Facturas, compras y citas online, listas para tu gestoría.</li>
          </ul>
        </div>
        <span className="u-llavero-deco"><span className="u-llave u-e-listo"><KeyRound /></span><span><b>Listo para entregar</b><span className="u-matri">1234 ABC</span></span></span>
      </aside>
      <main className="u-acceso-form">
        <div className={`u-acceso-caja${ancha ? ' ancha' : ''}`}>
          <div className="u-acceso-movil u-logo" style={{ marginBottom: 28 }}>{marca}</div>
          {children}
        </div>
        <p className="u-acceso-pie">
          © 2026 Doonty Motor — Desarrollado por <a href="https://www.somosingenio.net" target="_blank" rel="noopener noreferrer">InGenio</a>
          {' · '}<a href="/privacidad">Privacidad</a>{' · '}<a href="/terminos">Términos</a>
        </p>
      </main>
    </div>
  );
}
