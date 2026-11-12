/**
 * Texto legible de un correo guardado como HTML (la bandeja de salida guarda el correo tal cual se
 * envió). Quita etiquetas y estilos, traduce las entidades básicas y recorta. Solo para MOSTRAR un
 * resumen: nunca se inserta como HTML.
 */
export function textoDeHtml(html: string, max = 320): string {
  if (!/<[a-z!/]/i.test(html)) return html;
  const texto = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|td|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .replace(/\n{2,}/g, '\n');
  return texto.length > max ? `${texto.slice(0, max).trimEnd()}…` : texto;
}

export const NOMBRE_EVENTO: Record<string, string> = {
  itv_proxima: 'ITV próxima',
  vencimiento_seguro: 'Vencimiento del seguro',
  impuesto_proximo: 'Impuesto de circulación',
  mantenimiento_preventivo: 'Mantenimiento (antiguo)',
  reparacion_lista: 'Reparación lista',
  cambio_aceite: 'Cambio de aceite: recordatorio',
  aceite_vencido: 'Cambio de aceite: último aviso',
  aceite_resumen: 'Cambio de aceite: resumen al entregar',
};
