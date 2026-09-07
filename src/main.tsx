import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry, Sentry} from './lib/sentry';
import ErrorFallback from './components/ErrorFallback.tsx';
import LegalPage from './components/LegalPage.tsx';

initSentry();

// La app no usa un router — solo estas dos páginas legales necesitan una URL
// real y pública (accesible sin iniciar sesión), así que se resuelven aquí
// por pathname antes de montar el resto de la aplicación.
const path = window.location.pathname.replace(/\/+$/, '');
const page = path === '/privacidad' ? 'privacidad' : path === '/terminos' ? 'terminos' : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onReset={resetError} />}>
      {page ? <LegalPage page={page} /> : <App />}
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
