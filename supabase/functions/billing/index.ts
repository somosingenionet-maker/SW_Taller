// Cobro de la suscripción: crea la sesión de pago (Stripe Checkout) o la de gestión (portal de cliente).
// Solo el administrador de la empresa, con el segundo factor pasado si lo tiene activado.
//
// Secrets necesarios (Supabase → Edge Functions → Secrets), los pone el dueño, nunca el código:
//   STRIPE_SECRET_KEY    clave secreta de Stripe (sk_test_… en pruebas, sk_live_… en producción)
//   STRIPE_PRICE_MENSUAL id del precio mensual (price_…)
//   STRIPE_PRICE_ANUAL   id del precio anual (price_…)
//   STRIPE_TAX_RATE_IVA  (opcional) id de la tasa de IVA 21 % (txr_…)
//   APP_URL              (opcional) por defecto https://motor.doonty.com
import { createClient } from 'npm:@supabase/supabase-js@2';
import { stripeApi } from '../_shared/stripe.ts';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';
import { permitirPeticion } from '../_shared/rateLimit.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { esPlan, paramsCheckout, paramsPortal, tieneSuscripcionViva } from './logic.ts';

initSentry('billing');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const CFG = {
  precioMensual: Deno.env.get('STRIPE_PRICE_MENSUAL') ?? '',
  precioAnual: Deno.env.get('STRIPE_PRICE_ANUAL') ?? '',
  tasaIva: Deno.env.get('STRIPE_TAX_RATE_IVA') || undefined,
  appUrl: (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, ''),
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (!STRIPE_KEY) return json({ error: 'El cobro aún no está configurado en el servidor.' }, 503);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'Sesión inválida' }, 401);
  const userId = userData.user.id;
  if (await falta2Factor(admin, token, userId)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: perfil } = await admin.from('perfiles').select('rol, empresa_id, email').eq('id', userId).single();
  if (!perfil?.empresa_id || perfil.rol !== 'admin') {
    return json({ error: 'Solo el administrador de la empresa puede gestionar la suscripción.' }, 403);
  }
  if (!(await permitirPeticion(admin, `billing:${userId}`, 20, 3600))) {
    return json({ error: 'Demasiados intentos. Espera un rato.' }, 429);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido' }, 400); }

  const { data: empresa } = await admin
    .from('empresas')
    .select('id, stripe_customer_id, stripe_subscription_id, estado_suscripcion')
    .eq('id', perfil.empresa_id)
    .single();
  if (!empresa) return json({ error: 'Empresa no encontrada.' }, 404);

  try {
    if (body.action === 'checkout') {
      if (!esPlan(body.plan)) return json({ error: 'Plan no válido.' }, 400);
      if (!CFG.precioMensual || !CFG.precioAnual) return json({ error: 'Los precios aún no están configurados en el servidor.' }, 503);
      if (tieneSuscripcionViva(empresa)) {
        return json({ error: 'Ya tienes una suscripción activa. Usa «Gestionar suscripción» para cambiarla.' }, 409);
      }
      const sesion = await stripeApi<{ url: string }>(STRIPE_KEY, 'checkout/sessions', paramsCheckout({
        empresaId: empresa.id, email: perfil.email ?? userData.user.email ?? '', plan: body.plan,
        clienteStripe: empresa.stripe_customer_id, cfg: CFG,
      }));
      return json({ url: sesion.url });
    }

    if (body.action === 'portal') {
      if (!empresa.stripe_customer_id) return json({ error: 'Aún no tienes ninguna suscripción que gestionar.' }, 409);
      const sesion = await stripeApi<{ url: string }>(STRIPE_KEY, 'billing_portal/sessions', paramsPortal(empresa.stripe_customer_id, CFG.appUrl));
      return json({ url: sesion.url });
    }

    return json({ error: 'Acción no soportada.' }, 400);
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    // El detalle de Stripe no se enseña al usuario.
    return json({ error: 'No se pudo conectar con el sistema de pago. Inténtalo de nuevo en unos minutos.' }, 502);
  }
}, CORS_HEADERS));
