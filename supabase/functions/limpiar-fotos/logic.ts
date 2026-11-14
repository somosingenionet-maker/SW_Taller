// Conservación limitada de fotos: QUÉ borrar y a quién avisar. Puro (sin red ni base de datos) para poder
// probarlo a fondo: es lo único que decide si se borran archivos de verdad.
//
// Reglas (ver docs/diseno-inspeccion-digital.md, apartado 6 bis):
//   · Las fotos de una orden (recepción e inspección) se borran cuando pasa el plazo del taller desde la
//     entrega (o desde la última actividad en canceladas y presupuestos sin cerrar). Las órdenes con la
//     marca «conservar fotos» y las que siguen en curso no se tocan.
//   · Nunca se borra nada antes de `noAntesDe` (margen de 30 días tras activar la función): así todos los
//     talleres reciben el aviso antes de que desaparezca la primera foto.
//   · Se avisa por correo al administrador cuando faltan 30 días o menos, como mucho una vez por semana.
//   · Un archivo del almacenamiento que ninguna orden referencia (huérfano) se borra pasados 3 días.

export interface OrdenConFotos {
  orden_id: string;
  empresa_id: string;
  numero: string;
  inspeccion_id: string | null;
  borrar_en: string;
  fotos_recepcion: string[];
  fotos_inspeccion: string[];
}

export const DIAS_AVISO_PREVIO = 30;
export const DIAS_ENTRE_AVISOS = 7;
export const DIAS_MARGEN_HUERFANOS = 3;
export const MAX_ORDENES_POR_EJECUCION = 25;
export const MAX_HUERFANOS_POR_EJECUCION = 200;
/** Si hay más huérfanos que esto, algo falla (p. ej. la consulta de referencias): no se borra ninguno. */
export const MAX_HUERFANOS_SOSPECHOSO = 500;

const DIA = 86_400_000;
const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Cuándo se borrarán de verdad las fotos de la orden: nunca antes de `noAntesDe`. */
export function fechaEfectiva(borrarEn: string, noAntesDe: string | null): number | null {
  const b = ms(borrarEn);
  if (b === null) return null;
  const n = ms(noAntesDe);
  return n === null ? b : Math.max(b, n);
}

export function planificar(ordenes: OrdenConFotos[], ahora: Date, noAntesDe: string | null) {
  const t = ahora.getTime();
  const borrar: OrdenConFotos[] = [];
  const avisar: OrdenConFotos[] = [];
  for (const o of ordenes) {
    const f = fechaEfectiva(o.borrar_en, noAntesDe);
    if (f === null) continue;
    if (f <= t) borrar.push(o);
    else if (f - t <= DIAS_AVISO_PREVIO * DIA) avisar.push(o);
  }
  return { borrar: borrar.slice(0, MAX_ORDENES_POR_EJECUCION), pendientesDeBorrar: borrar.length, avisar };
}

/** ¿Toca mandarle el resumen semanal a esta empresa? */
export function avisoDebido(ultimoAviso: string | null, ahora: Date): boolean {
  const u = ms(ultimoAviso);
  return u === null || ahora.getTime() - u >= DIAS_ENTRE_AVISOS * DIA;
}

export function agruparPorEmpresa(ordenes: OrdenConFotos[]): Map<string, OrdenConFotos[]> {
  const m = new Map<string, OrdenConFotos[]>();
  for (const o of ordenes) m.set(o.empresa_id, [...(m.get(o.empresa_id) ?? []), o]);
  return m;
}

// ---- Rutas ----

/** Todas las rutas de Storage de una orden, por bucket. */
export function rutasDeOrden(o: OrdenConFotos, rutaDeUrlRecepcion: (u: string) => string | null) {
  return {
    recepcion: o.fotos_recepcion.map(rutaDeUrlRecepcion).filter((r): r is string => !!r),
    inspeccion: o.fotos_inspeccion,
  };
}

// ---- Huérfanos ----

export interface ArchivoAlmacen { ruta: string; creado: string | null }

export function huerfanos(archivos: ArchivoAlmacen[], referenciadas: Set<string>, ahora: Date) {
  const limite = ahora.getTime() - DIAS_MARGEN_HUERFANOS * DIA;
  const sueltos = archivos.filter((a) => {
    if (referenciadas.has(a.ruta)) return false;
    const c = ms(a.creado);
    return c !== null && c <= limite; // sin fecha legible o reciente: no se toca
  });
  if (sueltos.length > MAX_HUERFANOS_SOSPECHOSO) return { borrar: [] as ArchivoAlmacen[], sospechoso: true, total: sueltos.length };
  return { borrar: sueltos.slice(0, MAX_HUERFANOS_POR_EJECUCION), sospechoso: false, total: sueltos.length };
}

// ---- Correo de aviso ----

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(t: number): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)).split('-').map(Number);
  return `${p[2]} de ${MESES[p[1] - 1]} de ${p[0]}`;
}
const escaparHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function construirAvisoFotos(
  nombreTaller: string,
  ordenes: { numero: string; borrar_en: number }[],
  meses: number,
  urlApp = 'https://motor.doonty.com',
): { asunto: string; html: string } {
  const orden = [...ordenes].sort((a, b) => a.borrar_en - b.borrar_en);
  const primera = fechaLarga(orden[0].borrar_en);
  const mostradas = orden.slice(0, 10);
  const resto = orden.length - mostradas.length;
  const filas = mostradas.map((o) => `<li style="margin:0 0 4px;"><strong>${escaparHtml(o.numero)}</strong> — ${fechaLarga(o.borrar_en)}</li>`).join('');
  const asunto = `Se borrarán las fotos de ${orden.length} ${orden.length === 1 ? 'orden' : 'órdenes'} a partir del ${primera}`;
  const p = (t: string) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${t}</p>`;
  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;"><tr><td align="center" style="padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
<tr><td style="background-color:#0f172a;padding:22px 32px;color:#ffffff;font-size:18px;font-weight:800;">Doonty Motor</td></tr>
<tr><td style="padding:30px 32px 6px;">
${p(`Para cuidar la privacidad de tus clientes y no acumular archivos, <strong>${escaparHtml(nombreTaller)}</strong> conserva las fotos de recepción e inspección <strong>${meses} meses</strong> desde la entrega de cada orden. Después se borran solas; el texto, los estados y los precios se mantienen.`)}
${p('Estas órdenes están a punto de perder sus fotos:')}
<ul style="margin:0 0 14px;padding-left:20px;color:#334155;font-size:15px;line-height:1.6;">${filas}${resto > 0 ? `<li style="margin:0 0 4px;">…y ${resto} más</li>` : ''}</ul>
${p(`<strong>Qué puedes hacer:</strong> abre la orden en <a href="${urlApp}" style="color:#2563eb;">${urlApp.replace('https://', '')}</a>, guarda las fotos que necesites o pulsa «Conservar fotos» si hay una reclamación abierta. Puedes cambiar el plazo en Ajustes de empresa.`)}
${p('Si no haces nada, las fotos se borrarán en la fecha indicada y no se pueden recuperar.')}
</td></tr>
<tr><td style="padding:10px 32px 28px;"><div style="border-top:1px solid #f1f5f9;padding-top:16px;color:#94a3b8;font-size:12px;line-height:1.6;">Aviso automático de Doonty Motor. Como mucho una vez por semana.</div></td></tr>
</table></td></tr></table></body></html>`;
  return { asunto, html };
}
