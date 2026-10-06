// Construcción y lectura de los mensajes del servicio web VERI*FACTU de la
// AEAT. Funciones puras (sin red ni base de datos) para poder probarlas y
// validarlas contra los esquemas XSD oficiales (ver ./aeat-xsd y los tests).
//
// Referencias: especificación técnica del servicio web (SistemaFacturacion.wsdl,
// SuministroInformacion.xsd, SuministroLR.xsd, RespuestaSuministro.xsd) y
// "Detalle de las especificaciones técnicas para generación de la huella".

export const NS_SF =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
export const NS_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

export type Entorno = 'pruebas' | 'produccion';

// Puertos del WSDL oficial "SistemaVerifactu" / "SistemaVerifactuPruebas" (acceso con
// certificado de persona física o jurídica; los de "sello" son otros hosts).
export const ENDPOINTS: Record<Entorno, string> = {
  produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
};

export interface SistemaInformatico {
  nombreRazon: string;
  nif: string;
  nombreSistema: string;
  idSistema: string;
  version: string;
  numeroInstalacion: string;
  soloVerifactu: 'S' | 'N';
  multiOT: 'S' | 'N';
  indicadorMultiplesOT: 'S' | 'N';
}

export interface Destinatario {
  nombre: string;
  /** NIF/NIE/CIF/pasaporte tal como lo tiene el cliente; se normaliza aquí. */
  nif: string;
}

export interface DatosAlta {
  descripcion: string;
  baseImponible: number;
  tipoImpositivo: number;
  cuotaRepercutida: number;
  destinatario: Destinatario;
}

