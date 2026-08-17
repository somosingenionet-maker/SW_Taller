import { supabase } from '../supabase';

/**
 * Logo global de la plataforma (branding de Tibox), independiente del logo
 * de cada empresa. Se muestra en el login y en el panel de Super Admin.
 * Lectura pública (se necesita antes de autenticar); escritura solo super admin.
 */
export async function getPlataformaLogo(): Promise<string | null> {
  const { data, error } = await supabase
    .from('plataforma_config')
    .select('logo_base64')
    .eq('id', 'global')
    .single();
  if (error) throw error;
  return (data as { logo_base64: string | null }).logo_base64;
}

export async function setPlataformaLogo(logoBase64: string | null): Promise<void> {
  const { error } = await supabase
    .from('plataforma_config')
    .update({ logo_base64: logoBase64 })
    .eq('id', 'global');
  if (error) throw error;
}
