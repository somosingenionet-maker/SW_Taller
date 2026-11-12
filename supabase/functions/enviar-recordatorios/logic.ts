// Lógica pura de enviar-recordatorios (construcción del email y la ventana
// de aviso), separada de index.ts para poder testearla con `deno test` sin
// arrancar el servidor HTTP ni llamar a Resend/Supabase.

export type TipoAlerta = 'itv' | 'seguro' | 'impuesto' | 'aceite';
export type TipoEvento = 'itv_proxima' | 'vencimiento_seguro' | 'impuesto_proximo' | 'cambio_aceite' | 'aceite_vencido' | 'aceite_resumen';

/** Qué correo se envía de una alerta: el recordatorio previo o, solo en aceite, el último aviso ya vencida. */
export type Aviso = 'recordatorio' | 'vencido';

export const TIPO_EVENTO: Record<TipoAlerta, TipoEvento> = {
  itv: 'itv_proxima',
  seguro: 'vencimiento_seguro',
  impuesto: 'impuesto_proximo',
  aceite: 'cambio_aceite',
};

export const ASUNTO: Record<TipoAlerta, string> = {
  itv: 'Recordatorio: ITV próxima a vencer',
  seguro: 'Recordatorio: su seguro está próximo a vencer',
  impuesto: 'Recordatorio: impuesto de circulación próximo a vencer',
  aceite: 'Recordatorio: se acerca el cambio de aceite',
};
export const ASUNTO_ACEITE_VENCIDO = 'Tu cambio de aceite está pendiente';
export const ASUNTO_ACEITE_RESUMEN = 'Resumen de tu cambio de aceite';

export const ICONO_TIPO: Record<TipoAlerta, string> = {
  itv: '📋',
  seguro: '🛡️',
  impuesto: '🚗',
  aceite: '🛢️',
};

export const ETIQUETA_TIPO: Record<TipoAlerta, string> = {
  itv: 'ITV',
  seguro: 'Seguro',
  impuesto: 'Impuesto de circulación',
  aceite: 'Cambio de aceite',
};

export const BRAND_COLOR_DEFAULT = '#2563eb';

// Ventanas de aviso: cuántos días/km antes del vencimiento se manda el
// recordatorio del lote automático.
export const DIAS_AVISO_VENCIMIENTO = 14;
/** Aceite: se avisa también cuando al coche le faltan estos km (o menos) para el cambio. */
export const KM_AVISO_ACEITE = 500;
/** Aceite: el «último aviso» sale cuando han pasado estos días de la fecha sin que el coche vuelva… */
export const DIAS_ULTIMO_AVISO = 7;
/** …y deja de tener sentido pasado este tiempo (el dato ya es viejo: no se molesta al cliente). */
export const DIAS_TOPE_ULTIMO_AVISO = 60;
/** El resumen del cambio se envía como mucho estos días después de entregar la orden. */
export const DIAS_RESUMEN_ENTREGA = 3;

// Textos por defecto — duplicado en src/utils/recordatorioTemplates.ts
// (Deno no puede importar código del frontend). Mantener ambos en sincronía.
export const PLANTILLA_DEFAULT: Record<TipoAlerta, string> = {
  itv: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que la ITV de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
  seguro: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el seguro de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros si necesitas ayuda con la renovación.',
  impuesto: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el impuesto de circulación de tu vehículo {{vehiculo}} vence el {{fecha}}.',
  aceite: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que a tu vehículo {{vehiculo}} le toca el cambio de aceite {{cuando}}.\n\nContacta con nosotros para reservar tu cita cuando te venga bien.',
};

// Textos fijos (no personalizables por ahora) de los otros dos correos del cambio de aceite.
export const PLANTILLA_ACEITE_VENCIDO =
  'Hola {{cliente}},\n\nSegún nuestros datos, a tu vehículo {{vehiculo}} le tocaba el cambio de aceite {{cuando}} y todavía no lo hemos hecho.\n\nSi ya lo cambiaste en otro sitio, no tienes que hacer nada. Si quieres que nos ocupemos, escríbenos o llámanos y te damos cita.';
