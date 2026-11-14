import { supabase } from '../supabase';

/**
 * Llama a una Edge Function con la sesión del usuario. Si falla, lanza un Error con el texto en español que
 * mandó la función (validaciones, permisos) y no el mensaje técnico de la librería.
 */
export async function invocarFuncion<T>(funcion: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(funcion, { body });
  if (error) {
    let mensaje = error.message;
    const contexto = (error as { context?: Response }).context;
    if (contexto && typeof contexto.clone === 'function') {
      try {
        const parsed = await contexto.clone().json();
        if (typeof parsed?.error === 'string') mensaje = parsed.error;
      } catch { /* el cuerpo del error no era JSON: se queda el mensaje de la librería */ }
    }
    throw new Error(mensaje);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}
