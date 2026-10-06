import { assertEquals } from 'jsr:@std/assert@1';
import {
  aplicarFallo,
  aplicarRespuesta,
  aRegistroParaEnvio,
  construirDatosAlta,
  seleccionarLote,
  type RegistroDb,
} from './logic.ts';
import { parsearRespuesta } from '../_shared/verifactu.ts';

const AHORA = new Date('2026-10-06T20:00:00Z');
const PASADO = '2026-10-06T19:00:00Z';
const FUTURO = '2026-10-06T21:00:00Z';

function reg(secuencia: number, o: Partial<RegistroDb> = {}): RegistroDb {
  return {
    id: `r${secuencia}`,
    empresa_id: 'e1',
    factura_id: `f${secuencia}`,
    secuencia,
    tipo: 'alta',
    nif_emisor: 'B89419102',
    nombre_razon_emisor: 'Taller Ejemplo S.L.',
    num_serie: `FAC-000${secuencia}`,
    fecha_expedicion: '2026-10-06',
    tipo_factura: 'F1',
    cuota_total: '21.00',
    importe_total: '121.00',
    huella: 'H'.repeat(64),
    huella_anterior: secuencia === 1 ? null : 'A'.repeat(64),
    anterior_num_serie: secuencia === 1 ? null : `FAC-000${secuencia - 1}`,
    anterior_fecha_expedicion: secuencia === 1 ? null : '2026-10-06',
    fecha_hora_huso: '2026-10-06T22:00:00+02:00',
    estado_envio: 'pendiente',
    intentos: 0,
    proximo_intento: PASADO,
    ...o,
  };
}

// -------- seleccionarLote --------
Deno.test('seleccionarLote: sin registros no hay nada que enviar', () => {
  assertEquals(seleccionarLote([], AHORA), { lote: [], motivo: 'nada_pendiente' });
});

Deno.test('seleccionarLote: toma los pendientes vencidos, en orden de secuencia aunque lleguen desordenados', () => {
  const { lote, motivo } = seleccionarLote([reg(3), reg(1), reg(2)], AHORA);
  assertEquals(lote.map((r) => r.secuencia), [1, 2, 3]);
  assertEquals(motivo, null);
});

Deno.test('seleccionarLote: respeta el máximo por envío', () => {
  const muchos = Array.from({ length: 10 }, (_, i) => reg(i + 1));
  assertEquals(seleccionarLote(muchos, AHORA, 4).lote.map((r) => r.secuencia), [1, 2, 3, 4]);
});

Deno.test('seleccionarLote: si el primero aún está en espera no se adelanta ninguno posterior (la cadena exige orden)', () => {
  const r = seleccionarLote([reg(1, { proximo_intento: FUTURO }), reg(2)], AHORA);
  assertEquals(r.lote, []);
  assertEquals(r.motivo, 'esperando');
});

Deno.test('seleccionarLote: un registro "del futuro" por unos segundos de desfase de reloj cuenta como vencido', () => {
  const casi = new Date(AHORA.getTime() + 3_000).toISOString();
  assertEquals(seleccionarLote([reg(1, { proximo_intento: casi })], AHORA).lote.length, 1);
  const lejos = new Date(AHORA.getTime() + 30_000).toISOString();
  assertEquals(seleccionarLote([reg(1, { proximo_intento: lejos })], AHORA).lote.length, 0);
});

Deno.test('seleccionarLote: se detiene en el primer registro en espera, sin saltárselo', () => {
  const r = seleccionarLote([reg(1), reg(2, { proximo_intento: FUTURO }), reg(3)], AHORA);
  assertEquals(r.lote.map((x) => x.secuencia), [1]);
});

Deno.test('seleccionarLote: un registro rechazado bloquea todo lo posterior hasta que se revise', () => {
  const r = seleccionarLote([reg(1, { estado_envio: 'rechazado' }), reg(2), reg(3)], AHORA);
  assertEquals(r.lote, []);
  assertEquals(r.motivo, 'bloqueado_por_rechazo');
});

