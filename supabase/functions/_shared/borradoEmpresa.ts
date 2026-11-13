// Borrado COMPLETO de una empresa: sus archivos, sus usuarios y sus datos. Lo usan el panel de super
// administrador (manage-empresas) y el borrado automático de cuentas abandonadas (limpiar-empresas).
//
// Antes solo se borraban los usuarios y las filas de la base de datos: los logos y las FOTOS DE
// RECEPCIÓN de los vehículos se quedaban para siempre en el almacenamiento, aunque la empresa ya no
// existiera.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Buckets de Storage donde cada empresa guarda sus archivos, siempre bajo `<empresa_id>/...`. */
export const BUCKETS_EMPRESA = ['logos-empresas', 'fotos-recepcion'] as const;

const POR_PAGINA = 1000;
const POR_LOTE_BORRADO = 100;

/** Lo mínimo que se usa del almacenamiento (permite probarlo sin Supabase). */
export interface AlmacenArchivos {
  list(path: string, opts: { limit: number; offset: number }): Promise<{ data: { name: string; id: string | null }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

/**
 * El id de empresa se usa como prefijo para borrar archivos: un id vacío o con barras («», «.», «a/b»)
 * borraría TODO el bucket o carpetas de otras empresas. Solo se aceptan ids normales.
 */
export function idEmpresaSeguro(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

/** Rutas de todos los archivos bajo `prefijo`, entrando en las subcarpetas. */
export async function listarArchivos(almacen: AlmacenArchivos, prefijo: string): Promise<string[]> {
  const rutas: string[] = [];
  for (let offset = 0; ; offset += POR_PAGINA) {
    const { data, error } = await almacen.list(prefijo, { limit: POR_PAGINA, offset });
    if (error) throw new Error(`No se pudo listar «${prefijo}»: ${error.message}`);
    const entradas = data ?? [];
    for (const e of entradas) {
      // En Storage, una «carpeta» es una entrada sin id.
      if (e.id === null) rutas.push(...(await listarArchivos(almacen, `${prefijo}/${e.name}`)));
      else rutas.push(`${prefijo}/${e.name}`);
    }
    if (entradas.length < POR_PAGINA) break;
  }
  return rutas;
}

/** Borra todos los archivos de la empresa en todos sus buckets. Devuelve cuántos. Lanza si algo falla. */
export async function borrarArchivosDeEmpresa(
  almacenDe: (bucket: string) => AlmacenArchivos,
  empresaId: string,
): Promise<number> {
  if (!idEmpresaSeguro(empresaId)) throw new Error('Id de empresa no válido para borrar archivos.');
  let total = 0;
  for (const bucket of BUCKETS_EMPRESA) {
    const almacen = almacenDe(bucket);
    const rutas = await listarArchivos(almacen, empresaId);
    for (let i = 0; i < rutas.length; i += POR_LOTE_BORRADO) {
      const { error } = await almacen.remove(rutas.slice(i, i + POR_LOTE_BORRADO));
      if (error) throw new Error(`No se pudieron borrar archivos de «${bucket}»: ${error.message}`);
    }
    total += rutas.length;
  }
  return total;
}

/**
 * Borra la empresa entera, por este orden: archivos → usuarios de Auth (su fila de `perfiles` cae en
 * cascada) → la empresa (cae en cascada todo lo demás). Si algo falla, lanza ANTES de tocar lo
 * siguiente: nunca queda una empresa sin archivos pero con datos a medias por un fallo de red.
 */
export async function borrarEmpresaCompleta(
  admin: SupabaseClient,
  empresaId: string,
): Promise<{ usuarios: number; archivos: number }> {
  if (!idEmpresaSeguro(empresaId)) throw new Error('Id de empresa no válido.');

  const archivos = await borrarArchivosDeEmpresa((b) => admin.storage.from(b) as unknown as AlmacenArchivos, empresaId);

  const { data: usuarios, error: usuariosErr } = await admin.from('perfiles').select('id').eq('empresa_id', empresaId);
  if (usuariosErr) throw new Error(usuariosErr.message);
  for (const u of usuarios ?? []) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`Error eliminando usuario ${u.id}: ${error.message}`);
  }

  const { error: delErr } = await admin.from('empresas').delete().eq('id', empresaId);
  if (delErr) throw new Error(delErr.message);

  return { usuarios: (usuarios ?? []).length, archivos };
}
