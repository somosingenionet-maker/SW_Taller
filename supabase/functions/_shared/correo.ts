// Piezas comunes de los correos que el taller manda a sus clientes (informe de inspección, presupuesto…).
export const escaparHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const COLOR_POR_DEFECTO = '#2563eb';
export const colorValido = (c: unknown): string => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : COLOR_POR_DEFECTO);

/** Color de texto legible sobre el color de marca del taller. */
export function textoSobre(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}

/** Importe con coma decimal: «1234,50». */
export const eur = (n: number) => n.toFixed(2).replace('.', ',');

export interface EmpresaCorreo {
  nombre: string; brand_color?: string | null; logo_url?: string | null; correo?: string | null; telefono?: string | null;
}

/** Marco común de los correos del taller a sus clientes: cabecera con su color y logo, contenido y pie. */
export function envolverCorreo(empresa: EmpresaCorreo, contenidoHtml: string, pie: string): string {
  const color = colorValido(empresa.brand_color);
  const nombre = escaparHtml(empresa.nombre);
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${color};padding:22px 28px;color:${textoSobre(color)};font-size:17px;font-weight:700;">${logo ? `<img src="${logo}" alt="" height="32" style="height:32px;width:auto;vertical-align:middle;margin-right:10px;border-radius:6px;">` : ''}${nombre}</td></tr>
<tr><td style="padding:28px 28px 6px;">${contenidoHtml}</td></tr>
<tr><td style="padding:8px 28px 24px;"><div style="border-top:1px solid #f1f5f9;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.6;">${escaparHtml(pie)}</div></td></tr>
</table></td></tr></table></body></html>`;
}

export const parrafo = (html: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${html}</p>`;

export function botonCorreo(color: string | null | undefined, texto: string, enlace: string): string {
  const c = colorValido(color);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="background-color:${c};border-radius:10px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:13px 24px;color:${textoSobre(c)};font-size:15px;font-weight:700;text-decoration:none;">${escaparHtml(texto)}</a></td></tr></table>`;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «14 de noviembre de 2026», en la hora de Madrid. */
export function fechaLarga(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).split('-').map(Number);
  return `${p[2]} de ${MESES[p[1] - 1]} de ${p[0]}`;
}
