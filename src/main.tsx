import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {initSentry, Sentry} from './lib/sentry';
import ErrorFallback from './components/ErrorFallback.tsx';

initSentry();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={({ resetError }) => <ErrorFallback onReset={resetError} />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
