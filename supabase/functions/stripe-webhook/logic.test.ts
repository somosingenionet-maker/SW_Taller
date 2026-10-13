import { assertEquals } from 'jsr:@std/assert@1';
import { planificarEvento } from './logic.ts';

const FIN = 1_800_000_000;
const finIso = new Date((FIN + 3 * 86400) * 1000).toISOString();

Deno.test('checkout completado enlaza empresa, cliente y suscripción', () => {
  assertEquals(planificarEvento({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', client_reference_id: 'emp-1', customer: 'cus_1', subscription: 'sub_1' } } }),
    { empresaId: 'emp-1', clienteStripe: 'cus_1', campos: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' } });
});

Deno.test('checkout que no es suscripción o sin empresa se ignora', () => {
  assertEquals(planificarEvento({ type: 'checkout.session.completed', data: { object: { mode: 'payment', client_reference_id: 'e', customer: 'c' } } }), null);
  assertEquals(planificarEvento({ type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'c' } } }), null);
});

Deno.test('suscripción activa prolonga el acceso y registra plan y cancelación programada', () => {
  const p = planificarEvento({ type: 'customer.subscription.updated', data: { object: {
    id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: true, metadata: { empresa_id: 'emp-1' },
    items: { data: [{ price: { recurring: { interval: 'year' } }, current_period_end: FIN }] },
  } } });
  assertEquals(p, { empresaId: 'emp-1', clienteStripe: 'cus_1', extenderHasta: finIso,
    campos: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', estado_suscripcion: 'activa', cancelar_al_final: true, plan_facturacion: 'anual' } });
});

Deno.test('current_period_end también se lee de la propia suscripción (otra versión de API)', () => {
  const p = planificarEvento({ type: 'customer.subscription.created', data: { object: { id: 's', customer: 'c', status: 'trialing', current_period_end: FIN, items: { data: [] } } } });
  assertEquals(p?.extenderHasta, finIso);
});

Deno.test('impago NO prolonga el acceso', () => {
  const p = planificarEvento({ type: 'customer.subscription.updated', data: { object: { id: 's', customer: 'c', status: 'past_due', items: { data: [{ current_period_end: FIN, price: { recurring: { interval: 'month' } } }] } } } });
  assertEquals(p?.campos.estado_suscripcion, 'impago');
  assertEquals(p?.extenderHasta, undefined);
});

Deno.test('suscripción eliminada: cancelada, sin prolongar y sin cancelación pendiente', () => {
  const p = planificarEvento({ type: 'customer.subscription.deleted', data: { object: { id: 's', customer: 'c', status: 'canceled', cancel_at_period_end: true, items: { data: [{ current_period_end: FIN }] } } } });
  assertEquals(p?.campos.estado_suscripcion, 'cancelada');
  assertEquals(p?.campos.cancelar_al_final, false);
  assertEquals(p?.extenderHasta, undefined);
});

Deno.test('factura pagada prolonga hasta el fin de periodo más largo', () => {
  const p = planificarEvento({ type: 'invoice.paid', data: { object: { customer: 'cus_1', lines: { data: [{ period: { end: FIN - 100 } }, { period: { end: FIN } }] } } } });
  assertEquals(p, { clienteStripe: 'cus_1', campos: { estado_suscripcion: 'activa' }, extenderHasta: finIso });
});

Deno.test('factura sin líneas con periodo se ignora', () => {
  assertEquals(planificarEvento({ type: 'invoice.paid', data: { object: { customer: 'c', lines: { data: [] } } } }), null);
});

Deno.test('pago fallido marca impago sin tocar el acceso', () => {
  assertEquals(planificarEvento({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }), { clienteStripe: 'cus_1', campos: { estado_suscripcion: 'impago' } });
});

Deno.test('eventos no atendidos o malformados se ignoran sin lanzar', () => {
  assertEquals(planificarEvento({ type: 'charge.refunded', data: { object: {} } }), null);
  assertEquals(planificarEvento({}), null);
  assertEquals(planificarEvento(null as never), null);
  assertEquals(planificarEvento({ type: 'invoice.paid', data: { object: { lines: { data: [{ period: { end: FIN } }] } } } }), null);
});