export const PLANTILLA_ACEITE_RESUMEN =
  'Hola {{cliente}},\n\nGracias por confiar en {{empresa}}. Este es el resumen del cambio de aceite de tu vehículo {{vehiculo}}.';

/** Duplicado de src/utils/color.ts — Deno no puede importar código del frontend. */
export function contrastText(hex: string): string {
  try {
    const c = hex.replace('#', '');
    const r = parseInt(c.slice(0, 2), 16) / 255;
    const g = parseInt(c.slice(2, 4), 16) / 255;
    const b = parseInt(c.slice(4, 6), 16) / 255;
    const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
    const onWhite = 1.05 / (lum + 0.05);
    const onBlack = (lum + 0.05) / 0.05;
    return onWhite > onBlack ? '#ffffff' : '#000000';
  } catch {
    return '#ffffff';
  }
}

export function sustituirVariables(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => valores[key] ?? match);
}

export type EmpresaEmail = {
  id: string;
  nombre: string;
  plantillas_recordatorios: Partial<Record<TipoAlerta, string>> | null;
  logo_url: string | null;
  brand_color: string | null;
  correo: string | null;
  telefono: string | null;
  web: string | null;
};

/** Texto que llega de una base de datos o de una plantilla, seguro para meterlo en el HTML del correo. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** «12/5/2027» → fecha corta en español a partir de «AAAA-MM-DD» (sin desfases de zona horaria). */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d}/${m}/${a}`;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «12 de mayo de 2027». */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}
/** «100.000» — punto de millar también en cuatro cifras. */
export function kmTexto(km: number): string {
  return String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Cuándo toca el cambio de aceite, para una frase: «el 12/5/2027», «a los 100.000 km» o las dos cosas. */
export function cuandoAceite(fecha: string | null, km: number | null): string {
  if (fecha && km != null) return `el ${fechaCorta(fecha)} o a los ${kmTexto(km)} km, lo que ocurra antes`;
  if (fecha) return `el ${fechaCorta(fecha)}`;
  if (km != null) return `a los ${kmTexto(km)} km`;
  return 'próximamente';
}

type Marco = {
  empresa: EmpresaEmail;
  etiqueta: string;
  icono: string;
  /** Texto del mensaje, ya con las variables sustituidas (sin escapar: se escapa aquí). */
  cuerpo: string;
  vehiculoDesc: string;
  /** Líneas del recuadro bajo el vehículo (texto plano; se escapan aquí). */
  detalles: string[];
};

/** Maquetación común de todos los correos automáticos. Todo lo que viene de datos se escapa. */
function maquetar({ empresa, etiqueta, icono, cuerpo, vehiculoDesc, detalles }: Marco): string {
  const color = /^#[0-9a-fA-F]{6}$/.test(empresa.brand_color?.trim() ?? '') ? empresa.brand_color!.trim() : BRAND_COLOR_DEFAULT;
  const textoSobreColor = contrastText(color);
  const nombre = escaparHtml(empresa.nombre);
  const contacto = escaparHtml([empresa.correo, empresa.telefono, empresa.web].filter(Boolean).join(' · '));
  const logo = empresa.logo_url && /^https:\/\//.test(empresa.logo_url) ? escaparHtml(empresa.logo_url) : null;

  return `
<div style="background-color:#f1f5f9; padding:32px 16px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:${color}; padding:24px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            ${logo ? `<td style="padding-right:12px;"><img src="${logo}" alt="${nombre}" height="36" style="height:36px; width:auto; display:block; border-radius:8px;" /></td>` : ''}
            <td style="color:${textoSobreColor}; font-size:17px; font-weight:700; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              ${nombre}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 28px 8px;">
        <span style="display:inline-block; background-color:${color}1a; color:${color}; font-size:12px; font-weight:700; letter-spacing:0.02em; padding:4px 12px; border-radius:999px;">
          ${icono}&nbsp; ${escaparHtml(etiqueta.toUpperCase())}
        </span>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 0; color:#1e293b; font-size:15px; line-height:1.6; white-space:pre-line;">
        ${escaparHtml(cuerpo)}
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="font-size:14px; font-weight:700; color:#1e293b;">${escaparHtml(vehiculoDesc)}</div>
              ${detalles.map((d) => `<div style="font-size:13px; color:#64748b; margin-top:2px;">${escaparHtml(d)}</div>`).join('\n              ')}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px; border-top:1px solid #f1f5f9;">
        <p style="color:#94a3b8; font-size:12px; margin:20px 0 0;">
          Este es un aviso automático de ${nombre}.${contacto ? ` ${contacto}` : ''}
        </p>
        <p style="color:#94a3b8; font-size:12px; margin:8px 0 0;">
          Si prefieres no recibir estos avisos, responde a este correo y dejaremos de enviártelos.
        </p>
      </td>
    </tr>
  </table>
