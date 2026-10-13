import { assertEquals } from 'jsr:@std/assert@1';
import { accesoHastaDesdeFinPeriodo, codificarParametros, estadoDesdeStripe, planDesdeIntervalo, verificarFirmaStripe } from './stripe.ts';

async function firmar(cuerpo: string, secreto: string, t: number) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${cuerpo}`));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('codifica parámetros anidados como Stripe', () => {
  const r = decodeURIComponent(codificarParametros({
    mode: 'subscription',
    line_items: [{ price: 'price_1', quantity: 1, tax_rates: ['txr_1'] }],
    metadata: { empresa_id: 'e1' },
    subscription_data: { metadata: { empresa_id: 'e1' } },
    omitido: undefined, nulo: null,
  }));
  assertEquals(r.split('&').sort(), [
    'line_items[0][price]=price_1', 'line_items[0][quantity]=1', 'line_items[0][tax_rates][0]=txr_1',
    'metadata[empresa_id]=e1', 'mode=subscription', 'subscription_data[metadata][empresa_id]=e1',
  ]);
});

Deno.test('escapa caracteres especiales', () => {
  assertEquals(codificarParametros({ customer_email: 'a+b@x.com', nombre: 'Taller & Hijos' }), 'customer_email=a%2Bb%40x.com&nombre=Taller%20%26%20Hijos');
});

Deno.test('firma válida, inválida, caducada y mal formada', async () => {
  const cuerpo = '{"id":"evt_1","type":"invoice.paid"}', secreto = 'whsec_test', t = 1_800_000_000;
  const f = await firmar(cuerpo, secreto, t);
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${f}`, secreto, t + 10), true);
  // cuerpo alterado
  assertEquals(await verificarFirmaStripe(cuerpo + ' ', `t=${t},v1=${f}`, secreto, t + 10), false);
  // secreto equivocado
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${f}`, 'whsec_otro', t + 10), false);
  // fuera de tolerancia (reenvío de un evento viejo)
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${f}`, secreto, t + 301), false);
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${f}`, secreto, t - 301), false);
  // varias firmas v1: basta con una válida (rotación de secretos)
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${'0'.repeat(64)},v1=${f}`, secreto, t), true);
  // cabeceras inválidas
  assertEquals(await verificarFirmaStripe(cuerpo, null, secreto, t), false);
  assertEquals(await verificarFirmaStripe(cuerpo, '', secreto, t), false);
  assertEquals(await verificarFirmaStripe(cuerpo, `v1=${f}`, secreto, t), false);
  assertEquals(await verificarFirmaStripe(cuerpo, `t=abc,v1=${f}`, secreto, t), false);
  assertEquals(await verificarFirmaStripe(cuerpo, `t=${t},v1=${f}`, '', t), false);
});

Deno.test('acceso hasta = fin de periodo + margen', () => {
  assertEquals(accesoHastaDesdeFinPeriodo(1_800_000_000, 3), new Date((1_800_000_000 + 3 * 86400) * 1000).toISOString());
  assertEquals(accesoHastaDesdeFinPeriodo(1_800_000_000, 0), new Date(1_800_000_000 * 1000).toISOString());
});

Deno.test('estados y planes', () => {
  assertEquals(['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled', 'incomplete_expired', 'otra'].map(estadoDesdeStripe),
    ['activa', 'activa', 'impago', 'impago', 'impago', 'impago', 'cancelada', 'cancelada', 'cancelada']);
  assertEquals([planDesdeIntervalo('month'), planDesdeIntervalo('year'), planDesdeIntervalo('week'), planDesdeIntervalo(undefined)], ['mensual', 'anual', null, null]);
});
