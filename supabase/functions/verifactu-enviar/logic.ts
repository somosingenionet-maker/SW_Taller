// Lógica pura del envío de registros de facturación a la AEAT (sin red ni
// base de datos): qué registros toca enviar, qué actualizar tras la respuesta.
import {
  descripcionDeLinea,
  ESPERA_POR_DEFECTO_SEGUNDOS,
  estadoDbDeLinea,
  segundosHastaReintento,
  type DatosAlta,
  type RegistroParaEnvio,
  type RespuestaEnvio,
} from '../_shared/verifactu.ts';

export type EstadoEnvio = 'pendiente' | 'aceptado' | 'aceptado_con_errores' | 'rechazado' | 'error';

export interface RegistroDb {
  id: string;
  empresa_id: string;
  factura_id: string;
  secuencia: number;
  tipo: 'alta' | 'anulacion';
  nif_emisor: string;
  nombre_razon_emisor: string;
  num_serie: string;
  /** YYYY-MM-DD */
  fecha_expedicion: string;
  tipo_factura: string | null;
  cuota_total: number | string | null;
  importe_total: number | string | null;
  huella: string;
  huella_anterior: string | null;
  anterior_num_serie: string | null;
  anterior_fecha_expedicion: string | null;
  fecha_hora_huso: string;
  estado_envio: EstadoEnvio;
  intentos: number;
  proximo_intento: string;
}

export interface Actualizacion {
  id: string;
  estado_envio: EstadoEnvio;
  intentos: number;
  ultimo_intento: string;
  proximo_intento: string;
  enviado_en: string | null;
  csv_aeat: string | null;
  codigo_error: string | null;
  descripcion_error: string | null;
}

/**
 * El `proximo_intento` de un registro recién creado lo pone el reloj de la base de datos y
 * aquí se compara con el reloj de la función: unos segundos de diferencia no deben hacer
 * que un registro acabado de emitir parezca "todavía en espera".
 */
export const TOLERANCIA_RELOJ_MS = 5_000;

export type MotivoSinLote = 'nada_pendiente' | 'bloqueado_por_rechazo' | 'esperando';

/**
 * Los registros deben llegar a la AEAT EN ORDEN (cada uno referencia la huella
 * del anterior). Se toma el tramo inicial de registros pendientes ya
 * "vencidos" (proximo_intento <= ahora); si el primero pendiente está
 * rechazado o aún en espera, no se adelanta nada.
 *
 * `registros` son los de la empresa que aún no se han aceptado, ordenados por
 * secuencia (pendiente, error y rechazado).
 */
export function seleccionarLote(
  registros: RegistroDb[],
  ahora: Date,
  max = 100,
): { lote: RegistroDb[]; motivo: MotivoSinLote | null } {
  const ordenados = registros.slice().sort((a, b) => a.secuencia - b.secuencia);
  if (ordenados.length === 0) return { lote: [], motivo: 'nada_pendiente' };
  if (ordenados[0].estado_envio === 'rechazado') return { lote: [], motivo: 'bloqueado_por_rechazo' };

  const lote: RegistroDb[] = [];
  for (const r of ordenados) {
    if (r.estado_envio === 'rechazado') break;
    if (new Date(r.proximo_intento).getTime() > ahora.getTime() + TOLERANCIA_RELOJ_MS) break;
    lote.push(r);
    if (lote.length >= max) break;
  }
  return lote.length === 0 ? { lote, motivo: 'esperando' } : { lote, motivo: null };
}

export interface FacturaParaAlta {
  subtotal: number | string;
  iva_pct: number | string;
  total_iva: number | string;
  total: number | string;
  cliente_nombre_snapshot: string | null;
  cliente_apellidos_snapshot: string | null;
  cliente_nif_snapshot: string | null;
}

export function construirDatosAlta(f: FacturaParaAlta, descripcionesLineas: string[]): DatosAlta {
  const descripcion = descripcionesLineas.map((d) => d.trim()).filter(Boolean).join('; ').slice(0, 500) || 'Servicios de taller';
  return {
    descripcion,
    baseImponible: Number(f.subtotal),
    tipoImpositivo: Number(f.iva_pct),
    cuotaRepercutida: Number(f.total_iva),
    destinatario: {
      nombre: `${f.cliente_nombre_snapshot ?? ''} ${f.cliente_apellidos_snapshot ?? ''}`.trim(),
      nif: f.cliente_nif_snapshot ?? '',
    },
  };
}

