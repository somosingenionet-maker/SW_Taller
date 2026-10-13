import { supabase } from '../supabase';

export type EstadoSuscripcionUI = 'sin_limite' | 'prueba' | 'activa' | 'impago' | 'cancelada' | 'vencida';

export interface Suscripcion {
  estado: EstadoSuscripcionUI;
  /** Estado que informa Stripe (sin tener en cuenta si el acceso ya venció). */
  estadoStripe: string;
  accesoHasta: string | null;
  /** Fin real del periodo pagado (próxima renovación). `accesoHasta` suma unos días de margen. */
  periodoFin: string | null;
  pruebaHasta: string | null;
  plan: 'mensual' | 'anual' | null;
  cancelarAlFinal: boolean;
  tieneCliente: boolean;
  puedeEscribir: boolean;
}

/** Estado de la suscripción de la empresa del usuario (función de BD; funciona también en solo lectura). */
export async function getSuscripcion(): Promise<Suscripcion | null> {
  // La función se creó después de generar database.types.ts; el tipado se afina al regenerarlo.
  const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: Suscripcion | null; error: { message: string } | null }>)('mi_suscripcion');
  if (error) throw new Error(error.message);
  return data;
}

/** Días de margen que el servidor suma al fin del periodo (supabase/functions/_shared/stripe.ts). */
const MARGEN_DIAS = 3;

/** Fecha que se enseña como «renovación»/«fin»: el periodo real, no el acceso con margen. */
export function finPeriodo(s: Pick<Suscripcion, 'periodoFin' | 'accesoHasta'>): string | null {
  if (s.periodoFin) return s.periodoFin;
  return s.accesoHasta ? new Date(new Date(s.accesoHasta).getTime() - MARGEN_DIAS * 86_400_000).toISOString() : null;
}

/** Días enteros que quedan hasta `iso` (redondeando hacia arriba); 0 si ya pasó o no hay fecha. */
export function diasRestantes(iso: string | null, ahora = Date.now()): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - ahora;
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

export interface AvisoSuscripcion {
  nivel: 'info' | 'aviso' | 'error';
  texto: string;
  /** Qué botón ofrecer al administrador: pagar o gestionar el método de pago. */
  accion?: 'suscribirse' | 'gestionar';
}

/** El aviso que se enseña bajo la cabecera según el estado; null = nada que decir. */
export function avisoSuscripcion(s: Suscripcion, ahora = Date.now()): AvisoSuscripcion | null {
  switch (s.estado) {
    case 'sin_limite':
      return null;
    case 'prueba': {
      const d = diasRestantes(s.accesoHasta, ahora);
      return {
        nivel: d <= 3 ? 'aviso' : 'info',
        texto: d <= 1 ? 'Tu prueba gratuita termina hoy o mañana.' : `Prueba gratuita: te quedan ${d} días.`,
        accion: 'suscribirse',
      };
    }
    case 'activa':
      return s.cancelarAlFinal && finPeriodo(s)
        ? { nivel: 'info', texto: `Tu suscripción está cancelada y termina el ${fechaCorta(finPeriodo(s)!)}.`, accion: 'gestionar' }
        : null;
    case 'impago':
      return {
        nivel: 'aviso',
        texto: s.accesoHasta
          ? `No hemos podido cobrar tu suscripción. Actualiza tu método de pago antes del ${fechaCorta(s.accesoHasta)} para no pasar a modo solo lectura.`
          : 'No hemos podido cobrar tu suscripción. Actualiza tu método de pago.',
        accion: 'gestionar',
      };
    case 'cancelada':
      return {
        nivel: 'info',
        texto: finPeriodo(s) ? `Suscripción cancelada. Puedes seguir trabajando hasta el ${fechaCorta(finPeriodo(s)!)}.` : 'Suscripción cancelada.',
        accion: 'suscribirse',
      };
    case 'vencida':
      return {
        nivel: 'error',
        texto: s.estadoStripe === 'prueba'
          ? 'Tu prueba gratuita ha terminado. Puedes ver y exportar tus datos, pero no modificarlos hasta que te suscribas.'
          : 'Tu suscripción ha terminado. Puedes ver y exportar tus datos, pero no modificarlos hasta que la renueves.',
        accion: s.tieneCliente && s.estadoStripe !== 'prueba' ? 'gestionar' : 'suscribirse',
      };
  }
}

async function invocar<T>(nombre: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nombre, { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // cuerpo no JSON: se mantiene el mensaje genérico
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

/** Crea la sesión de pago de Stripe y devuelve la URL a la que enviar al usuario. */
export async function iniciarCheckout(plan: 'mensual' | 'anual'): Promise<string> {
  return (await invocar<{ url: string }>('billing', { action: 'checkout', plan })).url;
}

/** Portal de Stripe para cambiar la tarjeta, cancelar o descargar recibos. */
export async function abrirPortal(): Promise<string> {
  return (await invocar<{ url: string }>('billing', { action: 'portal' })).url;
}

export interface DatosAlta {
  nombreTaller: string;
  nombre: string;
  email: string;
  nif?: string;
  aceptaTerminos: boolean;
  /** Campo señuelo anti-bots: debe ir vacío. */
  web?: string;
}

/** Alta pública de un taller en periodo de prueba. Devuelve el mensaje a mostrar. */
export async function registrarTaller(datos: DatosAlta): Promise<string> {
  const r = await invocar<{ ok: true; mensaje: string }>('registro', { ...datos });
  return r.mensaje;
}
