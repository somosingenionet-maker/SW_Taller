// Envío del presupuesto al cliente: correo con el enlace a su portal, donde lo acepta o lo rechaza. Puro y probado.
import { colorValido, escaparHtml, eur, textoSobre } from '../_shared/correo.ts';

/** ¿Se puede enviar ahora? Devuelve el motivo si no. */
/**
 * Estados en los que se puede mandar un presupuesto al cliente: antes de que el coche entre (Presupuesto) y también con el coche ya en el
 * taller (Recibido, En reparación), que es lo normal cuando llega directo a revisión y el diagnóstico sale después.
 */
export const ESTADOS_PRESUPUESTABLES = ['presupuesto', 'recibido', 'en_reparacion'];

export function motivoNoEnviable(
  ot: { estado: string; total: number; presupuesto_aprobado: boolean | null; aceptacion_presupuesto_en: string | null },
): string | null {
  if (ot.aceptacion_presupuesto_en) return 'El cliente ya aceptó este presupuesto.';
  if (!ESTADOS_PRESUPUESTABLES.includes(ot.estado)) return 'El presupuesto solo se envía mientras la orden está en Presupuesto, Recibido o En reparación.';
  if (!(Number(ot.total) > 0)) return 'El presupuesto no tiene importe: añade líneas antes de enviarlo.';
  if (ot.presupuesto_aprobado === true) return 'El cliente ya aprobó este presupuesto.';
  return null;
}

/** Lo que va detrás del texto de la línea: « · 1,5 h» en mano de obra (sus cantidades son horas), « × 2» en productos. */
export function sufijoCantidad(l: { tipo?: string | null; cantidad: number }): string {
  const n = Number(l.cantidad);
  const texto = (Math.round(n * 100) / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  if (l.tipo === 'mano_de_obra') return ` · ${texto} h`;
  return n !== 1 ? ` × ${texto}` : '';
}

export function construirCorreoPresupuesto(
  empresa: { nombre: string; brand_color?: string | null; logo_url?: string | null; correo?: string | null; telefono?: string | null },
  cliente: { nombre: string },
  vehiculo: string,
  numero: string,
  lineas: { descripcion: string; cantidad: number; subtotal: number; tipo?: string | null }[],
  total: number,
  enlace: string,
): { asunto: string; html: string } {
  const color = colorValido(empresa.brand_color);
  const nombreTaller = escaparHtml(empresa.nombre);
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;
  const contacto = escaparHtml([empresa.correo, empresa.telefono].filter(Boolean).join(' · '));
  const mostradas = lineas.slice(0, 8);
  const resto = lineas.length - mostradas.length;
  const filas = mostradas.map((l) =>
    `<tr><td style="padding:6px 0;border-top:1px solid #f1f5f9;color:#475569;font-size:13px;">${escaparHtml(l.descripcion)}${sufijoCantidad(l)}</td><td align="right" style="padding:6px 0;border-top:1px solid #f1f5f9;color:#334155;font-size:13px;font-weight:600;white-space:nowrap;">${eur(l.subtotal)} €</td></tr>`).join('');
  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${color};padding:22px 28px;color:${textoSobre(color)};font-size:17px;font-weight:700;">${logo ? `<img src="${logo}" alt="" height="32" style="height:32px;width:auto;vertical-align:middle;margin-right:10px;border-radius:6px;">` : ''}${nombreTaller}</td></tr>
<tr><td style="padding:28px 28px 6px;">
${p(`Hola ${escaparHtml(cliente.nombre)},`)}
${p(`Te enviamos el presupuesto <strong>${escaparHtml(numero)}</strong> para tu <strong>${escaparHtml(vehiculo)}</strong>.`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 6px;">${filas}${resto > 0 ? `<tr><td colspan="2" style="padding:6px 0;border-top:1px solid #f1f5f9;color:#94a3b8;font-size:12px;">…y ${resto} línea${resto === 1 ? '' : 's'} más</td></tr>` : ''}
<tr><td style="padding:10px 0 0;border-top:1px solid #cbd5e1;color:#0f172a;font-size:15px;font-weight:800;">Total (IVA incluido)</td><td align="right" style="padding:10px 0 0;border-top:1px solid #cbd5e1;color:#0f172a;font-size:15px;font-weight:800;white-space:nowrap;">${eur(total)} €</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 20px;"><tr><td style="background-color:${color};border-radius:10px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:13px 24px;color:${textoSobre(color)};font-size:15px;font-weight:700;text-decoration:none;">Ver y aceptar el presupuesto</a></td></tr></table>
${p(`Puedes <strong>aceptarlo o rechazarlo</strong> desde el enlace, sin descargar nada. Si prefieres, llámanos y lo vemos juntos.${contacto ? ` ${contacto}.` : ''}`)}
</td></tr>
<tr><td style="padding:8px 28px 24px;"><div style="border-top:1px solid #f1f5f9;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.6;">Recibes este correo porque ${nombreTaller} te ha enviado un presupuesto. Puedes responder a este mensaje.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto: `Presupuesto ${numero} de ${empresa.nombre} para tu ${vehiculo}`, html };
}
