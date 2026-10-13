// Utilidades de Stripe sin dependencias: hablamos con su API REST con fetch. Todo lo que decide
// algo (firma, estado, fechas) es puro y se prueba en stripe.test.ts.

/** Días de margen tras el fin del periodo pagado antes de pasar a solo lectura (cobros que tardan). */
export const MARGEN_DIAS = 3;

/** Duración de la prueba gratuita en el alta. */
export const DIAS_PRUEBA = 14;

/** Codifica un objeto anidado como espera Stripe: `line_items[0][price]=x&metadata[a]=b`. */
export function codificarParametros(obj: Record<string, unknown>, prefijo = ''): string {
  const partes: string[] = [];
  for (const [clave, valor] of Object.entries(obj)) {
    if (valor === undefined || valor === null) continue;
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (Array.isArray(valor)) {
      valor.forEach((v, i) => {
        if (v !== null && typeof v === 'object') partes.push(codificarParametros(v as Record<string, unknown>, `${nombre}[${i}]`));
        else partes.push(`${encodeURIComponent(`${nombre}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
    } else if (typeof valor === 'object') {
      const sub = codificarParametros(valor as Record<string, unknown>, nombre);
      if (sub) partes.push(sub);
    } else {
      partes.push(`${encodeURIComponent(nombre)}=${encodeURIComponent(String(valor))}`);
    }
  }
  return partes.filter(Boolean).join('&');
}

const aHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function igualesEnTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verifica la cabecera `Stripe-Signature` (`t=<ts>,v1=<hmac>[,v1=<hmac>…]`): HMAC-SHA256 de
 * `<ts>.<cuerpo exacto>` con el secreto del webhook, y marca de tiempo dentro de la tolerancia
 * (evita que se reenvíe un evento antiguo capturado).
 */
export async function verificarFirmaStripe(
  cuerpo: string,
  cabecera: string | null,
  secreto: string,
  ahora = Math.floor(Date.now() / 1000),
  tolerancia = 300,
): Promise<boolean> {
  if (!cabecera || !secreto) return false;
  const partes = cabecera.split(',').map((p) => p.trim().split('='));
  const t = partes.find(([k]) => k === 't')?.[1];
  const firmas = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || firmas.length === 0 || !/^\d+$/.test(t)) return false;
  if (Math.abs(ahora - Number(t)) > tolerancia) return false;

  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const esperada = aHex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${t}.${cuerpo}`)));
  return firmas.some((f) => igualesEnTiempoConstante(f, esperada));
}

/** Fin del periodo pagado (segundos Unix) + margen → fecha ISO hasta la que se puede escribir. */
export function accesoHastaDesdeFinPeriodo(finPeriodoUnix: number, margenDias = MARGEN_DIAS): string {
  return new Date((finPeriodoUnix + margenDias * 86400) * 1000).toISOString();
}

export type EstadoSuscripcion = 'prueba' | 'activa' | 'impago' | 'cancelada';

export function estadoDesdeStripe(status: string): EstadoSuscripcion {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'activa';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return 'impago';
    default: // canceled, incomplete_expired
      return 'cancelada';
  }
}

export function planDesdeIntervalo(intervalo: string | undefined): 'mensual' | 'anual' | null {
  return intervalo === 'month' ? 'mensual' : intervalo === 'year' ? 'anual' : null;
}

/** Llamada a la API de Stripe. `clave` es la clave secreta (sk_…). */
export async function stripeApi<T = Record<string, unknown>>(
  clave: string,
  ruta: string,
  params?: Record<string, unknown>,
  metodo: 'GET' | 'POST' = 'POST',
): Promise<T> {
  const cuerpo = params ? codificarParametros(params) : '';
  const resp = await fetch(`https://api.stripe.com/v1/${ruta}${metodo === 'GET' && cuerpo ? `?${cuerpo}` : ''}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${clave}`,
      ...(metodo === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: metodo === 'POST' ? cuerpo : undefined,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(`Stripe ${resp.status}: ${json?.error?.message ?? 'error desconocido'}`);
  return json as T;
}
