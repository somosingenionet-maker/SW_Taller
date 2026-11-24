// Correos de Doonty Motor al taller cuando cambia su suscripción: activada, cancelación programada y
// terminada. Puro (sin red ni BD) para poder probarlo con eventos reales de Stripe.
//
// Cada evento de Stripe se procesa una sola vez (tabla `stripe_eventos`), así que cada correo sale
// una vez por evento. Un fallo al enviar NO hace fallar el webhook: si no, Stripe reintentaría el
// evento entero y volvería a tocar la suscripción.
import { escaparHtml, fechaLarga } from '../_shared/correo.ts';
import { cancelacionProgramada } from './logic.ts';
import { type AvisoPlataforma, fechaCorta, importeCentimos } from '../_shared/avisoPlataforma.ts';

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

export type TipoCorreoSuscripcion = 'activada' | 'cancelacion' | 'terminada';

export interface CorreoPendiente {
  tipo: TipoCorreoSuscripcion;
  /** Empresa si el evento la trae en los metadatos; si no, se busca por el cliente de Stripe. */
  empresaId?: string;
  clienteStripe?: string;
  plan?: 'mensual' | 'anual';
  /** Fin del periodo pagado (ISO): próxima renovación, o último día si se ha cancelado. */
  finPeriodo?: string;
}

const idDe = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof (v as Obj)?.id === 'string' ? (v as Obj).id : undefined;

function finPeriodo(sub: Obj): string | undefined {
  const n = sub.cancel_at ?? sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  return typeof n === 'number' ? new Date(n * 1000).toISOString() : undefined;
}

function planDe(sub: Obj): 'mensual' | 'anual' | undefined {
  const i = sub.items?.data?.[0]?.price?.recurring?.interval ?? sub.plan?.interval;
  return i === 'month' ? 'mensual' : i === 'year' ? 'anual' : undefined;
}

/**
 * ¿Toca avisar al taller con este evento?
 *  - `customer.subscription.created` ya activa (o en prueba) → «activada». Una suscripción que nace
 *    `incomplete` (pago pendiente) no avisa: avisará el `updated` cuando pase a activa.
 *  - `customer.subscription.updated` que pasa de incompleta a activa → «activada».
 *  - `customer.subscription.updated` que PROGRAMA la cancelación (antes no la tenía) → «cancelación».
 *    Solo cuando cambia: cualquier otra actualización de una suscripción ya cancelada no repite.
 *  - `customer.subscription.deleted` → «terminada».
 */
export function correoDelEvento(evento: Obj): CorreoPendiente | null {
  const o: Obj = evento?.data?.object ?? {};
  const antes: Obj = evento?.data?.previous_attributes ?? {};
  const base = { empresaId: o.metadata?.empresa_id, clienteStripe: idDe(o.customer), plan: planDe(o), finPeriodo: finPeriodo(o) };
  const viva = o.status === 'active' || o.status === 'trialing';

  switch (evento?.type) {
    case 'customer.subscription.created':
      return viva ? { tipo: 'activada', ...base } : null;

    case 'customer.subscription.updated': {
      if (viva && typeof antes.status === 'string' && (antes.status === 'incomplete' || antes.status === 'incomplete_expired')) {
        return { tipo: 'activada', ...base };
      }
      const cambioCancelacion = 'cancel_at_period_end' in antes || 'cancel_at' in antes;
      const estabaProgramada = antes.cancel_at_period_end === true || typeof antes.cancel_at === 'number';
      if (cambioCancelacion && !estabaProgramada && cancelacionProgramada(o)) return { tipo: 'cancelacion', ...base };
      return null;
    }

    case 'customer.subscription.deleted':
      return { tipo: 'terminada', ...base };

    default:
      return null;
  }
}

const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
const enlace = (url: string, texto: string) => `<a href="${escaparHtml(url)}" style="color:#2563eb;">${escaparHtml(texto)}</a>`;

