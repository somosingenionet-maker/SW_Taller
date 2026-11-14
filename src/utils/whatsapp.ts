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
