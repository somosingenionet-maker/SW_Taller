import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  construirRegFactu,
  construirRegistro,
  descripcionDeLinea,
  envolverSoap,
  estadoDbDeLinea,
  fechaDDMMAAAA,
  importe,
  normalizarNif,
  parsearRespuesta,
  segundosHastaReintento,
  xmlEscape,
  type RegistroParaEnvio,
  type SistemaInformatico,
} from './verifactu.ts';

// Los tests validan el XML generado contra los XSD oficiales de la AEAT (copiados
// en ./aeat-xsd) con `xmllint`. Si xmllint no está instalado se omiten esas
// validaciones, no las demás comprobaciones.
const XSD = new URL('./aeat-xsd/', import.meta.url).pathname;

async function hayXmllint(): Promise<boolean> {
  try {
    const { success } = await new Deno.Command('xmllint', { args: ['--version'], stdout: 'null', stderr: 'null' }).output();
    return success;
  } catch {
    return false;
  }
}
const XMLLINT = await hayXmllint();

async function validar(xml: string, esquema: string): Promise<string> {
  const f = await Deno.makeTempFile({ suffix: '.xml' });
  try {
    await Deno.writeTextFile(f, xml);
    const out = await new Deno.Command('xmllint', {
      args: ['--noout', '--schema', XSD + esquema, f],
      stdout: 'piped',
      stderr: 'piped',
    }).output();
    return new TextDecoder().decode(out.stderr) + new TextDecoder().decode(out.stdout);
  } finally {
    await Deno.remove(f);
  }
}

async function assertValido(xml: string, esquema = 'SuministroLR.xsd') {
  if (!XMLLINT) return;
  const salida = await validar(xml, esquema);
  assert(salida.includes('validates'), `El XML no valida contra ${esquema}:\n${salida}\n${xml}`);
}

const SIF: SistemaInformatico = {
  nombreRazon: 'Productor de Prueba',
  nif: '12345678Z',
  nombreSistema: 'Doonty Motor',
  idSistema: 'DM',
  version: '1.0.0',
  numeroInstalacion: 'inst-0001',
  soloVerifactu: 'S',
  multiOT: 'S',
  indicadorMultiplesOT: 'S',
};

const ALTA1: RegistroParaEnvio = {
  tipo: 'alta',
  nifEmisor: 'B89419102',
  nombreRazonEmisor: 'Taller Ejemplo S.L.',
  numSerie: 'FAC-0001',
  fechaExpedicion: '2026-10-06',
  tipoFactura: 'F1',
  cuotaTotal: 21,
  importeTotal: 121,
  huella: '27EED58038E49C5CA076A61F4E88CF0D6C90F56263E3BD5C7CE18D77092E9D42',
  huellaAnterior: null,
  anteriorNumSerie: null,
  anteriorFechaExpedicion: null,
  fechaHoraHuso: '2026-10-06T22:55:19+02:00',
  alta: {
    descripcion: 'Cambio de aceite y filtros',
    baseImponible: 100,
    tipoImpositivo: 21,
    cuotaRepercutida: 21,
    destinatario: { nombre: 'Ana Pérez', nif: '12345678-Z' },
  },
};

const ALTA2: RegistroParaEnvio = {
  ...ALTA1,
  numSerie: 'FAC-0002',
  cuotaTotal: 10.5,
  importeTotal: 60.5,
  huella: 'ECD397BDE6DB448D1279A00E8E628E9D0FE7B0759555844FC1D9C57EBA2A162D',
  huellaAnterior: ALTA1.huella,
  anteriorNumSerie: 'FAC-0001',
  anteriorFechaExpedicion: '2026-10-06',
  alta: { ...ALTA1.alta!, baseImponible: 50, cuotaRepercutida: 10.5 },
};

const ANULACION: RegistroParaEnvio = {
  tipo: 'anulacion',
  nifEmisor: 'B89419102',
  nombreRazonEmisor: 'Taller Ejemplo S.L.',
  numSerie: 'FAC-0001',
  fechaExpedicion: '2026-10-06',
  tipoFactura: null,
  cuotaTotal: null,
  importeTotal: null,
  huella: '99BBDF38F2967CA1B758E1DEDB25995665148949454C7B330DE3B6BB2F3312E4',
  huellaAnterior: ALTA2.huella,
  anteriorNumSerie: 'FAC-0002',
  anteriorFechaExpedicion: '2026-10-06',
  fechaHoraHuso: '2026-10-06T22:55:19+02:00',
};

const OBLIGADO = { nombreRazon: 'Taller Ejemplo S.L.', nif: 'B89419102' };

// -------- Construcción: validación contra el XSD oficial --------
Deno.test('primer registro de alta: valida contra SuministroLR.xsd', async () => {
  await assertValido(construirRegFactu(OBLIGADO, [ALTA1], SIF));
});

Deno.test('lote alta + alta encadenada + anulación: valida contra el XSD', async () => {
  await assertValido(construirRegFactu(OBLIGADO, [ALTA1, ALTA2, ANULACION], SIF));
});

