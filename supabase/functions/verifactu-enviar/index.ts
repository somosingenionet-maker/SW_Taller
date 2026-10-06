// Envío de los registros de facturación de cada taller a la AEAT (VERI*FACTU).
//
// Dos caminos, igual que enviar-recordatorios:
// 1) Lote automático: lo llama pg_cron/pg_net cada pocos minutos sin usuario
//    interactivo (x-cron-secret) y recorre todas las empresas con el envío
//    activo. Es la red de seguridad de los reintentos.
// 2) Disparo inmediato: lo llama la app justo después de emitir o cancelar una
//    factura (Authorization: Bearer <token de usuario>) y solo trabaja sobre
//    la empresa de ese usuario.
//
// Con { "dryRun": true } construye el XML SOAP de lo pendiente y lo devuelve
// SIN enviarlo y SIN tocar nada, para revisarlo antes de activar el envío.
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { descifrar, descifrarTexto } from '../_shared/cifrado.ts';
import { ErrorCertificado, leerP12 } from '../_shared/certificado.ts';
import { enviarSoap } from '../_shared/aeatCliente.ts';
import { permitirPeticion } from '../_shared/rateLimit.ts';
import { PRODUCTOR, SISTEMA, productorCompleto } from '../_shared/sistemaInformatico.ts';
import {
  construirRegFactu,
  construirRegistro,
  ENDPOINTS,
  envolverSoap,
  normalizarNif,
  parsearRespuesta,
  type Entorno,
  type SistemaInformatico,
} from '../_shared/verifactu.ts';
import {
  aplicarFallo,
  aplicarRespuesta,
  aRegistroParaEnvio,
  construirDatosAlta,
  seleccionarLote,
  TOLERANCIA_RELOJ_MS,
  type Actualizacion,
  type FacturaParaAlta,
  type RegistroDb,
} from './logic.ts';
import { initSentry, conSentry, Sentry } from '../_shared/sentry.ts';

