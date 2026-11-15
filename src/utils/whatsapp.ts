import { telefonoWhatsApp } from './telefono';

/** Enlace que abre WhatsApp con el mensaje ya escrito (lo envía la persona). null sin teléfono: evita un enlace roto. */
export function waHref(telefono: string | undefined | null, mensaje: string): string | null {
  const numero = telefonoWhatsApp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}

/** Mensaje para mandar el informe de inspección al cliente. */
export function mensajeInforme(cliente: string, vehiculo: string, taller: string, enlace: string): string {
  return `Hola ${cliente}, ya tienes el informe de la revisión de tu ${vehiculo} en ${taller}, con fotos y precios. Puedes verlo y responder desde el móvil aquí: ${enlace}`;
}

/** Mensaje para mandar el presupuesto al cliente. */
export function mensajePresupuesto(cliente: string, vehiculo: string, taller: string, numero: string, enlace: string): string {
  return `Hola ${cliente}, te enviamos el presupuesto ${numero} de ${taller} para tu ${vehiculo}. Puedes verlo y aceptarlo o rechazarlo desde el móvil aquí: ${enlace}`;
}

export type ResultadoApertura = 'abierto' | 'bloqueado' | 'sin_enlace';

/**
 * Abre WhatsApp en una pestaña nueva. La pestaña se abre en el mismo instante del clic (si se abriera después de
 * esperar al servidor, el navegador la bloquearía como ventana emergente) y se rellena cuando el enlace está listo.
 */
export async function abrirEnPestana(obtenerUrl: () => Promise<string | null>): Promise<ResultadoApertura> {
  const ventana = window.open('', '_blank');
  try {
    const url = await obtenerUrl();
    if (!url) { ventana?.close(); return 'sin_enlace'; }
    if (!ventana) return 'bloqueado';
    ventana.opener = null;
    ventana.location.href = url;
    return 'abierto';
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

/** «lunes, 16 de noviembre a las 10:00» en hora de Madrid, a partir de un instante. */
export function cuandoLargo(iso: string | number | Date): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(d);
  const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Madrid' }).format(d);
  return `${dia} a las ${hora}`;
}

/** Mensaje del taller al cliente sobre su cita (la confirmación o la solicitud recibida). `enlace`: para cambiarla o cancelarla. */
export function mensajeCita(cliente: string, taller: string, cuando: string, estado: 'pendiente' | 'confirmada', enlace?: string | null): string {
  const base = estado === 'confirmada'
    ? `Hola${cliente ? ' ' + cliente : ''}, te confirmamos tu cita en ${taller}: ${cuando}.`
    : `Hola${cliente ? ' ' + cliente : ''}, hemos recibido tu solicitud de cita en ${taller} para el ${cuando}. En cuanto la revisemos te la confirmamos.`;
  return enlace ? `${base} Si necesitas cambiarla o cancelarla, puedes hacerlo desde aquí: ${enlace}` : base;
}

/** Mensaje del cliente al taller sobre su cita, desde las páginas públicas. */
export function mensajeCitaAlTaller(cliente: string | null | undefined, taller: string, cuando: string): string {
  return `Hola${cliente ? `, soy ${cliente}` : ''}. Te escribo por mi cita en ${taller}: ${cuando}.`;
}