/** Fila de `registros_facturacion` (+ datos de la factura si es un alta). */
export interface RegistroParaEnvio {
  tipo: 'alta' | 'anulacion';
  nifEmisor: string;
  nombreRazonEmisor: string;
  numSerie: string;
  /** YYYY-MM-DD */
  fechaExpedicion: string;
  tipoFactura: string | null;
  cuotaTotal: number | null;
  importeTotal: number | null;
  huella: string;
  huellaAnterior: string | null;
  anteriorNumSerie: string | null;
  anteriorFechaExpedicion: string | null;
  fechaHoraHuso: string;
  alta?: DatosAlta;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** El XSD limita los textos con maxLength; recortar es preferible a que la AEAT rechace el registro. */
function recortar(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

export function fechaDDMMAAAA(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`Fecha inválida (se esperaba AAAA-MM-DD): ${iso}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function importe(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Importe inválido: ${n}`);
  return n.toFixed(2);
}

export function normalizarNif(s: string): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function el(nombre: string, valor: string): string {
  return `<sf:${nombre}>${xmlEscape(valor)}</sf:${nombre}>`;
}

function sistemaInformaticoXml(sif: SistemaInformatico): string {
  return (
    '<sf:SistemaInformatico>' +
    el('NombreRazon', recortar(sif.nombreRazon, 120)) +
    el('NIF', sif.nif) +
    el('NombreSistemaInformatico', recortar(sif.nombreSistema, 30)) +
    el('IdSistemaInformatico', recortar(sif.idSistema, 2)) +
    el('Version', recortar(sif.version, 50)) +
    el('NumeroInstalacion', recortar(sif.numeroInstalacion, 100)) +
    el('TipoUsoPosibleSoloVerifactu', sif.soloVerifactu) +
    el('TipoUsoPosibleMultiOT', sif.multiOT) +
    el('IndicadorMultiplesOT', sif.indicadorMultiplesOT) +
    '</sf:SistemaInformatico>'
  );
}

function encadenamientoXml(r: RegistroParaEnvio): string {
  if (!r.huellaAnterior) {
    return '<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>';
  }
  if (!r.anteriorNumSerie || !r.anteriorFechaExpedicion) {
    throw new Error('Registro encadenado sin los datos del registro anterior.');
  }
  return (
    '<sf:Encadenamiento><sf:RegistroAnterior>' +
    el('IDEmisorFactura', r.nifEmisor) +
    el('NumSerieFactura', recortar(r.anteriorNumSerie, 60)) +
    el('FechaExpedicionFactura', fechaDDMMAAAA(r.anteriorFechaExpedicion)) +
    el('Huella', r.huellaAnterior) +
    '</sf:RegistroAnterior></sf:Encadenamiento>'
  );
}

function destinatarioXml(d: Destinatario): string {
  const nif = normalizarNif(d.nif);
  const identificacion = nif.length === 9
    ? el('NIF', nif)
    // Pasaportes y otros documentos que no son un NIF español de 9 caracteres.
    // IDType 06 = "otro documento probatorio" según el XSD.
    : '<sf:IDOtro>' + el('IDType', '06') + el('ID', recortar((d.nif ?? '').trim() || 'SIN-ID', 20)) + '</sf:IDOtro>';
  return (
    '<sf:Destinatarios><sf:IDDestinatario>' +
    el('NombreRazon', recortar(d.nombre.trim() || 'Cliente', 120)) +
    identificacion +
    '</sf:IDDestinatario></sf:Destinatarios>'
  );
}

export function construirRegistro(r: RegistroParaEnvio, sif: SistemaInformatico): string {
  const fecha = fechaDDMMAAAA(r.fechaExpedicion);

  if (r.tipo === 'anulacion') {
    return (
      '<sf:RegistroAnulacion>' +
      el('IDVersion', '1.0') +
      '<sf:IDFactura>' +
      el('IDEmisorFacturaAnulada', r.nifEmisor) +
      el('NumSerieFacturaAnulada', recortar(r.numSerie, 60)) +
      el('FechaExpedicionFacturaAnulada', fecha) +
      '</sf:IDFactura>' +
      encadenamientoXml(r) +
      sistemaInformaticoXml(sif) +
      el('FechaHoraHusoGenRegistro', r.fechaHoraHuso) +
      el('TipoHuella', '01') +
      el('Huella', r.huella) +
      '</sf:RegistroAnulacion>'
    );
  }

  const a = r.alta;
  if (!a) throw new Error('Un registro de alta necesita los datos de la factura.');
  if (r.cuotaTotal == null || r.importeTotal == null || !r.tipoFactura) {
    throw new Error('Registro de alta incompleto (tipo de factura o totales).');
  }
  // La clasificación fiscal de operaciones exentas/no sujetas no se adivina:
  // hoy Doonty Motor solo emite facturas con IVA repercutido.
  if (!(a.tipoImpositivo > 0)) {
    throw new Error('Factura sin IVA (0 %): todavía no se puede enviar a la AEAT, requiere clasificar la operación como exenta o no sujeta.');
  }

  return (
    '<sf:RegistroAlta>' +
    el('IDVersion', '1.0') +
    '<sf:IDFactura>' +
    el('IDEmisorFactura', r.nifEmisor) +
    el('NumSerieFactura', recortar(r.numSerie, 60)) +
    el('FechaExpedicionFactura', fecha) +
    '</sf:IDFactura>' +
    el('NombreRazonEmisor', recortar(r.nombreRazonEmisor, 120)) +
    el('TipoFactura', r.tipoFactura) +
    el('DescripcionOperacion', recortar(a.descripcion, 500)) +
    destinatarioXml(a.destinatario) +
    '<sf:Desglose><sf:DetalleDesglose>' +
    el('Impuesto', '01') +
    el('ClaveRegimen', '01') +
    el('CalificacionOperacion', 'S1') +
    el('TipoImpositivo', importe(a.tipoImpositivo)) +
    el('BaseImponibleOimporteNoSujeto', importe(a.baseImponible)) +
    el('CuotaRepercutida', importe(a.cuotaRepercutida)) +
    '</sf:DetalleDesglose></sf:Desglose>' +
    el('CuotaTotal', importe(r.cuotaTotal)) +
    el('ImporteTotal', importe(r.importeTotal)) +
    encadenamientoXml(r) +
    sistemaInformaticoXml(sif) +
    el('FechaHoraHusoGenRegistro', r.fechaHoraHuso) +
    el('TipoHuella', '01') +
    el('Huella', r.huella) +
    '</sf:RegistroAlta>'
  );
}

export interface ObligadoEmision {
  nombreRazon: string;
  nif: string;
}

/** Elemento `RegFactuSistemaFacturacion` completo (válido contra SuministroLR.xsd). */
export function construirRegFactu(
  obligado: ObligadoEmision,
  registros: RegistroParaEnvio[],
  sif: SistemaInformatico,
  representante?: ObligadoEmision,
): string {
  if (registros.length === 0) throw new Error('No hay registros que enviar.');
  if (registros.length > 1000) throw new Error('Un envío admite como máximo 1000 registros.');

  const cabecera =
    '<sfLR:Cabecera>' +
    '<sf:ObligadoEmision>' + el('NombreRazon', recortar(obligado.nombreRazon, 120)) + el('NIF', obligado.nif) + '</sf:ObligadoEmision>' +
    (representante
      ? '<sf:Representante>' + el('NombreRazon', recortar(representante.nombreRazon, 120)) + el('NIF', representante.nif) + '</sf:Representante>'
      : '') +
    '</sfLR:Cabecera>';

  const cuerpo = registros
    .map((r) => `<sfLR:RegistroFactura>${construirRegistro(r, sif)}</sfLR:RegistroFactura>`)
    .join('');

  return (
    `<sfLR:RegFactuSistemaFacturacion xmlns:sfLR="${NS_LR}" xmlns:sf="${NS_SF}">` +
    cabecera +
    cuerpo +
    '</sfLR:RegFactuSistemaFacturacion>'
  );
}

export function envolverSoap(regFactu: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}">` +
    '<soapenv:Header/>' +
    `<soapenv:Body>${regFactu}</soapenv:Body>` +
    '</soapenv:Envelope>'
  );
}