</div>
  `.trim();
}

export function construirEmail(
  tipo: TipoAlerta,
  empresa: EmpresaEmail,
  cliente: { nombre: string; apellidos: string },
  vehiculo: { marca: string; modelo: string; matricula: string },
  alerta: { fecha_limite: string | null; kilometraje_limite: number | null },
  aviso: Aviso = 'recordatorio',
): { asunto: string; html: string } {
  const vehiculoDesc = `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})`;
  const vencido = tipo === 'aceite' && aviso === 'vencido';
  const plantilla = vencido ? PLANTILLA_ACEITE_VENCIDO : (empresa.plantillas_recordatorios?.[tipo]?.trim() || PLANTILLA_DEFAULT[tipo]);

  const cuerpo = sustituirVariables(plantilla, {
    cliente: cliente.nombre,
    vehiculo: vehiculoDesc,
    empresa: empresa.nombre,
    fecha: alerta.fecha_limite ? fechaCorta(alerta.fecha_limite) : '',
    km: alerta.kilometraje_limite != null ? kmTexto(alerta.kilometraje_limite) : '',
    cuando: cuandoAceite(alerta.fecha_limite, alerta.kilometraje_limite),
  });

  const detalles: string[] = [];
  if (tipo === 'aceite') {
    if (alerta.fecha_limite) detalles.push(`${vencido ? 'Le tocaba' : 'Próximo cambio'}: ${fechaLarga(alerta.fecha_limite)}`);
    if (alerta.kilometraje_limite != null) detalles.push(`${alerta.fecha_limite ? 'O a los' : 'A los'} ${kmTexto(alerta.kilometraje_limite)} km`);
  } else if (alerta.fecha_limite) {
    detalles.push(`Vencimiento: ${fechaLarga(alerta.fecha_limite)}`);
  }

  const html = maquetar({ empresa, etiqueta: ETIQUETA_TIPO[tipo], icono: ICONO_TIPO[tipo], cuerpo, vehiculoDesc, detalles });
  return { asunto: `${vencido ? ASUNTO_ACEITE_VENCIDO : ASUNTO[tipo]} — ${vehiculoDesc}`, html };
}

// ---- Resumen del cambio de aceite al entregar ----

export const FILTROS_ACEITE = [
  ['filtro_aire', 'aire'], ['filtro_aceite', 'aceite'], ['filtro_combustible', 'combustible'], ['filtro_habitaculo', 'habitáculo'],
] as const;
export type FiltrosOrden = Partial<Record<typeof FILTROS_ACEITE[number][0], string | null>>;

const enumerar = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} y ${n.at(-1)}`);

/** Líneas del resumen: qué filtros se cambiaron y cuáles no. Los que quedaron sin revisar no se mencionan al cliente. */
export function lineasFiltros(orden: FiltrosOrden): string[] {
  const cambiados = FILTROS_ACEITE.filter(([col]) => orden[col] === 'cambiado').map(([, nombre]) => nombre);
  const no = FILTROS_ACEITE.filter(([col]) => orden[col] === 'no_cambiado').map(([, nombre]) => nombre);
  return [
    cambiados.length ? `Filtros cambiados: ${enumerar(cambiados)}` : '',
    no.length ? `No se cambiaron: ${enumerar(no)}` : '',
  ].filter(Boolean);
}

