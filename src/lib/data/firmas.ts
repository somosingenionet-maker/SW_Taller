import { supabase } from '../supabase';

export type TipoFirma = 'presupuesto' | 'entrega';

export interface FirmaGuardada {
  /** PNG de la firma como data URL. */
  png: string;
  nombre: string;
  /** ISO de la firma, puesto por el servidor. */
  en: string;
  /** Solo la del presupuesto: importe de la orden en el momento de firmar. */
  total?: number;
}

export interface FirmasOrden { presupuesto?: FirmaGuardada; entrega?: FirmaGuardada }

/** Firma una orden. El servidor pone la hora y el importe, valida el dibujo y deja la firma inmutable. */
export async function firmarOrden(otId: string, tipo: TipoFirma, png: string, nombre: string): Promise<void> {
  const { error } = await supabase.rpc('firmar_orden' as never, { p_ot_id: otId, p_tipo: tipo, p_png: png, p_nombre: nombre } as never);
  if (error) throw new Error(error.message);
}

type FilaFirmas = {
  firma_presupuesto: string | null; firma_presupuesto_nombre: string | null; firma_presupuesto_en: string | null; firma_presupuesto_total: number | null;
  firma_entrega: string | null; firma_entrega_nombre: string | null; firma_entrega_en: string | null;
};

/** Convierte la fila de la base de datos en firmas. Pura: se prueba sin servidor. */
export function mapFirmas(f: FilaFirmas): FirmasOrden {
  return {
    presupuesto: f.firma_presupuesto && f.firma_presupuesto_en
      ? { png: f.firma_presupuesto, nombre: f.firma_presupuesto_nombre ?? '', en: f.firma_presupuesto_en, total: f.firma_presupuesto_total ?? undefined } : undefined,
    entrega: f.firma_entrega && f.firma_entrega_en
      ? { png: f.firma_entrega, nombre: f.firma_entrega_nombre ?? '', en: f.firma_entrega_en } : undefined,
  };
}

/** Los dibujos de las firmas de una orden. No viajan con los listados (pesan): se piden al abrir la orden. */
export async function getFirmas(otId: string): Promise<FirmasOrden> {
  const { data, error } = await supabase
    .from('ordenes_trabajo')
    .select('firma_presupuesto, firma_presupuesto_nombre, firma_presupuesto_en, firma_presupuesto_total, firma_entrega, firma_entrega_nombre, firma_entrega_en')
    .eq('id', otId)
    .single();
  if (error) throw new Error(error.message);
  return mapFirmas(data as unknown as FilaFirmas);
}
