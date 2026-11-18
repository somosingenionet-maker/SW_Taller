import { supabase } from '../supabase';
import type { CompraAdjunto } from '../../types';
import { comprimirImagen, OPCIONES_DOCUMENTO } from '../../utils/imagen';
import { esImagen, esTipoAdjunto, extensionDeTipo, MAX_BYTES_ADJUNTO, tipoDeArchivo, validarArchivoFactura } from '../../utils/adjuntos';

/** Bucket privado: solo se lee con enlaces que caducan. */
const BUCKET = 'facturas-proveedor';

type Row = { id: string; compra_id: string; ruta: string; nombre: string; tipo: string; tamano: number; created_at: string };
const mapAdjunto = (r: Row): CompraAdjunto => ({ id: r.id, compraId: r.compra_id, ruta: r.ruta, nombre: r.nombre, tipo: r.tipo, tamano: Number(r.tamano), subidoEn: r.created_at });

export async function listAdjuntos(compraId: string): Promise<CompraAdjunto[]> {
  const { data, error } = await supabase.from('compra_adjuntos').select('id, compra_id, ruta, nombre, tipo, tamano, created_at').eq('compra_id', compraId).order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapAdjunto(r as Row));
}

/** Deja el archivo listo para subir: un PDF tal cual; una foto, reducida (si el navegador no puede, se sube la original si vale). */
async function prepararArchivo(file: File): Promise<{ blob: Blob; tipo: string; ext: string }> {
  const problema = validarArchivoFactura(file);
  if (problema) throw new Error(problema);
  if (tipoDeArchivo(file) === 'application/pdf') return { blob: file, tipo: 'application/pdf', ext: 'pdf' };
  const c = await comprimirImagen(file, OPCIONES_DOCUMENTO);
  if (!esTipoAdjunto(c.tipo)) {
    throw new Error(`«${file.name}»: este navegador no puede convertir ese formato de foto. Haz la foto en JPG o súbela como PDF.`);
  }
  if (c.blob.size > MAX_BYTES_ADJUNTO) throw new Error(`«${file.name}» sigue pesando más de 10 MB después de reducirla.`);
  return { blob: c.blob, tipo: c.tipo, ext: extensionDeTipo(c.tipo) };
}

/**
 * Sube un archivo a la compra: primero al almacenamiento y después lo da de alta en la lista (el servidor comprueba que existe y
 * toma de él el tipo y el tamaño). Si el alta falla, se retira el archivo para no dejar basura.
 */
export async function subirAdjunto(empresaId: string, compraId: string, file: File): Promise<CompraAdjunto> {
  const { blob, tipo, ext } = await prepararArchivo(file);
  const ruta = `${empresaId}/${compraId}/${crypto.randomUUID()}.${ext}`;
  const { error: eSubida } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: tipo, cacheControl: '3600' });
  if (eSubida) {
    const m = eSubida.message ?? '';
    if (/row-level security|policy|unauthorized|403/i.test(m)) throw new Error(`No se pudo subir «${file.name}»: no tienes permiso o la suscripción ha terminado.`);
    throw new Error(`No se pudo subir «${file.name}». Inténtalo de nuevo.`);
  }
  const { data, error } = await supabase.rpc('registrar_adjunto_compra', { p_compra_id: compraId, p_ruta: ruta, p_nombre: file.name });
  if (error) {
    await supabase.storage.from(BUCKET).remove([ruta]);
    throw new Error(error.message);
  }
  const lista = await listAdjuntos(compraId);
  const nuevo = lista.find((a) => a.id === data);
  if (!nuevo) throw new Error('El archivo se subió pero no aparece en la lista: recarga la compra.');
  return nuevo;
}

/** Enlace de lectura de 5 minutos. */
export async function urlAdjunto(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ruta, 300);
  if (error || !data?.signedUrl) throw new Error('No se pudo abrir el archivo.');
  return data.signedUrl;
}

export async function borrarAdjunto(a: Pick<CompraAdjunto, 'id'>): Promise<void> {
  const { data, error } = await supabase.rpc('borrar_adjunto_compra', { p_id: a.id });
  if (error) throw new Error(error.message);
  // Ya no está en la lista; si el archivo no se pudiera borrar quedaría suelto, sin enseñarse en ningún sitio.
  const { error: eFichero } = await supabase.storage.from(BUCKET).remove([data as string]);
  if (eFichero) console.warn('No se pudo borrar el archivo del almacenamiento', eFichero);
}

export { esImagen };
