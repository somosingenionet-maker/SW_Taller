// Alta y baja del certificado electrónico de cada taller para el envío
// VERI*FACTU a la AEAT. Solo el admin de la propia empresa.
//
// El .p12 y su contraseña llegan por HTTPS, se validan (contraseña, vigencia,
// clave privada), se CIFRAN con VERIFACTU_CERT_KEY y solo entonces se guardan.
// Nunca se devuelven ni se escriben en logs: la pantalla solo ve metadatos
// (titular, NIF, vigencia) a través de la función SQL certificado_verifactu_estado().
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cifrar, cifrarTexto, base64ABytes } from '../_shared/cifrado.ts';
import { ErrorCertificado, leerP12 } from '../_shared/certificado.ts';
import { normalizarNif } from '../_shared/verifactu.ts';
import { permitirPeticion } from '../_shared/rateLimit.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';
import { falta2Factor, MENSAJE_2FACTOR } from '../_shared/mfa.ts';

initSentry('verifactu-certificado');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CERT_KEY = Deno.env.get('VERIFACTU_CERT_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Un certificado personal pesa unos pocos KB; esto corta abusos sin estorbar a nadie.
const MAX_P12_BASE64 = 150_000;

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);
  if (!CERT_KEY) return json({ error: 'El servidor no tiene configurada la clave de cifrado de certificados.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'No autenticado' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: 'Sesión inválida' }, 401);
  const userId = userData.user.id;
  if (await falta2Factor(admin, token, userId)) return json({ error: MENSAJE_2FACTOR }, 403);

  const { data: perfil } = await admin.from('perfiles').select('rol, empresa_id').eq('id', userId).single();
  if (!perfil?.empresa_id || perfil.rol !== 'admin') {
    return json({ error: 'Solo el administrador de la empresa puede gestionar el certificado.' }, 403);
  }
  const empresaId: string = perfil.empresa_id;

  if (!(await permitirPeticion(admin, `verifactu-cert:${userId}`, 10, 3600))) {
    return json({ error: 'Demasiados intentos. Espera un rato antes de volver a probar.' }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Cuerpo de la petición inválido' }, 400);
  }

  try {
    if (body.accion === 'eliminar') {
      // Sin certificado no se puede enviar: se desactiva el envío a la vez.
      await admin.from('empresas').update({ verifactu_envio_activo: false }).eq('id', empresaId);
      const { error } = await admin.from('empresa_certificados_verifactu').delete().eq('empresa_id', empresaId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.accion === 'subir') {
      const p12Base64 = typeof body.p12Base64 === 'string' ? body.p12Base64 : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!p12Base64 || !password) return json({ error: 'Falta el archivo del certificado o su contraseña.' }, 400);
      if (p12Base64.length > MAX_P12_BASE64) return json({ error: 'El archivo es demasiado grande para ser un certificado.' }, 400);

      let p12: Uint8Array<ArrayBuffer>;
      try {
        p12 = base64ABytes(p12Base64);
      } catch {
        return json({ error: 'El archivo no se ha enviado correctamente.' }, 400);
      }

      let cert;
      try {
        cert = leerP12(p12, password);
      } catch (e) {
        if (e instanceof ErrorCertificado) return json({ error: e.message }, 400);
        throw e;
      }

      const { data: empresa } = await admin.from('empresas').select('nif').eq('id', empresaId).single();
      const nifEmpresa = normalizarNif(empresa?.nif ?? '');
      // Un certificado de representante (administrador) es válido aunque su NIF no sea el de la
      // empresa, así que solo se avisa, no se bloquea.
      const avisoNif = cert.titularNif && nifEmpresa && cert.titularNif !== nifEmpresa
        ? `El certificado es de ${cert.titularNif} y el NIF de la empresa es ${nifEmpresa}. Es válido si esa persona representa a la empresa ante la AEAT.`
        : null;

      const { error } = await admin.from('empresa_certificados_verifactu').upsert({
        empresa_id: empresaId,
        p12_cifrado: await cifrar(p12, CERT_KEY),
        clave_cifrada: await cifrarTexto(password, CERT_KEY),
        titular_nif: cert.titularNif,
        titular_nombre: cert.titularNombre,
        valido_desde: cert.validoDesde.toISOString(),
        valido_hasta: cert.validoHasta.toISOString(),
        subido_en: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 400);

      return json({
        ok: true,
        titularNif: cert.titularNif,
        titularNombre: cert.titularNombre,
        validoDesde: cert.validoDesde.toISOString(),
        validoHasta: cert.validoHasta.toISOString(),
        avisoNif,
      });
    }

    return json({ error: 'Acción no soportada.' }, 400);
  } catch (e) {
    Sentry.captureException(e);
    await Sentry.flush(2000);
    return json({ error: 'Error inesperado al procesar el certificado.' }, 500);
  }
}, CORS_HEADERS));
