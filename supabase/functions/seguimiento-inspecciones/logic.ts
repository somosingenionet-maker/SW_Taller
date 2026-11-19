// Seguimiento automático de inspecciones: los dos correos al cliente. Puro y probado.
import { colorValido, escaparHtml, fechaLarga, textoSobre } from '../_shared/correo.ts';

export { fechaLarga };

export type TipoSeguimiento = 'sin_responder' | 'pendientes';

export interface PuntoPendiente { nombre: string; categoria: string; estado: 'urgente' | 'atencion'; nota: string | null }

/** Lo que llega de la base de datos como lista de puntos pendientes: se limpia y se limita. */
export function puntosPendientesDe(valor: unknown): PuntoPendiente[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => typeof p.nombre === 'string' && (p.estado === 'urgente' || p.estado === 'atencion'))
    .map((p) => ({
      nombre: String(p.nombre), categoria: typeof p.categoria === 'string' ? p.categoria : '',
      estado: p.estado as 'urgente' | 'atencion', nota: typeof p.nota === 'string' && p.nota.trim() ? p.nota.trim() : null,
    }))
    // Primero lo urgente.
    .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'urgente' ? -1 : 1));
}

export function construirCorreoSeguimiento(
  tipo: TipoSeguimiento,
  empresa: { nombre: string; brand_color?: string | null; logo_url?: string | null; correo?: string | null; telefono?: string | null },
  cliente: { nombre: string },
  vehiculo: string,
  puntos: PuntoPendiente[],
  enlace: string | null,
  fechaInforme: string,
): { asunto: string; html: string } {
  const color = colorValido(empresa.brand_color);
  const nombreTaller = escaparHtml(empresa.nombre);
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;
  const contacto = escaparHtml([empresa.correo, empresa.telefono].filter(Boolean).join(' · '));
  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const veh = escaparHtml(vehiculo);
  const fecha = escaparHtml(fechaLarga(fechaInforme));

  let cuerpo: string;
  let asunto: string;
  if (tipo === 'sin_responder' && enlace) {
    asunto = `Tu informe de inspección está pendiente — ${vehiculo}`;
    cuerpo = p(`El ${fecha} revisamos tu <strong>${veh}</strong> y te enviamos el informe, con fotos y precios. Todavía no lo has abierto o no has respondido.`)
      + `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;"><tr><td style="background-color:${color};border-radius:10px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;padding:13px 24px;color:${textoSobre(color)};font-size:15px;font-weight:700;text-decoration:none;">Ver el informe</a></td></tr></table>`
      + p(`Si prefieres, llámanos y lo vemos juntos.${contacto ? ` ${contacto}.` : ''}`);
  } else {
    const mostrados = puntos.slice(0, 8);
    const resto = puntos.length - mostrados.length;
    const nombreUno = mostrados[0]?.nombre ?? 'revisión';
    asunto = `Pendiente en tu ${vehiculo}: ${nombreUno.toLowerCase()}${puntos.length > 1 ? ` y ${puntos.length - 1} más` : ''}`;
    const filas = mostrados.map((x) => {
      const borde = x.estado === 'urgente' ? '#e11d48' : '#f59e0b';
      return `<div style="border-left:3px solid ${borde};padding:2px 12px;margin:0 0 8px;font-size:14px;color:#334155;"><strong>${escaparHtml(x.nombre)}</strong> <span style="color:#64748b;">· ${x.estado === 'urgente' ? 'urgente' : 'atención'}</span>${x.nota ? `<br><span style="color:#64748b;font-size:13px;">${escaparHtml(x.nota)}</span>` : ''}</div>`;
    }).join('');
    cuerpo = p(`El ${fecha} revisamos tu <strong>${veh}</strong> y quedaron estas cosas pendientes:`)
      + `<div style="margin:0 0 6px;">${filas}${resto > 0 ? `<p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">…y ${resto} más.</p>` : ''}</div>`
      + p(`Si quieres que lo veamos, llámanos o responde a este correo.${contacto ? ` ${contacto}.` : ''}`);
  }

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:${color};padding:22px 28px;color:${textoSobre(color)};font-size:17px;font-weight:700;">${logo ? `<img src="${logo}" alt="" height="32" style="height:32px;width:auto;vertical-align:middle;margin-right:10px;border-radius:6px;">` : ''}${nombreTaller}</td></tr>
<tr><td style="padding:28px 28px 6px;">${p(`Hola ${escaparHtml(cliente.nombre)},`)}${cuerpo}</td></tr>
<tr><td style="padding:8px 28px 24px;"><div style="border-top:1px solid #f1f5f9;padding-top:14px;color:#94a3b8;font-size:12px;line-height:1.6;">Aviso automático de ${nombreTaller}, solo uno por informe. Si no quieres recibir más avisos, responde a este correo y dejaremos de enviártelos.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto, html };
}