function boton(url: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="background-color:#2563eb;border-radius:10px;"><a href="${escaparHtml(url)}" style="display:inline-block;padding:13px 24px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">${escaparHtml(texto)}</a></td></tr></table>`;
}

function marco(contenido: string, pie: string): string {
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:24px 32px;"><img src="https://motor.doonty.com/email-logo.png" width="180" height="31" alt="Doonty Motor" style="display:block;border:0;outline:none;width:180px;height:auto;font-size:17px;font-weight:700;color:#ffffff;"></td></tr>
<tr><td style="padding:30px 32px 6px;">${contenido}</td></tr>
<tr><td style="padding:10px 32px 28px;"><div style="border-top:1px solid #f1f5f9;padding-top:16px;color:#94a3b8;font-size:12px;line-height:1.6;">${pie}</div></td></tr>
</table></td></tr></table></body></html>`;
}

const PIE = `Este es un aviso automático de Doonty Motor sobre la suscripción de tu taller.<br>¿Necesitas ayuda? Escríbenos a ${enlace('mailto:send@doonty.com', 'send@doonty.com')}.`;
const RUTA_GESTION = '<strong>Suscripción → «Gestionar suscripción y facturas»</strong>';

/** Asunto y HTML del correo. `taller` es el nombre del taller tal cual está en la base de datos. */
export function construirCorreoSuscripcion(
  c: Pick<CorreoPendiente, 'tipo' | 'plan' | 'finPeriodo'>,
  taller: string,
  urlApp = 'https://motor.doonty.com',
): { asunto: string; html: string } {
  const nombre = escaparHtml(taller);
  const fecha = c.finPeriodo ? fechaLarga(c.finPeriodo) : null;
  const titulo = (t: string) => `<h1 style="margin:0 0 16px;color:#0f172a;font-size:22px;line-height:1.3;font-weight:800;">${t}</h1>`;

  if (c.tipo === 'activada') {
    const plan = c.plan === 'anual' ? 'anual' : c.plan === 'mensual' ? 'mensual' : null;
    return {
      asunto: 'Tu suscripción a Doonty Motor está activa',
      html: marco([
        titulo('Gracias por suscribirte'),
        p(`La suscripción de «${nombre}» a Doonty Motor ya está activa${plan ? ` con el <strong>plan ${plan}</strong>` : ''}. Tu equipo puede seguir trabajando sin límites de usuarios ni de órdenes.`),
        fecha ? p(`<strong>Próxima renovación:</strong> ${fecha}. Se cobra automáticamente con la tarjeta que has usado.`) : '',
        p(`Puedes ver tus justificantes de pago, cambiar la tarjeta o cancelar cuando quieras desde ${RUTA_GESTION}.`),
        boton(urlApp, 'Entrar en Doonty Motor'),
      ].join('\n'), PIE),
    };
  }

  if (c.tipo === 'cancelacion') {
    return {
      asunto: 'Hemos recibido la cancelación de tu suscripción',
      html: marco([
        titulo('Cancelación recibida'),
        p(`La suscripción de «${nombre}» a Doonty Motor ${fecha ? `terminará el <strong>${fecha}</strong>` : 'terminará al final del periodo que ya has pagado'}. Hasta entonces todo sigue funcionando con normalidad y <strong>no se te cobrará nada más</strong>.`),
        p(`<strong>¿Cambias de opinión?</strong> Puedes reactivarla antes de esa fecha desde ${RUTA_GESTION}, sin perder nada.`),
        p('Cuando termine, la cuenta pasará a <strong>solo lectura</strong>: podrás seguir entrando para ver y exportar tus clientes, vehículos y facturas. Conservamos tus datos al menos 90 días y te avisaremos por correo antes de eliminarlos.'),
        p(`Si nos cuentas por qué te vas, nos ayudas a mejorar: basta con responder a ${enlace('mailto:send@doonty.com', 'send@doonty.com')}.`),
      ].join('\n'), PIE),
    };
  }

  return {
    asunto: 'Tu suscripción a Doonty Motor ha terminado',
    html: marco([
      titulo('Tu suscripción ha terminado'),
      p(`La suscripción de «${nombre}» a Doonty Motor ha terminado y ya no se te cobrará nada más.`),
      p('Cuando termine el periodo que ya tenías pagado, la cuenta pasará a <strong>solo lectura</strong>: podrás seguir entrando para ver y exportar tus clientes, vehículos y facturas, pero no crear ni modificar nada.'),
      p('Conservamos tus datos al menos 90 días y te avisaremos por correo antes de eliminarlos. Si vuelves a suscribirte antes, lo recuperas todo tal cual estaba y no pagas otra vez la cuota de alta.'),
      boton(urlApp, 'Volver a suscribirme'),
    ].join('\n'), PIE),
  };
}