// ---------------------------------------------------------------------------
// Respuesta
// ---------------------------------------------------------------------------

export type EstadoRegistroAeat = 'Correcto' | 'AceptadoConErrores' | 'Incorrecto';

export interface RespuestaLinea {
  numSerie: string;
  fechaExpedicion: string;
  tipoOperacion: string;
  estadoRegistro: EstadoRegistroAeat;
  codigoError: string | null;
  descripcionError: string | null;
  /** La AEAT ya tenía este registro (reenvío): no es un fallo, el registro consta. */
  duplicado: boolean;
}

export interface RespuestaEnvio {
  estadoEnvio: 'Correcto' | 'ParcialmenteCorrecto' | 'Incorrecto' | null;
  /** Segundos a esperar antes del siguiente envío (campo TiempoEsperaEnvio). */
  tiempoEsperaEnvio: number | null;
  csv: string | null;
  lineas: RespuestaLinea[];
  /** Mensaje de un SOAP Fault, si la respuesta no es una respuesta de negocio. */
  fault: string | null;
}

function etiqueta(xml: string, nombre: string): string | null {
  const m = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`).exec(xml);
  return m ? desescapar(m[1].trim()) : null;
}

function desescapar(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parsearRespuesta(xml: string): RespuestaEnvio {
  const fault = etiqueta(xml, 'faultstring');
  const estadoEnvio = etiqueta(xml, 'EstadoEnvio') as RespuestaEnvio['estadoEnvio'];
  const espera = etiqueta(xml, 'TiempoEsperaEnvio');

  const lineas: RespuestaLinea[] = [];
  const re = /<(?:[\w-]+:)?RespuestaLinea(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?RespuestaLinea>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const bloque = m[1];
    const idFactura = etiqueta(bloque, 'IDFactura') ?? '';
    lineas.push({
      numSerie: etiqueta(idFactura, 'NumSerieFactura') ?? '',
      fechaExpedicion: etiqueta(idFactura, 'FechaExpedicionFactura') ?? '',
      tipoOperacion: etiqueta(etiqueta(bloque, 'Operacion') ?? '', 'TipoOperacion') ?? '',
      estadoRegistro: (etiqueta(bloque, 'EstadoRegistro') ?? 'Incorrecto') as EstadoRegistroAeat,
      codigoError: etiqueta(bloque, 'CodigoErrorRegistro'),
      descripcionError: etiqueta(bloque, 'DescripcionErrorRegistro'),
      duplicado: etiqueta(bloque, 'RegistroDuplicado') !== null,
    });
  }

  return {
    estadoEnvio: estadoEnvio ?? null,
    tiempoEsperaEnvio: espera !== null && /^\d+$/.test(espera) ? parseInt(espera, 10) : null,
    csv: etiqueta(xml, 'CSV'),
    lineas,
    fault,
  };
}

export type EstadoEnvioDb = 'aceptado' | 'aceptado_con_errores' | 'rechazado';

export function estadoDbDeLinea(l: RespuestaLinea): EstadoEnvioDb {
  if (l.duplicado) return 'aceptado';
  if (l.estadoRegistro === 'Correcto') return 'aceptado';
  if (l.estadoRegistro === 'AceptadoConErrores') return 'aceptado_con_errores';
  return 'rechazado';
}

/** Descripción corta de lo que ha dicho la AEAT sobre un registro, para mostrar en pantalla. */
export function descripcionDeLinea(l: RespuestaLinea): string | null {
  if (l.duplicado) return 'La AEAT ya tenía este registro.';
  if (l.estadoRegistro === 'Correcto') return null;
  return [l.codigoError ? `Error ${l.codigoError}` : null, l.descripcionError].filter(Boolean).join(': ') || null;
}

/** Espera mínima (s) entre envíos si la AEAT no indica otra: lo fija TiempoEsperaEnvio, 60 s es su valor por defecto. */
export const ESPERA_POR_DEFECTO_SEGUNDOS = 60;

/** Reintento con espera creciente (1, 2, 4... min) con tope de 1 hora. */
export function segundosHastaReintento(intentos: number): number {
  return Math.min(60 * 2 ** Math.max(0, intentos - 1), 3600);
}
