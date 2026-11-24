import { assert, assertEquals } from 'jsr:@std/assert@1';
import { construirCorreoSuscripcion, correoDelEvento } from './correos.ts';

const FIN = 1_798_059_660; // 23 dic 2026, 21:01 UTC
const sub = (extra: Record<string, unknown> = {}) => ({
  id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { empresa_id: 'emp-1' },
  items: { data: [{ price: { recurring: { interval: 'month' } }, current_period_end: FIN }] },
  ...extra,
});
const ev = (type: string, object: Record<string, unknown>, previous_attributes?: Record<string, unknown>) =>
  ({ type, data: { object, ...(previous_attributes ? { previous_attributes } : {}) } });

Deno.test('suscripción creada y activa → correo «activada» con plan y renovación', () => {
  assertEquals(correoDelEvento(ev('customer.subscription.created', sub())), {
    tipo: 'activada', empresaId: 'emp-1', clienteStripe: 'cus_1', plan: 'mensual', finPeriodo: new Date(FIN * 1000).toISOString(),
  });
});

Deno.test('suscripción creada con el pago pendiente no avisa; avisa cuando pasa a activa', () => {
  assertEquals(correoDelEvento(ev('customer.subscription.created', sub({ status: 'incomplete' }))), null);
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub(), { status: 'incomplete' }))?.tipo, 'activada');
});

Deno.test('programar la cancelación avisa una vez, por cualquiera de las dos formas de Stripe', () => {
  // Forma nueva (portal): cancel_at con fecha.
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub({ cancel_at: FIN }), { cancel_at: null }))?.tipo, 'cancelacion');
  // Forma clásica: cancel_at_period_end.
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub({ cancel_at_period_end: true }), { cancel_at_period_end: false }))?.tipo, 'cancelacion');
});

Deno.test('otra actualización de una suscripción ya cancelada no repite el correo', () => {
  // El portal manda un segundo «updated» (p. ej. con el motivo de la cancelación) sin tocar la fecha.
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub({ cancel_at: FIN }), { cancellation_details: { reason: null } })), null);
  // Cambiar la fecha de una cancelación que ya estaba programada tampoco.
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub({ cancel_at: FIN }), { cancel_at: FIN - 86400 })), null);
});

Deno.test('reactivar (quitar la cancelación) o renovar no manda correo', () => {
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub({ cancel_at: null }), { cancel_at: FIN })), null);
  assertEquals(correoDelEvento(ev('customer.subscription.updated', sub(), { items: {} })), null);
});

Deno.test('suscripción eliminada → «terminada»; otros eventos → nada', () => {
  assertEquals(correoDelEvento(ev('customer.subscription.deleted', sub({ status: 'canceled' })))?.tipo, 'terminada');
  assertEquals(correoDelEvento(ev('invoice.paid', { customer: 'cus_1' })), null);
  assertEquals(correoDelEvento(ev('checkout.session.completed', { mode: 'subscription' })), null);
});

Deno.test('los tres correos: asunto, fecha en español, plan y nombre del taller escapado', () => {
  const fin = new Date(FIN * 1000).toISOString();
  const a = construirCorreoSuscripcion({ tipo: 'activada', plan: 'anual', finPeriodo: fin }, 'Taller <Pepe> & Hijos');
  assertEquals(a.asunto, 'Tu suscripción a Doonty Motor está activa');
  assert(a.html.includes('plan anual'));
  assert(a.html.includes('23 de diciembre de 2026'));
  assert(a.html.includes('Taller &lt;Pepe&gt; &amp; Hijos'));
  assert(!a.html.includes('<Pepe>'));

  const c = construirCorreoSuscripcion({ tipo: 'cancelacion', finPeriodo: fin }, 'AutoSpartanos');
  assertEquals(c.asunto, 'Hemos recibido la cancelación de tu suscripción');
  assert(c.html.includes('terminará el <strong>23 de diciembre de 2026</strong>'));
  assert(c.html.includes('no se te cobrará nada más'));

  const t = construirCorreoSuscripcion({ tipo: 'terminada' }, 'AutoSpartanos');
  assertEquals(t.asunto, 'Tu suscripción a Doonty Motor ha terminado');
  assert(t.html.includes('no pagas otra vez la cuota de alta'));
});

