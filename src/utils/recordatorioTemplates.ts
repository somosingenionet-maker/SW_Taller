import { AlertaTipo } from '../types';

/**
 * Textos por defecto de los recordatorios automáticos, editables por empresa.
 * Duplicado en supabase/functions/enviar-recordatorios/index.ts (Deno no
 * puede importar código del frontend) — mantener ambos en sincronía.
 */
export const PLANTILLA_DEFAULT: Record<AlertaTipo, string> = {
  itv: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que la ITV de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
  seguro: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el seguro de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros si necesitas ayuda con la renovación.',
  impuesto: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el impuesto de circulación de tu vehículo {{vehiculo}} vence el {{fecha}}.',
  mantenimiento: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que tu vehículo {{vehiculo}} tiene una revisión de mantenimiento preventivo recomendada a los {{km}} km.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
};

export const VARIABLES_DISPONIBLES = ['{{cliente}}', '{{vehiculo}}', '{{empresa}}', '{{fecha}}', '{{km}}'] as const;

/** Sustituye las variables {{cliente}}, {{vehiculo}}, etc. por sus valores reales. */
export function sustituirVariables(texto: string, valores: Partial<Record<'cliente' | 'vehiculo' | 'empresa' | 'fecha' | 'km', string>>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => valores[key as keyof typeof valores] ?? match);
}
