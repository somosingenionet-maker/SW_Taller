import { supabase } from '../supabase';
import type { EmpresaConfig } from '../../types';

const SELECT =
  'nombre, tagline, razon_social, nif, direccion_fiscal, correo, telefono, web, ciudad, brand_color, logo_base64';

type EmpresaRow = {
  nombre: string; tagline: string; razon_social: string; nif: string;
  direccion_fiscal: string; correo: string; telefono: string; web: string;
  ciudad: string; brand_color: string; logo_base64: string;
};

export const DEFAULT_EMPRESA_CONFIG: EmpresaConfig = {
  nombre: 'inGenio',
  tagline: '',
  razonSocial: '',
  nif: '',
  direccionFiscal: '',
  correo: '',
  telefono: '',
  web: '',
  ciudad: '',
  brandColor: '#2563eb',
  logoBase64: '',
};

function mapEmpresa(r: EmpresaRow): EmpresaConfig {
  return {
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
  };
}

function toRow(c: EmpresaConfig) {
  return {
    nombre: c.nombre,
    tagline: c.tagline,
    razon_social: c.razonSocial,
    nif: c.nif,
    direccion_fiscal: c.direccionFiscal,
    correo: c.correo,
    telefono: c.telefono,
    web: c.web,
    ciudad: c.ciudad,
    brand_color: c.brandColor,
    logo_base64: c.logoBase64,
  };
}

export async function getEmpresaConfig(): Promise<EmpresaConfig> {
  const { data, error } = await supabase.from('empresa_config').select(SELECT).eq('id', 1).single();
  if (error) throw error;
  return mapEmpresa(data as EmpresaRow);
}

export async function saveEmpresaConfig(config: EmpresaConfig): Promise<EmpresaConfig> {
  const { data, error } = await supabase
    .from('empresa_config')
    .update(toRow(config))
    .eq('id', 1)
    .select(SELECT)
    .single();
  if (error) throw error;
  return mapEmpresa(data as EmpresaRow);
}