initSentry('verifactu-enviar');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SHARED_SECRET = Deno.env.get('CRON_SHARED_SECRET')!;
const CERT_KEY = Deno.env.get('VERIFACTU_CERT_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Mientras un envío está en marcha sus registros quedan "reservados" para que un
// disparo simultáneo (cron + app) no los envíe dos veces.
const RESERVA_SEGUNDOS = 300;

type Resultado = {
  empresaId: string;
  estado:
    | 'enviado' | 'desactivado' | 'nada_pendiente' | 'esperando' | 'bloqueado_por_rechazo'
    | 'productor_incompleto' | 'certificado_invalido' | 'en_curso' | 'simulado' | 'error';
  mensaje?: string;
  registros?: number;
  aceptados?: number;
  rechazados?: number;
  errores?: number;
  xml?: string;
};

async function procesarEmpresa(admin: SupabaseClient, empresaId: string, dryRun: boolean): Promise<Resultado> {
  const ahora = new Date();
  const { data: emp, error: empErr } = await admin
    .from('empresas')
    .select('id, nombre, razon_social, nif, verifactu_envio_activo, verifactu_entorno, verifactu_numero_instalacion')
    .eq('id', empresaId)
    .single();
  if (empErr || !emp) return { empresaId, estado: 'error', mensaje: 'Empresa no encontrada.' };
  if (!emp.verifactu_envio_activo && !dryRun) return { empresaId, estado: 'desactivado' };
  if (!productorCompleto() && !dryRun) {
    return {
      empresaId,
      estado: 'productor_incompleto',
      mensaje: 'Faltan los datos del productor del software (sistemaInformatico.ts): no se envía nada con una identificación falsa.',
    };
  }

  const { data: regs, error: regsErr } = await admin
    .from('registros_facturacion')
    .select('*')
    .eq('empresa_id', empresaId)
    .in('estado_envio', ['pendiente', 'error', 'rechazado'])
    .order('secuencia', { ascending: true });
  if (regsErr) return { empresaId, estado: 'error', mensaje: regsErr.message };

  const { lote: candidatos, motivo } = seleccionarLote((regs ?? []) as RegistroDb[], dryRun ? new Date(8.64e15) : ahora);
  if (candidatos.length === 0) return { empresaId, estado: motivo ?? 'nada_pendiente' };

  // Datos de las facturas de las altas del lote.
  const altaIds = candidatos.filter((r) => r.tipo === 'alta').map((r) => r.factura_id);
  const facturas = new Map<string, { f: FacturaParaAlta; lineas: string[] }>();
  if (altaIds.length > 0) {
    const { data: fs, error: fErr } = await admin
      .from('facturas')
      .select('id, subtotal, iva_pct, total_iva, total, cliente_nombre_snapshot, cliente_apellidos_snapshot, cliente_nif_snapshot, lineas_factura ( descripcion, posicion )')
      .in('id', altaIds);
    if (fErr) return { empresaId, estado: 'error', mensaje: fErr.message };
    for (const f of fs ?? []) {
      const lineas = ((f.lineas_factura ?? []) as { descripcion: string; posicion: number }[])
        .slice().sort((a, b) => a.posicion - b.posicion).map((l) => l.descripcion);
      facturas.set(f.id, { f: f as FacturaParaAlta, lineas });
    }
  }

  const sif: SistemaInformatico = {
    nombreRazon: PRODUCTOR.nombreRazon,
    nif: PRODUCTOR.nif.toUpperCase(),
    nombreSistema: SISTEMA.nombre,
    idSistema: SISTEMA.id,
    version: SISTEMA.version,
    numeroInstalacion: emp.verifactu_numero_instalacion,
    soloVerifactu: SISTEMA.soloVerifactu,
    multiOT: SISTEMA.multiOT,
    indicadorMultiplesOT: SISTEMA.indicadorMultiplesOT,
  };

  // Se comprueba que cada registro se puede construir ANTES de enviar. El que no
  // se pueda (p. ej. factura sin IVA) se marca como rechazado para que alguien lo
  // revise, y corta el lote ahí: los siguientes dependen de su huella.
  const lote: RegistroDb[] = [];
  const actualizacionesLocales: Actualizacion[] = [];
  for (const r of candidatos) {
    try {
      const datos = r.tipo === 'alta'
        ? (() => {
            const d = facturas.get(r.factura_id);
            if (!d) throw new Error('No se encuentra la factura de este registro.');
            return construirDatosAlta(d.f, d.lineas);
          })()
        : undefined;
      construirRegistro(aRegistroParaEnvio(r, datos), sif);
      lote.push(r);
    } catch (e) {
      actualizacionesLocales.push({
        id: r.id,
        estado_envio: 'rechazado',
        intentos: r.intentos,
        ultimo_intento: ahora.toISOString(),
        proximo_intento: ahora.toISOString(),
        enviado_en: null,
        csv_aeat: null,
        codigo_error: 'LOCAL',
        descripcion_error: e instanceof Error ? e.message : String(e),
      });
      break;
    }
  }

  if (!dryRun) await guardar(admin, actualizacionesLocales);
  if (lote.length === 0) {
    return { empresaId, estado: 'bloqueado_por_rechazo', mensaje: actualizacionesLocales[0]?.descripcion_error ?? undefined };
  }

  const xml = envolverSoap(construirRegFactu(
    { nombreRazon: (emp.razon_social?.trim() || emp.nombre), nif: normalizarNif(emp.nif) },
    lote.map((r) => aRegistroParaEnvio(r, r.tipo === 'alta'
      ? construirDatosAlta(facturas.get(r.factura_id)!.f, facturas.get(r.factura_id)!.lineas)
      : undefined)),
    sif,
  ));

  if (dryRun) return { empresaId, estado: 'simulado', registros: lote.length, xml };

  // Certificado de la empresa.
  if (!CERT_KEY) return { empresaId, estado: 'error', mensaje: 'El servidor no tiene configurada la clave de cifrado de certificados.' };
  const { data: certRow } = await admin
    .from('empresa_certificados_verifactu')
    .select('p12_cifrado, clave_cifrada')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (!certRow) return { empresaId, estado: 'certificado_invalido', mensaje: 'La empresa no tiene certificado cargado.' };

  let certPem: string;
  let keyPem: string;
  try {
    const c = leerP12(await descifrar(certRow.p12_cifrado, CERT_KEY), await descifrarTexto(certRow.clave_cifrada, CERT_KEY));
    certPem = c.certPem;
    keyPem = c.keyPem;
  } catch (e) {
    return {
      empresaId,
      estado: 'certificado_invalido',
      mensaje: e instanceof ErrorCertificado ? e.message : 'No se ha podido leer el certificado guardado.',
    };
  }

  // Reserva del lote: si otro proceso se ha adelantado, aquí no se envía nada.
  const reservaHasta = new Date(ahora.getTime() + RESERVA_SEGUNDOS * 1000).toISOString();
  const { data: reservados, error: reservaErr } = await admin
    .from('registros_facturacion')
    .update({ proximo_intento: reservaHasta })
    .in('id', lote.map((r) => r.id))
    .in('estado_envio', ['pendiente', 'error'])
    .lte('proximo_intento', new Date(ahora.getTime() + TOLERANCIA_RELOJ_MS).toISOString())
    .select('id');
  if (reservaErr) return { empresaId, estado: 'error', mensaje: reservaErr.message };
  if ((reservados ?? []).length !== lote.length) {
    // Se deshace lo que se haya reservado para no dejar registros en espera sin motivo.
    await admin.from('registros_facturacion').update({ proximo_intento: ahora.toISOString() })
      .in('id', (reservados ?? []).map((r: { id: string }) => r.id));
    return { empresaId, estado: 'en_curso' };
  }

  let actualizaciones: Actualizacion[];
  try {
    const { status, texto } = await enviarSoap({
      url: ENDPOINTS[emp.verifactu_entorno as Entorno],
      xml,
      certPem,
      keyPem,
    });
    const resp = parsearRespuesta(texto);
    if (status >= 400 && resp.lineas.length === 0 && !resp.fault) {
      resp.fault = `La AEAT respondió HTTP ${status}.`;
    }
    actualizaciones = aplicarRespuesta(lote, resp, new Date());
  } catch (e) {
    actualizaciones = aplicarFallo(lote, `No se pudo contactar con la AEAT: ${e instanceof Error ? e.message : String(e)}`, new Date());
  }

  await guardar(admin, actualizaciones);

  return {
    empresaId,
    estado: 'enviado',
    registros: lote.length,
    aceptados: actualizaciones.filter((u) => u.estado_envio === 'aceptado' || u.estado_envio === 'aceptado_con_errores').length,
    rechazados: actualizaciones.filter((u) => u.estado_envio === 'rechazado').length,
    errores: actualizaciones.filter((u) => u.estado_envio === 'error').length,
  };
}

async function guardar(admin: SupabaseClient, actualizaciones: Actualizacion[]) {
  for (const { id, ...cambios } of actualizaciones) {
    const { error } = await admin.from('registros_facturacion').update(cambios).eq('id', id);
    if (error) throw new Error(`No se pudo guardar el estado del registro ${id}: ${error.message}`);
  }
}

Deno.serve(conSentry(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método no soportado' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch { /* cuerpo vacío: lote normal */ }
  const dryRun = body.dryRun === true;

  const esCron = !!CRON_SHARED_SECRET && req.headers.get('x-cron-secret') === CRON_SHARED_SECRET;

  let empresaIds: string[];
  if (esCron) {
    if (dryRun) return json({ error: 'dryRun solo está disponible para un usuario de la empresa.' }, 400);
    const { data, error } = await admin.from('empresas').select('id').eq('verifactu_envio_activo', true);
    if (error) return json({ error: error.message }, 500);
    empresaIds = (data ?? []).map((e: { id: string }) => e.id);
  } else {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'No autenticado' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: 'Sesión inválida' }, 401);
    const { data: perfil } = await admin.from('perfiles').select('empresa_id').eq('id', userData.user.id).single();
    if (!perfil?.empresa_id) return json({ error: 'Tu usuario no pertenece a ninguna empresa.' }, 403);
    if (!(await permitirPeticion(admin, `verifactu-enviar:${userData.user.id}`, 30, 60))) {
      return json({ error: 'Demasiadas peticiones, espera un momento.' }, 429);
    }
    empresaIds = [perfil.empresa_id];
  }

  const resultados: Resultado[] = [];
  for (const id of empresaIds) {
    try {
      resultados.push(await procesarEmpresa(admin, id, dryRun));
    } catch (e) {
      // Un fallo en una empresa no debe impedir el envío de las demás.
      Sentry.captureException(e);
      resultados.push({ empresaId: id, estado: 'error', mensaje: e instanceof Error ? e.message : 'Error inesperado' });
    }
  }
  if (resultados.some((r) => r.estado === 'error')) await Sentry.flush(2000);

  return json({ resultados });
}, CORS_HEADERS));