Deno.test('destinatario con pasaporte (no es un NIF de 9 caracteres) usa IDOtro y valida', async () => {
  const r = { ...ALTA1, alta: { ...ALTA1.alta!, destinatario: { nombre: 'John Smith', nif: 'X1234567' } } };
  const xml = construirRegFactu(OBLIGADO, [r], SIF);
  assert(xml.includes('<sf:IDOtro>'));
  await assertValido(xml);
});

Deno.test('con representante en la cabecera sigue validando', async () => {
  await assertValido(construirRegFactu(OBLIGADO, [ALTA1], SIF, { nombreRazon: 'Gestoría X', nif: '12345678Z' }));
});

Deno.test('los caracteres especiales se escapan y el XML sigue siendo válido', async () => {
  const r = {
    ...ALTA1,
    numSerie: 'F&C<1>',
    alta: { ...ALTA1.alta!, descripcion: 'Rueda "delantera" & más <urgente>', destinatario: { nombre: "O'Brien & Hijos", nif: '12345678Z' } },
  };
  const xml = construirRegFactu(OBLIGADO, [r], SIF);
  assert(!xml.includes('F&C<1>'));
  assert(xml.includes('F&amp;C&lt;1&gt;'));
  await assertValido(xml);
});

Deno.test('el envoltorio SOAP contiene el elemento y es XML bien formado', async () => {
  const xml = envolverSoap(construirRegFactu(OBLIGADO, [ALTA1], SIF));
  assert(xml.startsWith('<?xml'));
  assert(xml.includes('<soapenv:Body><sfLR:RegFactuSistemaFacturacion'));
  if (XMLLINT) {
    const f = await Deno.makeTempFile({ suffix: '.xml' });
    await Deno.writeTextFile(f, xml);
    const { success } = await new Deno.Command('xmllint', { args: ['--noout', f], stdout: 'null', stderr: 'null' }).output();
    await Deno.remove(f);
    assert(success, 'El SOAP no es XML bien formado');
  }
});

Deno.test('el encadenamiento: primer registro vs registro anterior', () => {
  assert(construirRegistro(ALTA1, SIF).includes('<sf:PrimerRegistro>S</sf:PrimerRegistro>'));
  const encadenado = construirRegistro(ALTA2, SIF);
  assert(encadenado.includes('<sf:RegistroAnterior>'));
  assert(encadenado.includes(`<sf:Huella>${ALTA1.huella}</sf:Huella></sf:RegistroAnterior>`));
  assert(encadenado.includes('<sf:FechaExpedicionFactura>06-10-2026</sf:FechaExpedicionFactura><sf:Huella>'));
});

Deno.test('la huella y la fecha-hora del registro se envían tal cual se calcularon', () => {
  const xml = construirRegistro(ALTA1, SIF);
  assert(xml.includes(`<sf:Huella>${ALTA1.huella}</sf:Huella></sf:RegistroAlta>`));
  assert(xml.includes('<sf:FechaHoraHusoGenRegistro>2026-10-06T22:55:19+02:00</sf:FechaHoraHusoGenRegistro>'));
  assert(xml.includes('<sf:TipoHuella>01</sf:TipoHuella>'));
});

Deno.test('rechaza lo que no se puede enviar sin inventar datos', () => {
  assertThrows(() => construirRegFactu(OBLIGADO, [], SIF), Error, 'No hay registros');
  assertThrows(
    () => construirRegistro({ ...ALTA1, alta: { ...ALTA1.alta!, tipoImpositivo: 0, cuotaRepercutida: 0 } }, SIF),
    Error,
    'sin IVA',
  );
  assertThrows(() => construirRegistro({ ...ALTA1, alta: undefined }, SIF), Error, 'datos de la factura');
  assertThrows(() => construirRegistro({ ...ALTA2, anteriorNumSerie: null }, SIF), Error, 'registro anterior');
});

