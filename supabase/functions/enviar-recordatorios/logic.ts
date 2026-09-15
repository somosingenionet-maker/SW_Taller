// Lógica pura de enviar-recordatorios (construcción del email y la ventana
// de aviso), separada de index.ts para poder testearla con `deno test` sin
// arrancar el servidor HTTP ni llamar a Resend/Supabase.

export type TipoAlerta = 'itv' | 'seguro' | 'impuesto' | 'mantenimiento';
export type TipoEvento = 'itv_proxima' | 'vencimiento_seguro' | 'impuesto_proximo' | 'mantenimiento_preventivo';

export const TIPO_EVENTO: Record<TipoAlerta, TipoEvento> = {
  itv: 'itv_proxima',
  seguro: 'vencimiento_seguro',
  impuesto: 'impuesto_proximo',
  mantenimiento: 'mantenimiento_preventivo',
};

export const ASUNTO: Record<TipoAlerta, string> = {
  itv: 'Recordatorio: ITV próxima a vencer',
  seguro: 'Recordatorio: su seguro está próximo a vencer',
  impuesto: 'Recordatorio: impuesto de circulación próximo a vencer',
  mantenimiento: 'Recordatorio: mantenimiento preventivo recomendado',
};

export const ICONO_TIPO: Record<TipoAlerta, string> = {
  itv: '📋',
  seguro: '🛡️',
  impuesto: '🚗',
  mantenimiento: '🔧',
};

export const ETIQUETA_TIPO: Record<TipoAlerta, string> = {
  itv: 'ITV',
  seguro: 'Seguro',
  impuesto: 'Impuesto de circulación',
  mantenimiento: 'Mantenimiento',
};

export const BRAND_COLOR_DEFAULT = '#2563eb';

// Ventanas de aviso: cuántos días/km antes del vencimiento se manda el
// recordatorio del lote automático.
export const DIAS_AVISO_VENCIMIENTO = 14;
export const KM_AVISO_MANTENIMIENTO = 500;

// Textos por defecto — duplicado en src/utils/recordatorioTemplates.ts
// (Deno no puede importar código del frontend). Mantener ambos en sincronía.
export const PLANTILLA_DEFAULT: Record<TipoAlerta, string> = {
  itv: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que la ITV de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
  seguro: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el seguro de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros si necesitas ayuda con la renovación.',
  impuesto: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el impuesto de circulación de tu vehículo {{vehiculo}} vence el {{fecha}}.',
  mantenimiento: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que tu vehículo {{vehiculo}} tiene una revisión de mantenimiento preventivo recomendada a los {{km}} km.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
};

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

export function construirEmail(
  tipo: TipoAlerta,
  empresa: EmpresaEmail,
  cliente: { nombre: string; apellidos: string },
  vehiculo: { marca: string; modelo: string; matricula: string },
  alerta: { fecha_limite: string | null; kilometraje_limite: number | null },
): { asunto: string; html: string } {
  const vehiculoDesc = `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})`;
  const plantilla = empresa.plantillas_recordatorios?.[tipo]?.trim() || PLANTILLA_DEFAULT[tipo];

  const cuerpo = sustituirVariables(plantilla, {
    cliente: cliente.nombre,
    vehiculo: vehiculoDesc,
    empresa: empresa.nombre,
    fecha: alerta.fecha_limite ? new Date(alerta.fecha_limite).toLocaleDateString('es-ES') : '',
    km: alerta.kilometraje_limite != null ? alerta.kilometraje_limite.toLocaleString('es-ES') : '',
  });

  const color = empresa.brand_color?.trim() || BRAND_COLOR_DEFAULT;
  const textoSobreColor = contrastText(color);
  const detalle = tipo === 'mantenimiento'
    ? (alerta.kilometraje_limite != null ? `${alerta.kilometraje_limite.toLocaleString('es-ES')} km` : '')
    : (alerta.fecha_limite ? new Date(alerta.fecha_limite).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  const contacto = [empresa.correo, empresa.telefono, empresa.web].filter(Boolean).join(' · ');

  const html = `
<div style="background-color:#f1f5f9; padding:32px 16px; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; margin:0 auto; background-color:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:${color}; padding:24px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            ${empresa.logo_url ? `<td style="padding-right:12px;"><img src="${empresa.logo_url}" alt="${empresa.nombre}" height="36" style="height:36px; width:auto; display:block; border-radius:8px;" /></td>` : ''}
            <td style="color:${textoSobreColor}; font-size:17px; font-weight:700; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              ${empresa.nombre}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 28px 8px;">
        <span style="display:inline-block; background-color:${color}1a; color:${color}; font-size:12px; font-weight:700; letter-spacing:0.02em; padding:4px 12px; border-radius:999px;">
          ${ICONO_TIPO[tipo]}&nbsp; ${ETIQUETA_TIPO[tipo].toUpperCase()}
        </span>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 0; color:#1e293b; font-size:15px; line-height:1.6; white-space:pre-line;">
        ${cuerpo}
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="font-size:14px; font-weight:700; color:#1e293b;">${vehiculoDesc}</div>
              ${detalle ? `<div style="font-size:13px; color:#64748b; margin-top:2px;">${tipo === 'mantenimiento' ? 'Kilometraje de aviso' : 'Vencimiento'}: ${detalle}</div>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px; border-top:1px solid #f1f5f9;">
        <p style="color:#94a3b8; font-size:12px; margin:20px 0 0;">
          Este es un recordatorio automático de ${empresa.nombre}.${contacto ? ` ${contacto}` : ''}
        </p>
      </td>
    </tr>
  </table>
</div>
  `.trim();

  return { asunto: `${ASUNTO[tipo]} — ${vehiculoDesc}`, html };
}

// Decide si una alerta cae dentro de la ventana de aviso del lote diario —
// un fallo aquí significa clientes avisados demasiado tarde (o nunca) de una
// ITV/seguro/impuesto/mantenimiento próximos a vencer.
export function dentroDeVentanaAviso(
  tipo: TipoAlerta,
  alerta: { fecha_limite: string | null; kilometraje_limite: number | null },
  vehiculoKm: number,
  fechaLimiteAviso: Date,
): boolean {
  if (tipo === 'mantenimiento') {
    if (alerta.kilometraje_limite == null) return false;
    return alerta.kilometraje_limite - vehiculoKm <= KM_AVISO_MANTENIMIENTO;
  }
  if (!alerta.fecha_limite) return false;
  return new Date(alerta.fecha_limite) <= fechaLimiteAviso;
}
