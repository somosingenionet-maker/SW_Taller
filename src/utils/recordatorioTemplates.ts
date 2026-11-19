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

/** Texto del «último aviso» del cambio de aceite (no editable). Duplicado en supabase/functions/enviar-recordatorios/logic.ts. */
export const PLANTILLA_ACEITE_VENCIDO =
  'Hola {{cliente}},\n\nSegún nuestros datos, a tu vehículo {{vehiculo}} le tocaba el cambio de aceite {{cuando}} y todavía no lo hemos hecho.\n\nSi ya lo cambiaste en otro sitio, no tienes que hacer nada. Si quieres que nos ocupemos, escríbenos o llámanos y te damos cita.';

/** {{cuando}} es para el cambio de aceite: «el 12/5/2027», «a los 100.000 km» o las dos cosas. */
export const VARIABLES_DISPONIBLES = ['{{cliente}}', '{{vehiculo}}', '{{empresa}}', '{{fecha}}', '{{km}}', '{{cuando}}'] as const;

/** Sustituye las variables {{cliente}}, {{vehiculo}}, etc. por sus valores reales. */
export function sustituirVariables(texto: string, valores: Partial<Record<'cliente' | 'vehiculo' | 'empresa' | 'fecha' | 'km' | 'cuando', string>>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, key) => valores[key as keyof typeof valores] ?? match);
}

/**
 * Motivos rápidos de un aviso personalizado, con su texto por defecto (el taller puede cambiarlo al crear el aviso).
 * Duplicado en supabase/functions/enviar-recordatorios/logic.ts para el texto vacío — mantener ambos en sincronía.
 */
export const MOTIVOS_AVISO: { id: string; etiqueta: string; mensaje: string }[] = [
  { id: 'neumaticos', etiqueta: 'Neumáticos', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: ya toca revisar los neumáticos de tu vehículo {{vehiculo}} y cambiarlos si lo necesitan.\n\nSi quieres, te damos cita para echarles un vistazo.' },
  { id: 'frenos', etiqueta: 'Frenos', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: toca revisar los frenos de tu vehículo {{vehiculo}} (pastillas y discos).\n\nEscríbenos o llámanos y te damos cita.' },
  { id: 'distribucion', etiqueta: 'Correa de distribución', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: se acerca el momento de revisar o cambiar la correa de distribución de tu vehículo {{vehiculo}}. Es mejor hacerlo a tiempo que arriesgarse a una avería grande.\n\nEscríbenos y te damos cita.' },
  { id: 'bateria', etiqueta: 'Batería', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: conviene comprobar el estado de la batería de tu vehículo {{vehiculo}} antes de que te deje tirado.\n\nPásate cuando quieras o pide cita.' },
  { id: 'revision', etiqueta: 'Revisión general', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: ya toca la revisión general de tu vehículo {{vehiculo}}.\n\nEscríbenos o llámanos y te damos cita cuando te venga bien.' },
  { id: 'aire', etiqueta: 'Aire acondicionado', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}}: es buen momento para revisar el aire acondicionado de tu vehículo {{vehiculo}}.\n\nSi quieres, te damos cita.' },
  { id: 'otro', etiqueta: 'Otro motivo', mensaje: 'Hola {{cliente}},\n\nTe escribimos desde {{empresa}} para recordarte lo que hablamos sobre tu vehículo {{vehiculo}}.\n\nEscríbenos o llámanos cuando quieras.' },
];