// -------- Utilidades --------
Deno.test('fechaDDMMAAAA, importe, normalizarNif, xmlEscape', () => {
  assertEquals(fechaDDMMAAAA('2024-01-05'), '05-01-2024');
  assertThrows(() => fechaDDMMAAAA('05/01/2024'));
  assertEquals(importe(21), '21.00');
  assertEquals(importe(10.5), '10.50');
  assertEquals(normalizarNif('b-89419102 '), 'B89419102');
  assertEquals(xmlEscape(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
});

Deno.test('segundosHastaReintento: espera creciente con tope de una hora', () => {
  assertEquals(segundosHastaReintento(1), 60);
  assertEquals(segundosHastaReintento(2), 120);
  assertEquals(segundosHastaReintento(3), 240);
  assertEquals(segundosHastaReintento(20), 3600);
});

// -------- Respuesta de la AEAT --------
const SFR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';
const NS_SF = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

function linea(num: string, estado: string, extra = '', operacion = 'Alta') {
  return (
    '<sfR:RespuestaLinea>' +
    `<sfR:IDFactura><sf:IDEmisorFactura>B89419102</sf:IDEmisorFactura><sf:NumSerieFactura>${num}</sf:NumSerieFactura><sf:FechaExpedicionFactura>06-10-2026</sf:FechaExpedicionFactura></sfR:IDFactura>` +
    `<sfR:Operacion><sf:TipoOperacion>${operacion}</sf:TipoOperacion></sfR:Operacion>` +
    `<sfR:EstadoRegistro>${estado}</sfR:EstadoRegistro>` +
    extra +
    '</sfR:RespuestaLinea>'
  );
}

function respuesta(estadoEnvio: string, lineas: string, csv = 'A-ABC12345') {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Header/><env:Body>' +
    `<sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="${SFR}" xmlns:sf="${NS_SF}">` +
    `<sfR:CSV>${csv}</sfR:CSV>` +
    '<sfR:Cabecera><sf:ObligadoEmision><sf:NombreRazon>Taller Ejemplo S.L.</sf:NombreRazon><sf:NIF>B89419102</sf:NIF></sf:ObligadoEmision></sfR:Cabecera>' +
    '<sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio>' +
    `<sfR:EstadoEnvio>${estadoEnvio}</sfR:EstadoEnvio>` +
    lineas +
    '</sfR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>'
  );
}

Deno.test('respuesta correcta: estado, CSV, tiempo de espera y líneas', () => {
  const r = parsearRespuesta(respuesta('Correcto', linea('FAC-0001', 'Correcto') + linea('FAC-0002', 'Correcto')));
  assertEquals(r.estadoEnvio, 'Correcto');
  assertEquals(r.csv, 'A-ABC12345');
  assertEquals(r.tiempoEsperaEnvio, 60);
  assertEquals(r.lineas.length, 2);
  assertEquals(r.lineas[0].numSerie, 'FAC-0001');
  assertEquals(r.lineas[0].tipoOperacion, 'Alta');
  assertEquals(estadoDbDeLinea(r.lineas[0]), 'aceptado');
  assertEquals(descripcionDeLinea(r.lineas[0]), null);
  assertEquals(r.fault, null);
});

Deno.test('respuesta parcialmente correcta: cada registro conserva su propio estado', () => {
  const err =
    '<sfR:CodigoErrorRegistro>1100</sfR:CodigoErrorRegistro>' +
    '<sfR:DescripcionErrorRegistro>Valor de campo erróneo &amp; revisar</sfR:DescripcionErrorRegistro>';
  const r = parsearRespuesta(
    respuesta('ParcialmenteCorrecto', linea('FAC-0001', 'Correcto') + linea('FAC-0002', 'Incorrecto', err) + linea('FAC-0003', 'AceptadoConErrores', err)),
  );
  assertEquals(r.estadoEnvio, 'ParcialmenteCorrecto');
  assertEquals(r.lineas.map(estadoDbDeLinea), ['aceptado', 'rechazado', 'aceptado_con_errores']);
  assertEquals(descripcionDeLinea(r.lineas[1]), 'Error 1100: Valor de campo erróneo & revisar');
});

Deno.test('un registro duplicado cuenta como aceptado: la AEAT ya lo tenía', () => {
  const dup =
    '<sfR:CodigoErrorRegistro>3000</sfR:CodigoErrorRegistro>' +
    '<sfR:DescripcionErrorRegistro>Registro de facturación duplicado</sfR:DescripcionErrorRegistro>' +
    '<sfR:RegistroDuplicado><sf:IdPeticionRegistroDuplicado>1</sf:IdPeticionRegistroDuplicado><sf:EstadoRegistroDuplicado>Correcta</sf:EstadoRegistroDuplicado></sfR:RegistroDuplicado>';
  const r = parsearRespuesta(respuesta('ParcialmenteCorrecto', linea('FAC-0001', 'Incorrecto', dup)));
  assertEquals(r.lineas[0].duplicado, true);
  assertEquals(estadoDbDeLinea(r.lineas[0]), 'aceptado');
  assertEquals(descripcionDeLinea(r.lineas[0]), 'La AEAT ya tenía este registro.');
});

Deno.test('una respuesta de ejemplo bien formada valida contra RespuestaSuministro.xsd (el parser lee respuestas reales)', async () => {
  const xml = respuesta('Correcto', linea('FAC-0001', 'Correcto'));
  const cuerpo = /<env:Body>([\s\S]*)<\/env:Body>/.exec(xml)![1];
  await assertValido(cuerpo, 'RespuestaSuministro.xsd');
});

Deno.test('un SOAP Fault se detecta y no se confunde con una respuesta de negocio', () => {
  const r = parsearRespuesta(
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><soapenv:Fault><faultcode>soapenv:Client</faultcode><faultstring>Certificado no válido</faultstring></soapenv:Fault></soapenv:Body></soapenv:Envelope>',
  );
  assertEquals(r.fault, 'Certificado no válido');
  assertEquals(r.estadoEnvio, null);
  assertEquals(r.lineas.length, 0);
});
