import { assertEquals } from 'jsr:@std/assert@1';
import { cobraAlta, esPlan, paramsCheckout, paramsPortal, tieneSuscripcionViva } from './logic.ts';

const cfg = { precioMensual: 'price_m', precioAnual: 'price_a', tasaIva: 'txr_21', appUrl: 'https://motor.doonty.com' };

Deno.test('checkout mensual nuevo: enlaza la empresa por tres vías y usa el correo', () => {
  const p = paramsCheckout({ empresaId: 'emp-1', email: 'a@x.com', plan: 'mensual', clienteStripe: null, cfg }) as Record<string, any>;
  assertEquals(p.mode, 'subscription');
  assertEquals(p.client_reference_id, 'emp-1');
  assertEquals(p.metadata, { empresa_id: 'emp-1' });
  assertEquals(p.subscription_data, { metadata: { empresa_id: 'emp-1' } });
  assertEquals(p.line_items, [{ price: 'price_m', quantity: 1, tax_rates: ['txr_21'] }]);
  assertEquals(p.customer_email, 'a@x.com');
  assertEquals(p.customer, undefined);
  assertEquals(p.success_url, 'https://motor.doonty.com/?suscripcion=ok');
  assertEquals(p.allow_promotion_codes, true);
  assertEquals(p.allowed_payment_method_types, ['card']);
  assertEquals(p.payment_method_types, undefined); // retirado en la API 2026-09-30.endive: Stripe responde 400
});

Deno.test('plan anual usa el precio anual', () => {
  const p = paramsCheckout({ empresaId: 'e', email: 'a@x.com', plan: 'anual', clienteStripe: null, cfg }) as Record<string, any>;
  assertEquals(p.line_items[0].price, 'price_a');
});

Deno.test('cliente ya existente en Stripe: se reutiliza y no se envía el correo', () => {
  const p = paramsCheckout({ empresaId: 'e', email: 'a@x.com', plan: 'mensual', clienteStripe: 'cus_1', cfg }) as Record<string, any>;
  assertEquals(p.customer, 'cus_1');
  assertEquals(p.customer_email, undefined);
  assertEquals(p.customer_update, { name: 'auto', address: 'auto' });
});

Deno.test('sin tasa de IVA configurada no se envía tax_rates', () => {
  const p = paramsCheckout({ empresaId: 'e', email: 'a@x.com', plan: 'mensual', clienteStripe: null, cfg: { ...cfg, tasaIva: undefined } }) as Record<string, any>;
  assertEquals(p.line_items[0], { price: 'price_m', quantity: 1 });
});

Deno.test('portal y validación de plan', () => {
  assertEquals(paramsPortal('cus_1', 'https://motor.doonty.com'), { customer: 'cus_1', locale: 'es', return_url: 'https://motor.doonty.com/?suscripcion=portal' });
  assertEquals(['mensual', 'anual', 'semanal', '', null, undefined].map(esPlan), [true, true, false, false, false, false]);
});

Deno.test('suscripción viva: activa o en impago con id de Stripe; no si cancelada o sin id', () => {
  assertEquals(tieneSuscripcionViva({ stripe_subscription_id: 'sub_1', estado_suscripcion: 'activa' }), true);
  assertEquals(tieneSuscripcionViva({ stripe_subscription_id: 'sub_1', estado_suscripcion: 'impago' }), true);
  assertEquals(tieneSuscripcionViva({ stripe_subscription_id: 'sub_1', estado_suscripcion: 'cancelada' }), false);
  assertEquals(tieneSuscripcionViva({ stripe_subscription_id: null, estado_suscripcion: 'activa' }), false);
  assertEquals(tieneSuscripcionViva({ stripe_subscription_id: null, estado_suscripcion: 'prueba' }), false);
});

Deno.test('alta: se añade como segundo concepto con IVA, en mensual y en anual', () => {
  const c = { ...cfg, precioAlta: 'price_alta' };
  for (const plan of ['mensual', 'anual'] as const) {
    const p = paramsCheckout({ empresaId: 'e', email: 'a@x.com', plan, clienteStripe: null, conAlta: true, cfg: c }) as Record<string, any>;
    assertEquals(p.line_items.length, 2);
    assertEquals(p.line_items[1], { price: 'price_alta', quantity: 1, tax_rates: ['txr_21'] });
  }
  const sin = paramsCheckout({ empresaId: 'e', email: 'a@x.com', plan: 'mensual', clienteStripe: null, conAlta: false, cfg: c }) as Record<string, any>;
  assertEquals(sin.line_items.length, 1);
});

Deno.test('alta: solo en la primera suscripción y solo si está configurada', () => {
  assertEquals(cobraAlta({ stripe_subscription_id: null }, { precioAlta: 'price_alta' }), true);
  assertEquals(cobraAlta({ stripe_subscription_id: 'sub_viejo' }, { precioAlta: 'price_alta' }), false);
  assertEquals(cobraAlta({ stripe_subscription_id: null }, { precioAlta: undefined }), false);
});

// ── Datos fiscales obligatorios antes de pagar ──
import { nifValido, normalizarNif, problemaDatosFiscales } from './logic.ts';

Deno.test('NIF: DNI, NIE y entidades con su control; normaliza espacios, guiones y prefijo ES', () => {
  for (const ok of ['12345678Z', 'X1234567L', 'Y5483982Z', 'B67776815', 'B12345674', 'Q2826000H', ' b-6777 6815 ', 'ES12345678Z', 'es-B67776815']) {
    assertEquals(nifValido(ok), true, ok);
  }
  for (const mal of ['12345678A', 'X1234567A', 'B67776816', 'Q2826000A', 'B1234567', '1234567Z', '', 'ABCDEFGHI']) {
    assertEquals(nifValido(mal), false, mal);
  }
  assertEquals(normalizarNif(' b-6777.6815 '), 'B67776815');
});

Deno.test('datos fiscales: dice qué falta, comprueba el NIF y pide código postal', () => {
  const bien = { razon_social: 'Taller Pepe S.L.', nif: 'B67776815', direccion_fiscal: 'Calle Mayor 4, 07006', ciudad: 'Palma' };
  assertEquals(problemaDatosFiscales(bien), null);
  assertEquals(problemaDatosFiscales({ ...bien, direccion_fiscal: 'Calle Mayor 4', ciudad: '07006 Palma' }), null);
  assertEquals(problemaDatosFiscales({ razon_social: '', nif: null, direccion_fiscal: ' ', ciudad: 'Palma' }),
    'Para poder hacerte la factura necesitamos la razón social, el NIF y la dirección fiscal de tu empresa.');
  assertEquals(problemaDatosFiscales({ ...bien, nif: '' }), 'Para poder hacerte la factura necesitamos el NIF de tu empresa.');
  assertEquals(problemaDatosFiscales({ ...bien, nif: 'B67776816' })?.startsWith('El NIF no es correcto'), true);
  assertEquals(problemaDatosFiscales({ ...bien, direccion_fiscal: 'Calle Mayor 4' }), 'Falta el código postal en la dirección fiscal.');
});
