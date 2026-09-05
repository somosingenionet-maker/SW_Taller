import { supabase } from '../supabase';
import type { AlertaTipo, Empresa } from '../../types';

const SELECT =
  'id, nombre, tagline, razon_social, nif, direccion_fiscal, correo, telefono, web, ciudad, brand_color, logo_base64, activo, recordatorios_automaticos_activos, plantillas_recordatorios, factura_prefijo, siguiente_numero_factura';

type EmpresaRow = {
  id: string; nombre: string; tagline: string; razon_social: string; nif: string;
  direccion_fiscal: string; correo: string; telefono: string; web: string;
  ciudad: string; brand_color: string; logo_base64: string; activo: boolean;
  recordatorios_automaticos_activos: boolean;
  plantillas_recordatorios: Partial<Record<AlertaTipo, string>> | null;
  factura_prefijo: string;
  siguiente_numero_factura: number;
};

function mapEmpresa(r: EmpresaRow): Empresa {
  return {
    id: r.id,
    nombre: r.nombre,
    tagline: r.tagline,
    razonSocial: r.razon_social,
    nif: r.nif,
    direccionFiscal: r.direccion_fiscal,
    correo: r.correo,
    telefono: r.telefono,
    web: r.web,
    ciudad: r.ciudad,
    brandColor: r.brand_color,
    logoBase64: r.logo_base64,
    activo: r.activo,
    recordatoriosAutomaticosActivos: r.recordatorios_automaticos_activos,
    plantillasRecordatorios: r.plantillas_recordatorios ?? {},
    facturaPrefijo: r.factura_prefijo,
    siguienteNumeroFactura: r.siguiente_numero_factura,
  };
}

function toRow(c: Partial<Empresa>) {
  const row: Partial<Omit<EmpresaRow, 'id'>> = {};
  if (c.nombre !== undefined) row.nombre = c.nombre;
  if (c.tagline !== undefined) row.tagline = c.tagline;
  if (c.razonSocial !== undefined) row.razon_social = c.razonSocial;
  if (c.nif !== undefined) row.nif = c.nif;
  if (c.direccionFiscal !== undefined) row.direccion_fiscal = c.direccionFiscal;
  if (c.correo !== undefined) row.correo = c.correo;
  if (c.telefono !== undefined) row.telefono = c.telefono;
  if (c.web !== undefined) row.web = c.web;
  if (c.ciudad !== undefined) row.ciudad = c.ciudad;
  if (c.brandColor !== undefined) row.brand_color = c.brandColor;
  if (c.logoBase64 !== undefined) row.logo_base64 = c.logoBase64;
  if (c.activo !== undefined) row.activo = c.activo;
  if (c.recordatoriosAutomaticosActivos !== undefined) row.recordatorios_automaticos_activos = c.recordatoriosAutomaticosActivos;
  if (c.plantillasRecordatorios !== undefined) row.plantillas_recordatorios = c.plantillasRecordatorios;
  if (c.facturaPrefijo !== undefined) row.factura_prefijo = c.facturaPrefijo;
  if (c.siguienteNumeroFactura !== undefined) row.siguiente_numero_factura = c.siguienteNumeroFactura;
  return row;
}

/** Carga la empresa del usuario autenticado (o cualquiera, si es super admin). */
export async function getEmpresa(id: string): Promise<Empresa> {
  const { data, error } = await supabase.from('empresas').select(SELECT).eq('id', id).single();
  if (error) throw new Error(error.message);
  return mapEmpresa(data as EmpresaRow);
}

/** Guarda los datos/marca de una empresa (Ajustes de Empresa). */
export async function updateEmpresa(id: string, patch: Partial<Empresa>): Promise<Empresa> {
  const { data, error } = await supabase
    .from('empresas')
    .update(toRow(patch))
    .eq('id', id)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  return mapEmpresa(data as EmpresaRow);
}

/** Lista todas las empresas — solo devuelve resultados si quien llama es super admin (RLS). */
export async function listEmpresas(): Promise<Empresa[]> {
  const { data, error } = await supabase.from('empresas').select(SELECT).order('nombre');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapEmpresa(r as EmpresaRow));
}

/** Suspende o reactiva una empresa (super admin). */
export async function toggleEmpresaActivo(id: string, activo: boolean): Promise<Empresa> {
  return updateEmpresa(id, { activo });
}

async function invokeManageEmpresas<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-empresas', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // el cuerpo de error no era JSON; se mantiene el mensaje genérico
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export interface NuevaEmpresaInput {
  nombre: string;
  nif?: string;
  adminEmail: string;
  adminPassword: string;
  adminNombre: string;
}

/** Crea una empresa nueva junto con su primer usuario admin (Edge Function, super admin). */
export async function createEmpresaConAdmin(input: NuevaEmpresaInput): Promise<Empresa> {
  const { empresa } = await invokeManageEmpresas<{ empresa: EmpresaRow }>({ action: 'create_empresa', ...input });
  return mapEmpresa(empresa);
}

/** Elimina una empresa por completo: sus usuarios de Auth y todos sus datos (Edge Function, super admin). */
export async function deleteEmpresa(id: string): Promise<void> {
  await invokeManageEmpresas<{ ok: true }>({ action: 'delete_empresa', id });
}
