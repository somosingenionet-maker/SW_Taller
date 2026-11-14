import { invocarFuncion } from './funciones';

/**
 * Envía el presupuesto al cliente: lo marca como enviado (desde ese momento lo puede aceptar o rechazar en su
 * portal) y, si se pide, le manda el correo con el enlace. Devuelve el enlace del portal del cliente.
 */
export async function enviarPresupuesto(otId: string, porCorreo: boolean): Promise<{ enlace: string; correo: boolean }> {
  const r = await invocarFuncion<{ enlace: string; correo: boolean }>('presupuesto-enviar', { otId, porCorreo });
  return { enlace: String(r.enlace), correo: r.correo === true };
}
