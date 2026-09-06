import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/**
 * Monitorización de errores en producción. Sin VITE_SENTRY_DSN configurado
 * (el caso normal en desarrollo local) esta función no hace nada — no hace
 * falta darlo de alta para trabajar en el proyecto.
 *
 * Solo captura errores (sin trazas de rendimiento ni session replay) para
 * mantenerlo simple y dentro del plan gratuito de Sentry.
 */
export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

export { Sentry };
