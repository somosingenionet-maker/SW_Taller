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

// ── Datos fiscales del taller ──
// Daniel factura cada cobro a mano, así que sin razón social, NIF y dirección no se puede pagar. Se piden
// en la app y no en Stripe porque no está claro que el NIF de Stripe para España (es_cif, ejemplo
// «A12345678») acepte el NIF de un autónomo (12345678Z) o un NIE.

/** «b-1234 5678», «ES12345678Z» → «B12345678», «12345678Z». */
export function normalizarNif(v: string): string {
  return v.toUpperCase().replace(/[\s.\-]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');
}

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** NIF español: DNI, NIE o NIF de entidad (antiguo CIF), con su dígito o letra de control. */
export function nifValido(entrada: string): boolean {
  const v = normalizarNif(entrada);
  let m = v.match(/^(\d{8})([A-Z])$/); // DNI
  if (m) return LETRAS_DNI[Number(m[1]) % 23] === m[2];
  m = v.match(/^([XYZ])(\d{7})([A-Z])$/); // NIE
  if (m) return LETRAS_DNI[Number('XYZ'.indexOf(m[1]) + m[2]) % 23] === m[3];
  // Entidades y NIF K/L/M: letra + 7 cifras + control (cifra o letra según el tipo).
  m = v.match(/^([ABCDEFGHJKLMNPQRSUVW])(\d{7})([0-9A-Z])$/);
  if (!m) return false;
  let suma = 0;
  m[2].split('').forEach((c, i) => {
    const n = Number(c);
    if (i % 2 === 0) { const d = n * 2; suma += Math.floor(d / 10) + (d % 10); } else suma += n;
  });
  const digito = (10 - (suma % 10)) % 10;
  const letra = 'JABCDEFGHI'[digito];
  // K, L y M (personas sin DNI): las fuentes difieren en el cálculo; se acepta cualquiera de los dos.
  if ('KLM'.includes(m[1])) return m[3] === letra || LETRAS_DNI[Number(m[2]) % 23] === m[3];
  if ('PQRSNW'.includes(m[1])) return m[3] === letra;
  if ('ABEH'.includes(m[1])) return m[3] === String(digito);
  return m[3] === String(digito) || m[3] === letra;
}

export interface DatosFiscales { razon_social: string | null; nif: string | null; direccion_fiscal: string | null; ciudad: string | null }

/** Lo que impide facturar al taller, en una frase para él; null si está todo. */
export function problemaDatosFiscales(e: DatosFiscales): string | null {
  const faltan = [
    !(e.razon_social ?? '').trim() && 'la razón social',
    !(e.nif ?? '').trim() && 'el NIF',
    !(e.direccion_fiscal ?? '').trim() && 'la dirección fiscal',
    !(e.ciudad ?? '').trim() && 'la ciudad',
  ].filter(Boolean) as string[];
  if (faltan.length) {
    const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan.at(-1)}`;
    return `Para poder hacerte la factura necesitamos ${lista} de tu empresa.`;
  }
  if (!nifValido(e.nif ?? '')) return 'El NIF no es correcto. Revisa que esté completo y con su letra o cifra final.';
  if (!/\b\d{5}\b/.test(`${e.direccion_fiscal} ${e.ciudad}`)) return 'Falta el código postal en la dirección fiscal.';
  return null;
}

export function paramsPortal(clienteStripe: string, appUrl: string): Record<string, unknown> {
  return { customer: clienteStripe, locale: 'es', return_url: `${appUrl}/?suscripcion=portal` };
}
