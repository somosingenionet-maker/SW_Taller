// Correos de las citas (reserva online, confirmación, cancelación, recordatorio). Puros y probados.
// Los textos de fecha llegan ya escritos («martes, 17 de noviembre de 2026 a las 10:00»).
import { envolverCorreo, escaparHtml, parrafo, type EmpresaCorreo } from './correo.ts';

export type TipoCorreoCita =
  | 'cliente_confirmada'      // el cliente reservó y quedó confirmada
  | 'cliente_pendiente'       // el cliente reservó y espera la confirmación del taller
  | 'taller_nueva'            // aviso al taller de una reserva nueva
  | 'cliente_cancelada'       // el cliente canceló: acuse para él
  | 'taller_cancelada'        // el cliente canceló: aviso al taller
  | 'cliente_confirmada_taller' // el taller confirmó una cita pendiente
  | 'cliente_cancelada_taller'  // el taller canceló la cita
  | 'cliente_recordatorio';   // recordatorio del día anterior

export interface DatosCita {
  empresa: EmpresaCorreo;
  nombre: string;
  /** Texto largo de la fecha y hora. */
  cuando: string;
  tipo?: string | null;
  vehiculo?: string | null;
  motivo?: string | null;
  telefono?: string | null;
  correo?: string | null;
  duracionMin?: number | null;
  /** Enlace para ver o cancelar la cita (solo en los correos al cliente). */
  enlace?: string | null;
}

const fila = (et: string, valor: string) => `<tr><td style="padding:3px 12px 3px 0;color:#64748b;font-size:13px;vertical-align:top;">${escaparHtml(et)}</td><td style="padding:3px 0;color:#0f172a;font-size:14px;font-weight:600;">${valor}</td></tr>`;

function detalle(d: DatosCita): string {
  const f = [fila('Cuándo', escaparHtml(d.cuando))];
  if (d.tipo) f.push(fila('Servicio', escaparHtml(d.tipo)));
  if (d.duracionMin) f.push(fila('Duración', `${d.duracionMin} min`));
  if (d.vehiculo) f.push(fila('Vehículo', escaparHtml(d.vehiculo)));
  if (d.motivo) f.push(fila('Motivo', escaparHtml(d.motivo)));
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 14px;width:100%;">${f.join('')}</table>`;
}

export function construirCorreoCita(tipo: TipoCorreoCita, d: DatosCita): { asunto: string; html: string } {
  const taller = d.empresa.nombre;
  const contacto = [d.empresa.telefono, d.empresa.correo].filter(Boolean).map((x) => escaparHtml(String(x))).join(' · ');
  const saludo = parrafo(`Hola ${escaparHtml(d.nombre)},`);
  const pieCliente = `Mensaje de ${taller}. Puedes responder a este correo.`;
  const cancelar = d.enlace ? parrafo(`Si no puedes venir, <a href="${escaparHtml(d.enlace)}" style="color:#2563eb;">cancela o revisa tu cita aquí</a> para dejar el hueco a otra persona.`) : '';
  const llamar = contacto ? parrafo(`¿Dudas? ${contacto}.`) : '';

  let asunto: string; let cuerpo: string; let pie = pieCliente;
  switch (tipo) {
    case 'cliente_confirmada':
      asunto = `Cita confirmada en ${taller}: ${d.cuando}`;
      cuerpo = saludo + parrafo('Tu cita está <strong>confirmada</strong>. Te esperamos:') + detalle(d) + cancelar + llamar;
      break;
    case 'cliente_pendiente':
      asunto = `Hemos recibido tu solicitud de cita en ${taller}`;
      cuerpo = saludo + parrafo('Hemos recibido tu solicitud. El taller la revisará y te <strong>confirmará</strong> por correo en cuanto pueda.') + detalle(d) + cancelar + llamar;
      break;
    case 'cliente_confirmada_taller':
      asunto = `${taller} ha confirmado tu cita: ${d.cuando}`;
      cuerpo = saludo + parrafo('Tu cita está <strong>confirmada</strong>. Te esperamos:') + detalle(d) + cancelar + llamar;
      break;
    case 'cliente_cancelada_taller':
      asunto = `${taller} ha cancelado tu cita del ${d.cuando}`;
      cuerpo = saludo + parrafo('Lo sentimos: el taller ha tenido que <strong>cancelar</strong> esta cita.') + detalle(d) + parrafo('Puedes reservar otra cuando quieras o llamarnos para buscar un hueco.') + llamar;
      break;
    case 'cliente_cancelada':
      asunto = `Tu cita en ${taller} está cancelada`;
      cuerpo = saludo + parrafo('Hemos <strong>cancelado</strong> tu cita. Cuando quieras, puedes reservar otra.') + detalle(d);
      break;
    case 'cliente_recordatorio':
      asunto = `Recordatorio: mañana tienes cita en ${taller}`;
      cuerpo = saludo + parrafo('Te recordamos tu cita de <strong>mañana</strong>:') + detalle(d) + cancelar + llamar;
      pie = `Aviso automático de ${taller}, solo uno por cita. Si no quieres recibir más avisos, responde a este correo y dejaremos de enviártelos.`;
      break;
    case 'taller_nueva':
      asunto = `Nueva reserva online: ${d.nombre} · ${d.cuando}`;
      cuerpo = parrafo('Has recibido una <strong>reserva online</strong>:') + detalle(d)
        + parrafo(`<strong>${escaparHtml(d.nombre)}</strong>${d.telefono ? ` · ${escaparHtml(d.telefono)}` : ''}${d.correo ? ` · ${escaparHtml(d.correo)}` : ''}`)
        + parrafo('La encontrarás en la Agenda con la etiqueta «Online».');
      pie = 'Aviso automático de Doonty Motor.';
      break;
    case 'taller_cancelada':
      asunto = `Cita cancelada por el cliente: ${d.nombre} · ${d.cuando}`;
      cuerpo = parrafo('El cliente ha <strong>cancelado</strong> su cita:') + detalle(d) + parrafo(`<strong>${escaparHtml(d.nombre)}</strong>${d.telefono ? ` · ${escaparHtml(d.telefono)}` : ''}`) + parrafo('El hueco vuelve a estar libre.');
      pie = 'Aviso automático de Doonty Motor.';
      break;
  }
  return { asunto, html: envolverCorreo(d.empresa, cuerpo, pie) };
}
