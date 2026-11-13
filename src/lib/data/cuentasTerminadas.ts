import { supabase } from '../supabase';

/** Una cuenta cuyo acceso ya terminó, tal como la ve el panel del super administrador. */
export interface CuentaTerminada {
  empresaId: string;
  nombre: string;
  accesoHasta: string;
  estado: string | null;
  finConservacion: string;
  /** Por qué NO se borrará sola: 'facturas_emitidas' | 'suscripcion_activa' | null (se borrará). */
  retencion: string | null;
  aviso1En: string | null;
  aviso2En: string | null;
  borradoPrevistoEn: string | null;
  usuarios: number;
  clientes: number;
  vehiculos: number;
  ordenes: number;
  facturasEmitidas: number;
}

export async function listCuentasTerminadas(): Promise<CuentaTerminada[]> {
  const { data, error } = await supabase.rpc('cuentas_terminadas');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((c) => ({
      empresaId: c.empresa_id, nombre: c.nombre, accesoHasta: c.acceso_hasta, estado: c.estado,
      finConservacion: c.fin_conservacion, retencion: c.retencion,
      aviso1En: c.aviso1_en, aviso2En: c.aviso2_en, borradoPrevistoEn: c.borrado_previsto_en,
      usuarios: Number(c.usuarios), clientes: Number(c.clientes), vehiculos: Number(c.vehiculos),
      ordenes: Number(c.ordenes), facturasEmitidas: Number(c.facturas_emitidas),
    }))
    .sort((a, b) => a.finConservacion.localeCompare(b.finConservacion));
}

export async function getBorradoAutomaticoActivo(): Promise<boolean> {
  const { data, error } = await supabase.from('plataforma_config').select('borrado_automatico_activo').eq('id', 'global').single();
  if (error) throw new Error(error.message);
  return data.borrado_automatico_activo;
}

export async function setBorradoAutomaticoActivo(activo: boolean): Promise<void> {
  const { error } = await supabase.from('plataforma_config').update({ borrado_automatico_activo: activo }).eq('id', 'global');
  if (error) throw new Error(error.message);
}
