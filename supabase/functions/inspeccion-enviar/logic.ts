// Envío del informe de inspección al cliente: correo con el enlace a su portal. Puro y probado.
import { faltanPrecios, type PuntoResumen, resumenPuntos } from '../_shared/inspeccion.ts';

export const escaparHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** ¿Se puede enviar? Solo una inspección terminada y con precio en todo lo urgente. Devuelve el motivo si no. */
export function motivoNoEnviable(estado: string, puntos: PuntoResumen[]): string | null {
  if (estado === 'enviada' || estado === 'respondida') return 'Esta inspección ya se envió al cliente.';
  if (estado !== 'terminada') return 'El mecánico aún no ha terminado la inspección.';
  const r = resumenPuntos(puntos);
  if (r.urgente + r.atencion + r.bien === 0) return 'La inspección no tiene ningún punto marcado.';
  const f = faltanPrecios(puntos);
  if (f > 0) return `Falta el precio de ${f} punto${f === 1 ? '' : 's'} urgente${f === 1 ? '' : 's'}. Ponlo antes de enviar.`;
  return null;
}

const COLOR_POR_DEFECTO = '#2563eb';
const colorValido = (c: unknown) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : COLOR_POR_DEFECTO);

function textoSobre(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

export function construirCorreoInforme(
  empresa: { nombre: string; brand_color?: string | null; logo_url?: string | null; correo?: string | null; telefono?: string | null },
  cliente: { nombre: string },
  vehiculo: string,
  resumen: { urgente: number; atencion: number; bien: number },
  enlace: string,
): { asunto: string; html: string } {
  const color = colorValido(empresa.brand_color);
  const nombreTaller = escaparHtml(empresa.nombre);
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;
  const contacto = escaparHtml([empresa.correo, empresa.telefono].filter(Boolean).join(' · '));

  const partes: string[] = [];
  if (resumen.urgente) partes.push(`${resumen.urgente} punto${resumen.urgente === 1 ? '' : 's'} urgente${resumen.urgente === 1 ? '' : 's'}`);
  if (resumen.atencion) partes.push(`${resumen.atencion} que requiere${resumen.atencion === 1 ? '' : 'n'} atención`);
  const titular = partes.length ? `Hemos encontrado ${partes.join(' y ')}.` : 'Todo está en buen estado.';

  const asunto = resumen.urgente
    ? `Inspección de tu ${vehiculo}: hay ${resumen.urgente === 1 ? 'un punto urgente' : `${resumen.urgente} puntos urgentes`}`
    : `Inspección de tu ${vehiculo}`;

  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${color};padding:22px 28px;color:${textoSobre(color)};font-size:17px;font-weight:700;">${logo ? `<img src="${logo}" alt="" height="32" style="height:32px;width:auto;vertical-align:middle;margin-right:10px;border-radius:6px;">` : ''}${nombreTaller}</td></tr>
<tr><td style="padding:28px 28px 6px;">
${p(`Hola ${escaparHtml(cliente.nombre)},`)}
${p(`Hemos revisado tu <strong>${escaparHtml(vehiculo)}</strong> y tienes el informe listo, con fotos y precios. ${escaparHtml(titular)}`)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="background-color:${color};border-radius:10px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:13px 24px;color:${textoSobre(color)};font-size:15px;font-weight:700;text-decoration:none;">Ver el informe</a></td></tr></table>
${resumen.urgente ? p('Desde el mismo informe puedes <strong>aprobar o rechazar</strong> las reparaciones propuestas.') : ''}
${p(`Si prefieres, llámanos y lo vemos juntos.${contacto ? ` ${contacto}.` : ''}`)}
</td></tr>
<tr><td style="padding:8px 28px 24px;"><div style="border-top:1px solid #f1f5f9;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.6;">Recibes este correo porque ${nombreTaller} ha revisado tu vehículo. Puedes responder a este mensaje.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto, html };
}
