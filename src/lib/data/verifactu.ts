import { supabase } from '../supabase';

export interface CertificadoEstado {
  existe: boolean;
  titularNif: string | null;
  titularNombre: string | null;
  validoDesde: string | null;
  validoHasta: string | null;
}

/** Solo metadatos del certificado de la empresa (nunca su contenido): lo calcula el servidor. */
export async function getCertificadoEstado(): Promise<CertificadoEstado> {
  const { data, error } = await supabase.rpc('certificado_verifactu_estado');
  if (error) throw new Error(error.message);
  const r = (data ?? [])[0];
  return {
    existe: r?.existe ?? false,
    titularNif: r?.titular_nif ?? null,
    titularNombre: r?.titular_nombre ?? null,
    validoDesde: r?.valido_desde ?? null,
    validoHasta: r?.valido_hasta ?? null,
  };
}

export interface ResultadoSubida {
  titularNif: string | null;
  titularNombre: string | null;
  validoHasta: string;
  avisoNif: string | null;
}

function aBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function invocarCertificado(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('verifactu-certificado', { body });
  if (error) {
    // Cuando la función responde con un error de negocio (contraseña mala, caducado...)
    // el mensaje útil viene en el cuerpo, no en error.message.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const detalle = await ctx.json().catch(() => null) as { error?: string } | null;
      if (detalle?.error) throw new Error(detalle.error);
    }
    throw new Error(error.message);
  }
  return data as Record<string, unknown>;
}

export async function subirCertificado(archivo: File, password: string): Promise<ResultadoSubida> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const r = await invocarCertificado({ accion: 'subir', p12Base64: aBase64(bytes), password });
  return {
    titularNif: (r.titularNif as string | null) ?? null,
    titularNombre: (r.titularNombre as string | null) ?? null,
    validoHasta: r.validoHasta as string,
    avisoNif: (r.avisoNif as string | null) ?? null,
  };
}

export async function eliminarCertificado(): Promise<void> {
  await invocarCertificado({ accion: 'eliminar' });
}

/**
 * Pide al servidor que envíe a la AEAT lo que haya pendiente. Se llama justo
 * después de emitir o cancelar una factura. Es "dispara y olvida": si falla, el
 * lote automático de cada pocos minutos lo reintenta, y nunca debe estorbar a
 * quien está facturando.
 */
export function dispararEnvioAeat(): void {
  supabase.functions.invoke('verifactu-enviar', { body: {} }).catch(() => { /* lo reintentará el lote automático */ });
}