Deno.test('seleccionarLote: reintenta los que fallaron por error de red', () => {
  const r = seleccionarLote([reg(1, { estado_envio: 'error', intentos: 2 }), reg(2)], AHORA);
  assertEquals(r.lote.map((x) => x.secuencia), [1, 2]);
});

// -------- construirDatosAlta / aRegistroParaEnvio --------
Deno.test('construirDatosAlta: junta las líneas, recorta a 500 y pone un texto por defecto', () => {
  const f = { subtotal: '100.00', iva_pct: '21.00', total_iva: '21.00', total: '121.00',
    cliente_nombre_snapshot: 'Ana', cliente_apellidos_snapshot: 'Pérez', cliente_nif_snapshot: '12345678Z' };
  const a = construirDatosAlta(f, ['Cambio de aceite', '  Filtro  ', '']);
  assertEquals(a.descripcion, 'Cambio de aceite; Filtro');
  assertEquals(a.baseImponible, 100);
  assertEquals(a.tipoImpositivo, 21);
  assertEquals(a.cuotaRepercutida, 21);
  assertEquals(a.destinatario, { nombre: 'Ana Pérez', nif: '12345678Z' });
  assertEquals(construirDatosAlta(f, []).descripcion, 'Servicios de taller');
  assertEquals(construirDatosAlta(f, ['x'.repeat(900)]).descripcion.length, 500);
});

Deno.test('aRegistroParaEnvio: convierte los numeric que llegan como texto', () => {
  const p = aRegistroParaEnvio(reg(2));
  assertEquals(p.cuotaTotal, 21);
  assertEquals(p.importeTotal, 121);
  assertEquals(p.huellaAnterior, 'A'.repeat(64));
  assertEquals(p.anteriorNumSerie, 'FAC-0001');
});

// -------- aplicarFallo --------
Deno.test('aplicarFallo: marca error, suma el intento y espera cada vez más', () => {
  const [u1, u2] = aplicarFallo([reg(1), reg(2, { intentos: 3 })], 'Sin conexión', AHORA);
  assertEquals(u1.estado_envio, 'error');
  assertEquals(u1.intentos, 1);
  assertEquals(u1.proximo_intento, '2026-10-06T20:01:00.000Z');
  assertEquals(u2.intentos, 4);
  assertEquals(u2.proximo_intento, '2026-10-06T20:08:00.000Z');
  assertEquals(u1.descripcion_error, 'Sin conexión');
  assertEquals(u1.enviado_en, null);
});

// -------- aplicarRespuesta --------
const SFR = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';
const NS_SF = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
function xmlLinea(num: string, estado: string, op = 'Alta', extra = '') {
  return `<sfR:RespuestaLinea><sfR:IDFactura><sf:IDEmisorFactura>B89419102</sf:IDEmisorFactura><sf:NumSerieFactura>${num}</sf:NumSerieFactura><sf:FechaExpedicionFactura>06-10-2026</sf:FechaExpedicionFactura></sfR:IDFactura><sfR:Operacion><sf:TipoOperacion>${op}</sf:TipoOperacion></sfR:Operacion><sfR:EstadoRegistro>${estado}</sfR:EstadoRegistro>${extra}</sfR:RespuestaLinea>`;
}
function xmlResp(estadoEnvio: string, lineas: string, espera = 60) {
  return `<r xmlns:sfR="${SFR}" xmlns:sf="${NS_SF}"><sfR:CSV>A-CSV1</sfR:CSV><sfR:TiempoEsperaEnvio>${espera}</sfR:TiempoEsperaEnvio><sfR:EstadoEnvio>${estadoEnvio}</sfR:EstadoEnvio>${lineas}</r>`;
}

Deno.test('aplicarRespuesta: todo correcto → aceptados, con CSV y espera de la AEAT', () => {
  const resp = parsearRespuesta(xmlResp('Correcto', xmlLinea('FAC-0001', 'Correcto') + xmlLinea('FAC-0002', 'Correcto'), 90));
  const [u1, u2] = aplicarRespuesta([reg(1), reg(2)], resp, AHORA);
  assertEquals(u1.estado_envio, 'aceptado');
  assertEquals(u1.csv_aeat, 'A-CSV1');
  assertEquals(u1.enviado_en, AHORA.toISOString());
  assertEquals(u1.codigo_error, null);
  assertEquals(u2.proximo_intento, '2026-10-06T20:01:30.000Z');
});

