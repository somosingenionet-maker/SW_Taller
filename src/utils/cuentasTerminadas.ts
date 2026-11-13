import type { CuentaTerminada } from '../lib/data/cuentasTerminadas';

/** Lo que se ve de cada cuenta en la lista: texto y color de su situación. */
export function situacionCuenta(c: Pick<CuentaTerminada, 'retencion' | 'aviso1En' | 'aviso2En' | 'borradoPrevistoEn'>): { texto: string; tono: 'retenida' | 'avisada' | 'pendiente' } {
  if (c.retencion === 'facturas_emitidas') return { texto: 'Retenida: tiene facturas emitidas (no se borra sola)', tono: 'retenida' };
  if (c.retencion === 'suscripcion_activa') return { texto: 'Retenida: la suscripción figura activa (revisar con Stripe)', tono: 'retenida' };
  if (c.aviso2En) return { texto: 'Último aviso enviado', tono: 'avisada' };
  if (c.aviso1En) return { texto: 'Primer aviso enviado', tono: 'avisada' };
  return { texto: 'Sin avisar todavía', tono: 'pendiente' };
}