Deno.test('sin fecha ni plan el correo sigue siendo correcto', () => {
  const a = construirCorreoSuscripcion({ tipo: 'activada' }, 'T');
  assert(!a.html.includes('Próxima renovación'));
  assert(!a.html.includes('undefined'));
  const c = construirCorreoSuscripcion({ tipo: 'cancelacion' }, 'T');
  assert(c.html.includes('al final del periodo que ya has pagado'));
});

// ── Avisos internos para el dueño de la plataforma ──
import { avisoInternoDelEvento } from './correos.ts';
import { construirAvisoPlataforma, DESTINATARIO_POR_DEFECTO } from '../_shared/avisoPlataforma.ts';

Deno.test('aviso interno de nueva suscripción: plan, precio por periodo y renovación', () => {
  const s = sub({ items: { data: [{ price: { unit_amount: 6990, recurring: { interval: 'month' } }, current_period_end: FIN }] } });
  const a = avisoInternoDelEvento(ev('customer.subscription.created', s), 'AutoSpartanos');
  assertEquals(a?.asunto, 'Nueva suscripción: AutoSpartanos');
  assertEquals(a?.datos, [['Taller', 'AutoSpartanos'], ['Plan', 'mensual'], ['Precio', '69,90 €/mes + IVA'], ['Próxima renovación', '23 dic 2026']]);
  assertEquals(a?.enlace?.url, 'https://dashboard.stripe.com/subscriptions/sub_1');
});

Deno.test('aviso interno de cancelación y de baja; nada en renovaciones', () => {
  assertEquals(avisoInternoDelEvento(ev('customer.subscription.updated', sub({ cancel_at: FIN }), { cancel_at: null }), 'T')?.asunto, 'Cancelación programada: T');
  assertEquals(avisoInternoDelEvento(ev('customer.subscription.deleted', sub({ status: 'canceled' })), 'T')?.asunto, 'Suscripción terminada: T');
  assertEquals(avisoInternoDelEvento(ev('customer.subscription.updated', sub(), { items: {} }), 'T'), null);
  assertEquals(avisoInternoDelEvento(ev('invoice.paid', { id: 'in_1', customer: 'cus_1' }), 'T'), null);
});

Deno.test('aviso interno de cobro fallido con importe y próximo reintento', () => {
  const a = avisoInternoDelEvento(ev('invoice.payment_failed', { id: 'in_9', customer: 'cus_1', amount_due: 8458, attempt_count: 1, next_payment_attempt: FIN }), 'T');
  assertEquals(a?.asunto, 'Cobro fallido: T');
  assertEquals(a?.datos, [['Taller', 'T'], ['Importe', '84,58 €'], ['Intento', '1'], ['Próximo reintento', '23 dic 2026']]);
  const sin = avisoInternoDelEvento(ev('invoice.payment_failed', { id: 'in_9', amount_due: 8458, attempt_count: 4, next_payment_attempt: null }), 'T');
  assertEquals(sin?.datos.at(-1), ['Próximo reintento', 'Stripe no volverá a intentarlo']);
});

Deno.test('el correo interno escapa los datos, omite los vacíos y va a Daniel por defecto', () => {
  const html = construirAvisoPlataforma({ asunto: 'x', titulo: 'Nuevo <taller>', datos: [['Taller', '<b>Pepe</b>'], ['NIF', ''], ['Motivo', null]], enlace: { texto: 'Ir', url: 'javascript:alert(1)' } });
  assert(html.includes('&lt;b&gt;Pepe&lt;/b&gt;'));
  assert(!html.includes('NIF'));
  assert(!html.includes('Motivo'));
  assert(!html.includes('javascript:')); // solo enlaces https
  assertEquals(DESTINATARIO_POR_DEFECTO, 'daniel.sanchez@somosingenio.net');
});
