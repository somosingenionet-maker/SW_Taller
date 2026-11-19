// Recordatorio automático de presupuestos sin respuesta: el correo al cliente. Puro y probado.
import { colorValido, escaparHtml, eur, fechaLarga, textoSobre } from '../_shared/correo.ts';

/** Cuántos recordatorios se mandan como máximo por cada envío del presupuesto. */
export const MAX_RECORDATORIOS = 2;

export function construirCorreoRecordatorioPresupuesto(
  aviso: 1 | 2,
  empresa: { nombre: string; brand_color?: string | null; logo_url?: string | null; correo?: string | null; telefono?: string | null },
  cliente: { nombre: string },
  vehiculo: string,
  numero: string,
  total: number,
  enlace: string,
  fechaEnvio: string,
): { asunto: string; html: string } {
  const color = colorValido(empresa.brand_color);
  const nombreTaller = escaparHtml(empresa.nombre);
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;
  const contacto = escaparHtml([empresa.correo, empresa.telefono].filter(Boolean).join(' · '));
  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const veh = escaparHtml(vehiculo);
  const num = escaparHtml(numero);
  const fecha = escaparHtml(fechaLarga(fechaEnvio));

  const asunto = aviso === 1
    ? `Tu presupuesto ${numero} está pendiente de respuesta — ${vehiculo}`
    : `Último aviso: presupuesto ${numero} de ${empresa.nombre}`;
  const cuerpo = aviso === 1
    ? p(`El ${fecha} te enviamos el presupuesto <strong>${num}</strong> para tu <strong>${veh}</strong>, por <strong>${eur(total)} €</strong> (IVA incluido). Todavía no nos has respondido.`)
      + p('Puedes <strong>aceptarlo o rechazarlo</strong> desde el enlace, sin descargar nada.')
    : p(`Te escribimos por última vez sobre el presupuesto <strong>${num}</strong> de tu <strong>${veh}</strong> (${eur(total)} €), que te enviamos el ${fecha}.`)
      + p('Si lo quieres, acéptalo desde el enlace. Si ya no lo necesitas, <strong>recházalo</strong> y lo cerramos.');
  const boton = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="background-color:${color};border-radius:10px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:13px 24px;color:${textoSobre(color)};font-size:15px;font-weight:700;text-decoration:none;">Ver y responder al presupuesto</a></td></tr></table>`;
  const cierre = p(`Si prefieres, llámanos y lo vemos juntos.${contacto ? ` ${contacto}.` : ''}`);

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${color};padding:22px 28px;color:${textoSobre(color)};font-size:17px;font-weight:700;">${logo ? `<img src="${logo}" alt="" height="32" style="height:32px;width:auto;vertical-align:middle;margin-right:10px;border-radius:6px;">` : ''}${nombreTaller}</td></tr>
<tr><td style="padding:28px 28px 6px;">${p(`Hola ${escaparHtml(cliente.nombre)},`)}${cuerpo}${boton}${cierre}</td></tr>
<tr><td style="padding:8px 28px 24px;"><div style="border-top:1px solid #f1f5f9;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.6;">Aviso automático de ${nombreTaller}, como mucho dos por presupuesto. Si no quieres recibir más avisos, responde a este correo y dejaremos de enviártelos.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto, html };
}
