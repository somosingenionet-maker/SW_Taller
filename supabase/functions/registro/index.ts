// Alta autoservicio de un taller (pública, sin login): crea la empresa en periodo de prueba y su
// administrador, y le envía la invitación por correo para que elija su contraseña.
//
// - El formulario no pide contraseña: el enlace del correo la establece, y de paso demuestra que el
//   correo es real. No depende de que el registro abierto de Supabase Auth esté activado.
// - Respuesta idéntica exista o no ya el correo (no se pueden enumerar cuentas).
// - Límites por IP y por correo, campo señuelo y validación estricta contra abusos.
// - Si algo falla a medias se deshace todo: nunca quedan empresas sin administrador.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extraerIp, permitirPeticion } from '../_shared/rateLimit.ts';
import { DIAS_PRUEBA } from '../_shared/stripe.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { esCorreoYaRegistrado, validarRegistro } from './logic.ts';

initSentry('registro');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://motor.doonty.com').replace(/\/+$/, '');

/** Versión de los textos legales aceptados en el alta (fecha de «Última actualización»). */
const TERMINOS_VERSION = '2026-10-13';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

// Mismo texto en todos los casos de éxito aparente.
const RESPUESTA_OK = { ok: true, mensaje: 'Te hemos enviado un correo para activar tu cuenta. Revisa también la carpeta de spam.' };

async function sha256Corto(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Cuerpo de la petición inválido' }, 400); }

  const v = validarRegistro(body);
  if (!v.ok) {
    if ('trampa' in v) return json(RESPUESTA_OK); // bot: se le dice que fue bien y no se hace nada
    return json({ error: v.error }, 400);
  }
  const { nombreTaller, nombre, email, nif } = v.datos;

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const ip = extraerIp(req.headers.get('x-forwarded-for'));
  if (!(await permitirPeticion(admin, `registro-ip:${ip}`, 5, 3600)) ||
      !(await permitirPeticion(admin, `registro-mail:${await sha256Corto(email)}`, 3, 86400))) {
    return json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }, 429);
  }

  const ahora = new Date();
  const finPrueba = new Date(ahora.getTime() + DIAS_PRUEBA * 86400_000).toISOString();

  const { data: empresa, error: empresaErr } = await admin
    .from('empresas')
    .insert({
      nombre: nombreTaller, nif, correo: email,
      estado_suscripcion: 'prueba', prueba_hasta: finPrueba, acceso_hasta: finPrueba,
      terminos_aceptados_en: ahora.toISOString(), terminos_version: TERMINOS_VERSION,
    })
    .select('id')
    .single();
  if (empresaErr || !empresa) {
    Sentry.captureException(new Error(`registro: no se pudo crear la empresa: ${empresaErr?.message}`));
    return json({ error: 'No se pudo completar el alta. Inténtalo de nuevo en unos minutos.' }, 500);
  }

  const deshacer = async (userId?: string) => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    await admin.from('empresas').delete().eq('id', empresa.id);
  };

  const { data: invitado, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nombre },
    redirectTo: APP_URL,
  });
  if (invErr || !invitado?.user) {
    await deshacer();
    if (invErr && esCorreoYaRegistrado(invErr)) return json(RESPUESTA_OK); // no se revela que ya existe
    Sentry.captureException(new Error(`registro: invitación fallida: ${invErr?.message}`));
    return json({ error: 'No se pudo enviar el correo de activación. Inténtalo de nuevo en unos minutos.' }, 502);
  }

  // handle_new_user() ya creó el perfil sin empresa ni rol de administrador.
  const { error: perfilErr } = await admin
    .from('perfiles')
    .update({ nombre, rol: 'admin', empresa_id: empresa.id, activo: true })
    .eq('id', invitado.user.id);
  if (perfilErr) {
    await deshacer(invitado.user.id);
    Sentry.captureException(new Error(`registro: perfil: ${perfilErr.message}`));
    return json({ error: 'No se pudo completar el alta. Inténtalo de nuevo en unos minutos.' }, 500);
  }

  return json(RESPUESTA_OK);
}, CORS_HEADERS));
