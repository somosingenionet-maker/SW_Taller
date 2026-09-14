import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry, Sentry} from './lib/sentry';
import ErrorFallback from './components/ErrorFallback.tsx';
import LegalPage from './components/LegalPage.tsx';
import PortalCliente from './components/PortalCliente.tsx';
import PortalMecanico from './components/PortalMecanico.tsx';

initSentry();

// La app no usa un router — estas páginas públicas (accesibles sin iniciar
// sesión: legales, el Portal del Cliente y el Portal del Mecánico) se
// resuelven aquí por pathname antes de montar el resto de la aplicación.
const path = window.location.pathname.replace(/\/+$/, '');
const legalPage = path === '/privacidad' ? 'privacidad' : path === '/terminos' ? 'terminos' : null;
const portalToken = path.startsWith('/portal/') ? path.slice('/portal/'.length) : null;
const mecanicoToken = path.startsWith('/mecanico/') ? path.slice('/mecanico/'.length) : null;

function Root() {
  if (portalToken) return <PortalCliente token={portalToken} />;
  if (mecanicoToken) return <PortalMecanico token={mecanicoToken} />;
  if (legalPage) return <LegalPage page={legalPage} />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onReset={resetError} />}>
      <Root />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