/** ¿Hay algo que contarle al cliente? Sin filtros marcados ni próximo cambio, el resumen iría vacío: no se envía. */
export function resumenTieneContenido(orden: FiltrosOrden, proximo: { fecha: string | null; km: number | null } | null): boolean {
  return lineasFiltros(orden).length > 0 || !!(proximo && (proximo.fecha || proximo.km != null));
}

export function construirEmailResumen(
  empresa: EmpresaEmail,
  cliente: { nombre: string },
  vehiculo: { marca: string; modelo: string; matricula: string },
  orden: FiltrosOrden,
  proximo: { fecha: string | null; km: number | null } | null,
): { asunto: string; html: string } {
  const vehiculoDesc = `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})`;
  const hayProximo = !!(proximo && (proximo.fecha || proximo.km != null));
  let cuerpo = sustituirVariables(PLANTILLA_ACEITE_RESUMEN, { cliente: cliente.nombre, vehiculo: vehiculoDesc, empresa: empresa.nombre });
  if (hayProximo) cuerpo += `\n\nEl próximo cambio le toca ${cuandoAceite(proximo!.fecha, proximo!.km)}. Te avisaremos unos días antes.`;

  const detalles = lineasFiltros(orden);
  if (hayProximo) {
    if (proximo!.fecha) detalles.push(`Próximo cambio: ${fechaLarga(proximo!.fecha)}`);
    if (proximo!.km != null) detalles.push(`${proximo!.fecha ? 'O a los' : 'A los'} ${kmTexto(proximo!.km)} km`);
  }
  const html = maquetar({ empresa, etiqueta: ETIQUETA_TIPO.aceite, icono: ICONO_TIPO.aceite, cuerpo, vehiculoDesc, detalles });
  return { asunto: `${ASUNTO_ACEITE_RESUMEN} — ${vehiculoDesc}`, html };
}

// Decide si una alerta de ITV/seguro/impuesto cae dentro de la ventana de aviso del lote diario —
// un fallo aquí significa clientes avisados demasiado tarde (o nunca).
export function dentroDeVentanaAviso(
  _tipo: TipoAlerta,
  alerta: { fecha_limite: string | null; kilometraje_limite: number | null },
  _vehiculoKm: number,
  fechaLimiteAviso: Date,
): boolean {
  if (!alerta.fecha_limite) return false;
  return new Date(alerta.fecha_limite) <= fechaLimiteAviso;
}

/** Días desde `hoy` hasta `fecha` (negativo si ya pasó). Ambas «AAAA-MM-DD». */
export function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

export type AlertaAceite = {
  fecha_limite: string | null; kilometraje_limite: number | null;
  recordatorio_enviado_en: string | null; ultimo_aviso_enviado_en: string | null;
};

/**
 * Qué correo toca hoy para una alerta de aceite, o null si ninguno. Cada uno se envía una sola vez
 * por ciclo (el ciclo se reabre cuando se anota un próximo cambio nuevo).
 *   · recordatorio: desde 14 días antes de la fecha, o cuando al coche le faltan ≤ 500 km.
 *   · vencido («último aviso»): entre 7 y 60 días después de la fecha. Si el recordatorio no llegó
 *     a salir (avisos activados tarde), se envía este directamente y ya no el recordatorio.
 * Pasados 60 días no se envía nada: el dato es viejo y solo molestaría.
 */
export function avisoAceite(alerta: AlertaAceite, vehiculoKm: number, hoy: string): Aviso | null {
  const dias = alerta.fecha_limite ? diasHasta(alerta.fecha_limite, hoy) : null;
  if (dias != null && dias <= -DIAS_ULTIMO_AVISO) {
    return dias >= -DIAS_TOPE_ULTIMO_AVISO && !alerta.ultimo_aviso_enviado_en ? 'vencido' : null;
  }
  if (alerta.recordatorio_enviado_en) return null;
  const porFecha = dias != null && dias <= DIAS_AVISO_VENCIMIENTO;
  const porKm = alerta.kilometraje_limite != null && alerta.kilometraje_limite - vehiculoKm <= KM_AVISO_ACEITE;
  return porFecha || porKm ? 'recordatorio' : null;
}
