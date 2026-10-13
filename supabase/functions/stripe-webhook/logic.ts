// Qué hace cada evento de Stripe con la suscripción de una empresa. Puro (sin red ni BD) para poder
// probarlo con eventos reales. El acceso nunca se acorta aquí: un impago o una cancelación no tocan
// `acceso_hasta`; simplemente nadie lo prolonga y el taller pasa a solo lectura cuando vence.
import { accesoHastaDesdeFinPeriodo, estadoDesdeStripe, planDesdeIntervalo } from '../_shared/stripe.ts';

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

export interface PlanEvento {
  /** Empresa si el evento la trae (metadata); si no, se busca por `clienteStripe`. */
  empresaId?: string;
  clienteStripe?: string;
  /** Columnas de `empresas` a actualizar. */
  campos: Record<string, unknown>;
  /** Prolonga `acceso_hasta` hasta esta fecha ISO (nunca lo acorta). */
  extenderHasta?: string;
}

export const EVENTOS_ATENDIDOS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

const idDe = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof (v as Obj)?.id === 'string' ? (v as Obj).id : undefined;

/** Fin del periodo actual de una suscripción (según la versión de API está en la suscripción o en sus ítems). */
function finPeriodoSuscripcion(sub: Obj): number | undefined {
  const n = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return typeof n === 'number' ? n : undefined;
}

export function planificarEvento(evento: Obj): PlanEvento | null {
  const o: Obj = evento?.data?.object ?? {};

  switch (evento?.type) {
    case 'checkout.session.completed': {
      if (o.mode !== 'subscription') return null;
      const empresaId = o.client_reference_id ?? o.metadata?.empresa_id;
      const cliente = idDe(o.customer);
      if (!empresaId || !cliente) return null;
      return {
        empresaId,
        clienteStripe: cliente,
        campos: { stripe_customer_id: cliente, ...(idDe(o.subscription) ? { stripe_subscription_id: idDe(o.subscription) } : {}) },
      };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const cliente = idDe(o.customer);
      if (!cliente) return null;
      const eliminada = evento.type === 'customer.subscription.deleted';
      const estado = eliminada ? 'cancelada' : estadoDesdeStripe(String(o.status));
      const plan = planDesdeIntervalo(o.items?.data?.[0]?.price?.recurring?.interval ?? o.plan?.interval);
      const fin = finPeriodoSuscripcion(o);
      return {
        empresaId: o.metadata?.empresa_id,
        clienteStripe: cliente,
        campos: {
          stripe_customer_id: cliente,
          stripe_subscription_id: o.id,
          estado_suscripcion: estado,
          cancelar_al_final: eliminada ? false : !!o.cancel_at_period_end,
          ...(plan ? { plan_facturacion: plan } : {}),
          ...(!eliminada && fin ? { periodo_fin: new Date(fin * 1000).toISOString() } : {}),
        },
        // Solo una suscripción al día prolonga el acceso.
        ...(estado === 'activa' && fin ? { extenderHasta: accesoHastaDesdeFinPeriodo(fin) } : {}),
      };
    }

    case 'invoice.paid': {
      const cliente = idDe(o.customer);
      const fines: number[] = (o.lines?.data ?? []).map((l: Obj) => l?.period?.end).filter((n: unknown) => typeof n === 'number');
      if (!cliente || fines.length === 0) return null;
      return {
        clienteStripe: cliente,
        campos: { estado_suscripcion: 'activa', periodo_fin: new Date(Math.max(...fines) * 1000).toISOString() },
        extenderHasta: accesoHastaDesdeFinPeriodo(Math.max(...fines)),
      };
    }

    case 'invoice.payment_failed': {
      const cliente = idDe(o.customer);
      if (!cliente) return null;
      return { clienteStripe: cliente, campos: { estado_suscripcion: 'impago' } };
    }

    default:
      return null;
  }
}
