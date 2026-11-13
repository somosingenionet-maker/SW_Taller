// Borrado automático de cuentas abandonadas: QUÉ hacer con cada cuenta. Puro (sin red ni base de
// datos) para poder probarlo a fondo: es lo único que decide si se borran datos de verdad.
//
// Reglas (ver la migración 20261113160000):
//   · La cuenta se borra 90 días después de que termine su acceso (`fin_conservacion`).
//   · Antes se avisa: un primer aviso cuando faltan 30 días o menos (con un margen mínimo de 14
//     días hasta el borrado) y un último aviso 7 días antes.
//   · NUNCA se borra sin que el último aviso se haya enviado con éxito y hayan pasado al menos 3
//     días desde él, ni sin que haya pasado la fecha prevista.
//   · Una cuenta con facturas emitidas o con la suscripción «activa» no se toca (retención).
//   · Sin ningún administrador con correo, no hay a quién avisar: no se avisa ni se borra.

export interface Cuenta {
  empresa_id: string;
  nombre: string;
  creada_en?: string | null;
  acceso_hasta: string;
  estado: string | null;
  fin_conservacion: string;
  retencion: string | null;
  aviso1_en: string | null;
  aviso2_en: string | null;
  borrado_previsto_en: string | null;
  correos_aviso: string[] | null;
  usuarios?: number;
  clientes?: number;
  vehiculos?: number;
  ordenes?: number;
  facturas_emitidas?: number;
}

export const DIAS_PRIMER_AVISO = 30;
export const DIAS_MARGEN_MINIMO = 14;
export const DIAS_ULTIMO_AVISO = 7;
export const DIAS_ESPERA_TRAS_ULTIMO_AVISO = 3;

const DIA = 86_400_000;
const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export type Accion =
  | { tipo: 'nada'; motivo: string }
  | { tipo: 'sin_destinatario' }
  | { tipo: 'aviso1'; borradoPrevisto: string }
  | { tipo: 'aviso2'; borradoPrevisto: string }
  | { tipo: 'reiniciar' }
  | { tipo: 'borrar' };