/**
 * Aviso interno para el dueño de la plataforma con este evento, o null. Mismos momentos que los
 * correos al taller (activada, cancelación, terminada) más el cobro fallido (`invoice.payment_failed`),
 * que al taller ya se lo comunica Stripe.
 */
export function avisoInternoDelEvento(evento: Obj, taller: string): AvisoPlataforma | null {
  const o: Obj = evento?.data?.object ?? {};
  const correo = correoDelEvento(evento);
  const enStripe = (ruta: string) => `https://dashboard.stripe.com/${ruta}`;

  if (correo?.tipo === 'activada') {
    const precio = o.items?.data?.[0]?.price;
    const intervalo = precio?.recurring?.interval === 'year' ? 'año' : precio?.recurring?.interval === 'month' ? 'mes' : null;
    const importe = importeCentimos(precio?.unit_amount);
    return {
      asunto: `Nueva suscripción: ${taller}`,
      titulo: 'Un taller se ha suscrito',
      datos: [['Taller', taller], ['Plan', correo.plan ?? null], ['Precio', importe && intervalo ? `${importe}/${intervalo} + IVA` : importe],
        ['Próxima renovación', fechaCorta(correo.finPeriodo)]],
      enlace: o.id ? { texto: 'Ver la suscripción en Stripe', url: enStripe(`subscriptions/${o.id}`) } : undefined,
    };
  }
  if (correo?.tipo === 'cancelacion') {
    return {
      asunto: `Cancelación programada: ${taller}`,
      titulo: 'Un taller ha cancelado su suscripción',
      datos: [['Taller', taller], ['Termina el', fechaCorta(correo.finPeriodo)], ['Motivo indicado', o.cancellation_details?.feedback ?? o.cancellation_details?.comment ?? null]],
      enlace: o.id ? { texto: 'Ver la suscripción en Stripe', url: enStripe(`subscriptions/${o.id}`) } : undefined,
    };
  }
  if (correo?.tipo === 'terminada') {
    return {
      asunto: `Suscripción terminada: ${taller}`,
      titulo: 'La suscripción de un taller ha terminado',
      datos: [['Taller', taller], ['Plan', correo.plan ?? null]],
      enlace: o.id ? { texto: 'Ver la suscripción en Stripe', url: enStripe(`subscriptions/${o.id}`) } : undefined,
    };
  }
  if (evento?.type === 'invoice.payment_failed') {
    const proximo = typeof o.next_payment_attempt === 'number' ? new Date(o.next_payment_attempt * 1000).toISOString() : null;
    return {
      asunto: `Cobro fallido: ${taller}`,
      titulo: 'No se ha podido cobrar a un taller',
      datos: [['Taller', taller], ['Importe', importeCentimos(o.amount_due)], ['Intento', typeof o.attempt_count === 'number' ? String(o.attempt_count) : null],
        ['Próximo reintento', fechaCorta(proximo) ?? 'Stripe no volverá a intentarlo']],
      enlace: o.id ? { texto: 'Ver la factura en Stripe', url: enStripe(`invoices/${o.id}`) } : undefined,
    };
  }
  return null;
}
