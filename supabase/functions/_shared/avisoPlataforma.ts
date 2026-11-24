// Avisos internos para el dueño de la plataforma (no para los talleres): taller nuevo, suscripción,
// cancelación, baja y cobro fallido. Correo corto con los datos clave y un enlace.
//
// Nunca lanza: un aviso interno que falla no puede estropear un alta ni el cobro de un taller.
//
// Secret opcional: AVISOS_PLATAFORMA_EMAIL (destinatario). Usa RESEND_API_KEY y RESEND_FROM_EMAIL.
import { escaparHtml } from './correo.ts';

export const DESTINATARIO_POR_DEFECTO = 'daniel.sanchez@somosingenio.net';

export interface AvisoPlataforma {
  asunto: string;
  /** Frase de cabecera, en texto plano. */
  titulo: string;
  /** Pares etiqueta → valor, en texto plano (se escapan). Los valores vacíos se omiten. */
  datos: [string, string | null | undefined][];
  enlace?: { texto: string; url: string };
}

export function construirAvisoPlataforma(a: AvisoPlataforma): string {
  const filas = a.datos
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top;">${escaparHtml(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600;">${escaparHtml(String(v))}</td></tr>`)
    .join('');
  const enlace = a.enlace && /^https:\/\//.test(a.enlace.url)
    ? `<p style="margin:18px 0 0;"><a href="${escaparHtml(a.enlace.url)}" style="color:#2563eb;font-size:14px;font-weight:700;">${escaparHtml(a.enlace.texto)}</a></p>`
    : '';
  return `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px 16px;background-color:#f1f5f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
<tr><td style="padding:22px 26px;">
<p style="margin:0 0 4px;color:#94a3b8;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">Doonty Motor · aviso interno</p>
<p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;">${escaparHtml(a.titulo)}</p>
<table role="presentation" cellpadding="0" cellspacing="0">${filas}</table>${enlace}
</td></tr></table></body></html>`;
}

/** Envía el aviso. Devuelve true si Resend lo aceptó; nunca lanza. */
export async function enviarAvisoPlataforma(a: AvisoPlataforma): Promise<boolean> {
  try {
    const clave = Deno.env.get('RESEND_API_KEY') ?? '';
    if (!clave) return false;
    const desde = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev';
    const para = (Deno.env.get('AVISOS_PLATAFORMA_EMAIL') ?? '').trim() || DESTINATARIO_POR_DEFECTO;
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Doonty Motor <${desde}>`, to: [para], subject: a.asunto, html: construirAvisoPlataforma(a) }),
    });
    if (!resp.ok) {
      console.error('Aviso interno rechazado por Resend:', resp.status, await resp.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('No se pudo enviar el aviso interno:', e instanceof Error ? e.message : e);
    return false;
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** «23 dic 2026», hora de Madrid. */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number);
  return `${p[2]} ${MESES[p[1] - 1]} ${p[0]}`;
}

/** «69,90 €» a partir de céntimos. */
export function importeCentimos(c: unknown): string | null {
  return typeof c === 'number' && Number.isFinite(c) ? `${(c / 100).toFixed(2).replace('.', ',')} €` : null;
}