export function planificarCuenta(c: Cuenta, ahora: Date): Accion {
  const t = ahora.getTime();
  if (c.retencion) return { tipo: 'nada', motivo: `retenida (${c.retencion})` };

  const fin = ms(c.fin_conservacion);
  if (fin === null) return { tipo: 'nada', motivo: 'fecha de fin de conservación ilegible' };
  const hayCorreo = (c.correos_aviso ?? []).some((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const aviso1 = ms(c.aviso1_en);
  const aviso2 = ms(c.aviso2_en);
  const previsto = ms(c.borrado_previsto_en);

  // Si el acceso se amplió DESPUÉS del primer aviso (el taller volvió y luego caducó otra vez), los
  // avisos y la fecha prevista ya no valen: se borran y se empieza de cero, sin borrar nada hoy.
  // (Un aviso solo se envía cuando ya han pasado ≥60 días desde `acceso_hasta`, así que en el flujo
  // normal el aviso siempre es posterior a `acceso_hasta`.)
  const accesoHasta = ms(c.acceso_hasta);
  if (aviso1 !== null && (accesoHasta === null || accesoHasta > aviso1)) return { tipo: 'reiniciar' };

  // 1) Aún sin aviso.
  if (aviso1 === null) {
    if (fin - t > DIAS_PRIMER_AVISO * DIA) return { tipo: 'nada', motivo: 'todavía no toca avisar' };
    if (!hayCorreo) return { tipo: 'sin_destinatario' };
    // Si ya pasó la fecha (cuentas viejas), el aviso nunca da menos de 14 días de margen.
    const borrado = Math.max(fin, t + DIAS_MARGEN_MINIMO * DIA);
    return { tipo: 'aviso1', borradoPrevisto: new Date(borrado).toISOString() };
  }

  // 2) Avisada una vez; si el estado es raro (sin fecha prevista), se vuelve a fijar sin borrar.
  if (previsto === null) return { tipo: 'nada', motivo: 'aviso enviado pero sin fecha prevista: revisar a mano' };

  // 3) Falta el último aviso.
  if (aviso2 === null) {
    if (previsto - t > DIAS_ULTIMO_AVISO * DIA) return { tipo: 'nada', motivo: 'esperando al último aviso' };
    if (!hayCorreo) return { tipo: 'sin_destinatario' };
    return { tipo: 'aviso2', borradoPrevisto: new Date(previsto).toISOString() };
  }

  // 4) Con los dos avisos enviados: se borra pasada la fecha, y nunca antes de 3 días tras el último aviso.
  const noAntesDe = Math.max(previsto, aviso2 + DIAS_ESPERA_TRAS_ULTIMO_AVISO * DIA, fin);
  if (t >= noAntesDe) return { tipo: 'borrar' };
  return { tipo: 'nada', motivo: 'avisada: esperando a la fecha prevista' };
}

// ---- Correos de aviso ----

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «12 de febrero de 2027», en la hora de Madrid. */
export function fechaLarga(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).split('-').map(Number);
  return `${partes[2]} de ${MESES[partes[1] - 1]} de ${partes[0]}`;
}

export const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function construirAviso(
  cuenta: Pick<Cuenta, 'nombre' | 'acceso_hasta'>,
  tipo: 'primero' | 'ultimo',
  borradoPrevisto: string,
  urlApp = 'https://motor.doonty.com',
): { asunto: string; html: string } {
  const fecha = fechaLarga(borradoPrevisto);
  const desde = fechaLarga(cuenta.acceso_hasta);
  const taller = escaparHtml(cuenta.nombre);
  const asunto = tipo === 'ultimo'
    ? `Último aviso: tu cuenta de Doonty Motor se elimina el ${fecha}`
    : `Tu cuenta de Doonty Motor se eliminará el ${fecha}`;
  const intro = tipo === 'ultimo'
    ? `Este es el <strong>último aviso</strong>: la cuenta de «${taller}» en Doonty Motor se eliminará de forma definitiva el <strong>${fecha}</strong>.`
    : `La cuenta de «${taller}» en Doonty Motor está en modo solo lectura desde el ${desde}. Según nuestros Términos, los datos de una cuenta que no se retoma se eliminan de forma definitiva a los 90 días: la tuya se eliminará el <strong>${fecha}</strong>.`;
  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:22px 32px;color:#ffffff;font-size:18px;font-weight:800;">Doonty Motor</td></tr>
<tr><td style="padding:30px 32px 6px;">
${p(intro)}
${p('<strong>Esto no se puede deshacer.</strong> Se borrarán tus clientes, vehículos, órdenes de trabajo, fotos y usuarios.')}
${p('<strong>Qué puedes hacer:</strong>')}
<ul style="margin:0 0 14px;padding-left:20px;color:#334155;font-size:15px;line-height:1.7;">
<li><strong>Quedártela:</strong> entra en <a href="${urlApp}" style="color:#2563eb;">${urlApp.replace('https://', '')}</a> y suscríbete desde el botón «Suscripción». Recuperas todo tal cual estaba.</li>
<li><strong>Llevarte tus datos:</strong> sigues pudiendo entrar y exportar clientes, vehículos, inventario y facturas a CSV desde cada pantalla.</li>
</ul>
${p(tipo === 'ultimo' ? 'Si no haces nada, el día indicado se eliminará todo.' : 'Si no haces nada, el día indicado se eliminará todo. Te avisaremos otra vez una semana antes.')}
${p('¿Dudas, o necesitas más tiempo? Escríbenos a <a href="mailto:send@doonty.com" style="color:#2563eb;">send@doonty.com</a> antes de esa fecha.')}
</td></tr>
<tr><td style="padding:10px 32px 28px;"><div style="border-top:1px solid #f1f5f9;padding-top:16px;color:#94a3b8;font-size:12px;line-height:1.6;">Este es un aviso automático de Doonty Motor sobre tu cuenta.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto, html };
}