Deno.test('aplicarRespuesta: parcialmente correcto → cada registro con su estado, el rechazado sin CSV ni fecha de envío', () => {
  const err = '<sfR:CodigoErrorRegistro>1100</sfR:CodigoErrorRegistro><sfR:DescripcionErrorRegistro>Dato erróneo</sfR:DescripcionErrorRegistro>';
  const resp = parsearRespuesta(xmlResp('ParcialmenteCorrecto',
    xmlLinea('FAC-0001', 'Correcto') + xmlLinea('FAC-0002', 'Incorrecto', 'Alta', err) + xmlLinea('FAC-0003', 'AceptadoConErrores', 'Alta', err)));
  const [u1, u2, u3] = aplicarRespuesta([reg(1), reg(2), reg(3)], resp, AHORA);
  assertEquals([u1.estado_envio, u2.estado_envio, u3.estado_envio], ['aceptado', 'rechazado', 'aceptado_con_errores']);
  assertEquals(u2.csv_aeat, null);
  assertEquals(u2.enviado_en, null);
  assertEquals(u2.codigo_error, '1100');
  assertEquals(u2.descripcion_error, 'Error 1100: Dato erróneo');
  assertEquals(u3.enviado_en, AHORA.toISOString());
});

Deno.test('aplicarRespuesta: alta y anulación de la misma factura se casan cada una con su línea', () => {
  const resp = parsearRespuesta(xmlResp('Correcto', xmlLinea('FAC-0001', 'Correcto', 'Alta') + xmlLinea('FAC-0001', 'Incorrecto', 'Anulacion',
    '<sfR:CodigoErrorRegistro>2000</sfR:CodigoErrorRegistro>')));
  const [alta, anulacion] = aplicarRespuesta([reg(1), reg(2, { tipo: 'anulacion', num_serie: 'FAC-0001' })], resp, AHORA);
  assertEquals(alta.estado_envio, 'aceptado');
  assertEquals(anulacion.estado_envio, 'rechazado');
});

Deno.test('aplicarRespuesta: un registro que la AEAT no menciona se reintenta, no se da por enviado', () => {
  const resp = parsearRespuesta(xmlResp('Correcto', xmlLinea('FAC-0001', 'Correcto')));
  const [u1, u2] = aplicarRespuesta([reg(1), reg(2)], resp, AHORA);
  assertEquals(u1.estado_envio, 'aceptado');
  assertEquals(u2.estado_envio, 'error');
  assertEquals(u2.descripcion_error, 'La respuesta de la AEAT no incluye este registro.');
});

Deno.test('aplicarRespuesta: un SOAP Fault o una respuesta vacía hacen reintentar todo el lote', () => {
  const fault = parsearRespuesta('<e><faultstring>Certificado revocado</faultstring></e>');
  assertEquals(aplicarRespuesta([reg(1), reg(2)], fault, AHORA).map((u) => [u.estado_envio, u.descripcion_error]),
    [['error', 'Certificado revocado'], ['error', 'Certificado revocado']]);
  const vacia = parsearRespuesta('<x/>');
  assertEquals(aplicarRespuesta([reg(1)], vacia, AHORA)[0].estado_envio, 'error');
});

Deno.test('aplicarRespuesta: un registro duplicado (la AEAT ya lo tenía) queda aceptado', () => {
  const dup = '<sfR:CodigoErrorRegistro>3000</sfR:CodigoErrorRegistro><sfR:RegistroDuplicado><sf:IdPeticionRegistroDuplicado>1</sf:IdPeticionRegistroDuplicado><sf:EstadoRegistroDuplicado>Correcta</sf:EstadoRegistroDuplicado></sfR:RegistroDuplicado>';
  const resp = parsearRespuesta(xmlResp('ParcialmenteCorrecto', xmlLinea('FAC-0001', 'Incorrecto', 'Alta', dup)));
  const [u] = aplicarRespuesta([reg(1)], resp, AHORA);
  assertEquals(u.estado_envio, 'aceptado');
  assertEquals(u.codigo_error, null);
});
