import { assertEquals } from 'jsr:@std/assert@1';
import { esPlan, paramsCheckout, paramsPortal, tieneSuscripcionViva } from './logic.ts';

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
