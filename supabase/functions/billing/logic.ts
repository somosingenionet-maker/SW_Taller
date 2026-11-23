// Construcción de las peticiones a Stripe para cobrar la suscripción. Pura y probada: un error aquí
// significa cobrar mal o no enlazar el pago con la empresa correcta.
export type Plan = 'mensual' | 'anual';

export interface ConfigCobro {
  precioMensual: string;
  precioAnual: string;
  /** Precio único de la cuota de alta (price_… de pago único). Si no hay, no se cobra alta. */
  precioAlta?: string;
  /** Tax Rate de Stripe (IVA 21 %); si no hay, el precio se cobra tal cual. */
  tasaIva?: string;
  appUrl: string;
}

export function esPlan(v: unknown): v is Plan {
  return v === 'mensual' || v === 'anual';
}

/**
 * ¿Se cobra la cuota de alta? Solo en la primera suscripción: si la empresa ya tuvo una (el id se
 * conserva aunque la cancele), al volver no paga el alta otra vez. Vale igual para mensual y anual.
 */
export function cobraAlta(e: { stripe_subscription_id: string | null }, cfg: Pick<ConfigCobro, 'precioAlta'>): boolean {
  return !!cfg.precioAlta && !e.stripe_subscription_id;
}

/** ¿Ya tiene una suscripción viva? Entonces no se crea otra: se gestiona desde el portal. */
export function tieneSuscripcionViva(e: { stripe_subscription_id: string | null; estado_suscripcion: string }): boolean {
  return !!e.stripe_subscription_id && (e.estado_suscripcion === 'activa' || e.estado_suscripcion === 'impago');
}

export function paramsCheckout(args: {
  empresaId: string;
  email: string;
  plan: Plan;
  clienteStripe: string | null;
  /** true en la primera suscripción (ver cobraAlta): añade la cuota de alta a la primera factura. */
  conAlta?: boolean;
  cfg: ConfigCobro;
}): Record<string, unknown> {
  const { empresaId, email, plan, clienteStripe, conAlta, cfg } = args;
  const iva = cfg.tasaIva ? { tax_rates: [cfg.tasaIva] } : {};
  return {
    mode: 'subscription',
    locale: 'es',
    // Con esto el webhook sabe a qué empresa pertenece el pago.
    client_reference_id: empresaId,
    metadata: { empresa_id: empresaId },
    subscription_data: { metadata: { empresa_id: empresaId } },
    line_items: [
      { price: plan === 'anual' ? cfg.precioAnual : cfg.precioMensual, quantity: 1, ...iva },
      // Un precio de pago único en modo suscripción se cobra una sola vez, en la primera factura.
      ...(conAlta && cfg.precioAlta ? [{ price: cfg.precioAlta, quantity: 1, ...iva }] : []),
    ],
    // Solo tarjeta: sin esto Stripe ofrece todo lo activado en la cuenta (Klarna, Amazon Pay…), con
    // comisiones de hasta el triple. Si se añade el adeudo SEPA, revisar antes el webhook (cobro diferido).
    allowed_payment_method_types: ['card'],
    allow_promotion_codes: true, // cupones del programa fundador y referidos
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true }, // NIF/CIF del taller para la factura
    success_url: `${cfg.appUrl}/?suscripcion=ok`,
    cancel_url: `${cfg.appUrl}/?suscripcion=cancelada`,
    ...(clienteStripe
      ? { customer: clienteStripe, customer_update: { name: 'auto', address: 'auto' } }
      : { customer_email: email }),
  };
}

export function paramsPortal(clienteStripe: string, appUrl: string): Record<string, unknown> {
  return { customer: clienteStripe, locale: 'es', return_url: `${appUrl}/?suscripcion=portal` };
}