export function aRegistroParaEnvio(r: RegistroDb, alta?: DatosAlta): RegistroParaEnvio {
  return {
    tipo: r.tipo,
    nifEmisor: r.nif_emisor,
    nombreRazonEmisor: r.nombre_razon_emisor,
    numSerie: r.num_serie,
    fechaExpedicion: r.fecha_expedicion,
    tipoFactura: r.tipo_factura,
    cuotaTotal: r.cuota_total == null ? null : Number(r.cuota_total),
    importeTotal: r.importe_total == null ? null : Number(r.importe_total),
    huella: r.huella,
    huellaAnterior: r.huella_anterior,
    anteriorNumSerie: r.anterior_num_serie,
    anteriorFechaExpedicion: r.anterior_fecha_expedicion,
    fechaHoraHuso: r.fecha_hora_huso,
    alta,
  };
}

function enSegundos(ahora: Date, s: number): string {
  return new Date(ahora.getTime() + s * 1000).toISOString();
}

/** El envío no llegó a la AEAT (red, certificado rechazado, SOAP Fault...): todos reintentan con espera creciente. */
export function aplicarFallo(lote: RegistroDb[], mensaje: string, ahora: Date): Actualizacion[] {
  return lote.map((r) => {
    const intentos = r.intentos + 1;
    return {
      id: r.id,
      estado_envio: 'error' as const,
      intentos,
      ultimo_intento: ahora.toISOString(),
      proximo_intento: enSegundos(ahora, segundosHastaReintento(intentos)),
      enviado_en: null,
      csv_aeat: null,
      codigo_error: null,
      descripcion_error: mensaje.slice(0, 1500),
    };
  });
}

/** Traduce la respuesta de la AEAT, registro a registro. */
export function aplicarRespuesta(lote: RegistroDb[], resp: RespuestaEnvio, ahora: Date): Actualizacion[] {
  if (resp.fault || resp.lineas.length === 0) {
    return aplicarFallo(lote, resp.fault ?? 'La AEAT no devolvió el resultado de ningún registro.', ahora);
  }
  const espera = resp.tiempoEsperaEnvio ?? ESPERA_POR_DEFECTO_SEGUNDOS;

  return lote.map((r) => {
    const intentos = r.intentos + 1;
    // Una factura aparece una vez como alta y, si se cancela, otra como anulación:
    // se casa por número de serie y por tipo de operación.
    const l = resp.lineas.find((x) =>
      x.numSerie === r.num_serie &&
      (x.tipoOperacion === '' || x.tipoOperacion.toLowerCase() === (r.tipo === 'alta' ? 'alta' : 'anulacion')),
    ) ?? resp.lineas.find((x) => x.numSerie === r.num_serie);

    if (!l) {
      return {
        id: r.id,
        estado_envio: 'error' as const,
        intentos,
        ultimo_intento: ahora.toISOString(),
        proximo_intento: enSegundos(ahora, segundosHastaReintento(intentos)),
        enviado_en: null,
        csv_aeat: null,
        codigo_error: null,
        descripcion_error: 'La respuesta de la AEAT no incluye este registro.',
      };
    }

    const estado = estadoDbDeLinea(l);
    return {
      id: r.id,
      estado_envio: estado,
      intentos,
      ultimo_intento: ahora.toISOString(),
      // Los aceptados ya no se vuelven a enviar; un rechazo bloquea la cadena hasta que alguien lo revise.
      proximo_intento: enSegundos(ahora, estado === 'rechazado' ? 0 : espera),
      enviado_en: estado === 'rechazado' ? null : ahora.toISOString(),
      csv_aeat: estado === 'rechazado' ? null : resp.csv,
      codigo_error: estado === 'aceptado' ? null : l.codigoError,
      descripcion_error: descripcionDeLinea(l),
    };
  });
}
