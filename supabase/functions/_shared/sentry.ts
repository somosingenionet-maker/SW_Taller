// Monitorización de errores en las Edge Functions — igual que
// src/lib/sentry.ts en el frontend: sin SENTRY_DSN configurado (el caso
// normal en desarrollo local) no hace nada, no hace falta darlo de alta
// para trabajar en el proyecto. Solo captura errores (sin trazas de
// rendimiento ni profiling) para mantenerlo simple.
//
// El SDK de Sentry para Deno NO instrumenta Deno.serve automáticamente
// (a diferencia de los SDKs de Node) — hay que capturar manualmente con
// try/catch, y forzar el envío con Sentry.flush() antes de responder,
// porque el runtime puede terminar el proceso justo después de la
// respuesta sin esperar a que la petición HTTP a Sentry termine.
// Ver: https://docs.sentry.io/platforms/javascript/guides/deno/
import * as Sentry from 'npm:@sentry/deno@8';

const dsn = Deno.env.get('SENTRY_DSN');

export function initSentry(nombreFuncion: string) {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: 'production',
    // Evita que el SDK instrumente automáticamente cosas pensadas para un
    // servidor de larga duración — el isolate de una Edge Function se
    // reutiliza entre peticiones distintas, y la instrumentación por
    // defecto podría filtrar estado de una petición a otra.
    defaultIntegrations: false,
  });
  Sentry.setTag('function', nombreFuncion);
}

export { Sentry };

/** Envuelve el handler de Deno.serve para reportar a Sentry cualquier error
 * no capturado explícitamente por el propio handler, antes de responder. */
export function conSentry(
  handler: (req: Request) => Promise<Response>,
  corsHeaders: Record<string, string>,
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (e) {
      Sentry.captureException(e);
      await Sentry.flush(2000);
      return new Response(JSON.stringify({ error: 'Error interno del servidor.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  };
}
