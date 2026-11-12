import { AlertaTipo } from '../types';

/**
 * Textos por defecto de los recordatorios automáticos, editables por empresa.
 * Duplicado en supabase/functions/enviar-recordatorios/logic.ts (Deno no
 * puede importar código del frontend) — mantener ambos en sincronía.
 */
export const PLANTILLA_DEFAULT: Record<AlertaTipo, string> = {
  itv: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que la ITV de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros para programar tu cita cuando te venga bien.',
  seguro: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el seguro de tu vehículo {{vehiculo}} vence el {{fecha}}.\n\nContacta con nosotros si necesitas ayuda con la renovación.',
  impuesto: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que el impuesto de circulación de tu vehículo {{vehiculo}} vence el {{fecha}}.',
  aceite: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte que a tu vehículo {{vehiculo}} le toca el cambio de aceite {{cuando}}.\n\nContacta con nosotros para reservar tu cita cuando te venga bien.',
};

/** {{cuando}} es para el cambio de aceite: «el 12/5/2027», «a los 100.000 km» o las dos cosas. */
export const VARIABLES_DISPONIBLES = ['{{cliente}}', '{{vehiculo}}', '{{empresa}}', '{{fecha}}', '{{km}}', '{{cuando}}'] as const;

/** Sustituye las variables {{cliente}}, {{vehiculo}}, etc. por sus valores reales. */
export function sustituirVariables(texto: string, valores: Partial<Record<'cliente' | 'vehiculo' | 'empresa' | 'fecha' | 'km' | 'cuando', string>>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => valores[key as keyof typeof valores] ?? match);
}
