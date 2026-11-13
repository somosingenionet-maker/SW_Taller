// Debe ir el primero: captura el enlace de invitación antes de que Supabase lo consuma.
import './lib/invitacion';
import {StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import {initSentry, Sentry} from './lib/sentry';
import ErrorFallback from './components/ErrorFallback.tsx';
import Cargando from './components/Cargando.tsx';
import {lazyConReintento} from './lib/lazy';
import {registrarServiceWorker} from './lib/pwa';

// Cada página es un trozo aparte: quien abre el enlace de un mecánico o de un cliente no descarga
// la aplicación del taller entera, y al revés.
const cargarApp = () => import('./App.tsx');
const App = lazyConReintento(cargarApp);
const LegalPage = lazyConReintento(() => import('./components/LegalPage.tsx'));
const PortalCliente = lazyConReintento(() => import('./components/PortalCliente.tsx'));
const PortalMecanico = lazyConReintento(() => import('./components/PortalMecanico.tsx'));
const RegistroPage = lazyConReintento(() => import('./components/RegistroPage.tsx'));

initSentry();
registrarServiceWorker();

// La app no usa un router — estas páginas públicas (accesibles sin iniciar
// sesión: legales, el Portal del Cliente y el Portal del Mecánico) se
// resuelven aquí por pathname antes de montar el resto de la aplicación.
const path = window.location.pathname.replace(/\/+$/, '');
const legalPage = path === '/privacidad' ? 'privacidad'
  : path === '/terminos' ? 'terminos'
  : path === '/declaracion-responsable' ? 'declaracion-responsable'
  : path === '/encargo-de-tratamiento' ? 'encargo-de-tratamiento'
  : null;
const esRegistro = path === '/registro';
const portalToken = path.startsWith('/portal/') ? path.slice('/portal/'.length) : null;
const mecanicoToken = path.startsWith('/mecanico/') ? path.slice('/mecanico/'.length) : null;

// La aplicación empieza a bajarse ya, en paralelo al arranque, sin esperar a que React la pida.
if (!portalToken && !mecanicoToken && !legalPage && !esRegistro) void cargarApp();

function Root() {
  if (portalToken) return <PortalCliente token={portalToken} />;
  if (mecanicoToken) return <PortalMecanico token={mecanicoToken} />;
  if (legalPage) return <LegalPage page={legalPage} />;
  if (esRegistro) return <RegistroPage />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onReset={resetError} />}>
      <Suspense fallback={<Cargando pantallaCompleta />}>
        <Root />
      </Suspense>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
