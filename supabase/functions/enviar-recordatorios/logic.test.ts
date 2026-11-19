import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  contrastText,
  sustituirVariables,
  construirEmail,
  vencimientoToca,
  avisoPersonalizadoToca,
  siguienteRepeticion,
  sumarMesesIso,
  construirEmailPersonalizado,
  avisoAceite,
  lineasFiltros,
  resumenTieneContenido,
  construirEmailResumen,
  cuandoAceite,
  kmTexto,
  fechaLarga,
  diasHasta,
  type EmpresaEmail,
  type AlertaAceite,
} from './logic.ts';

// -------- contrastText --------
Deno.test('contrastText: blanco sobre un color oscuro', () => {
  assertEquals(contrastText('#1e293b'), '#ffffff');
});

Deno.test('contrastText: negro sobre un color claro', () => {
  assertEquals(contrastText('#fef08a'), '#000000');
});

Deno.test('contrastText: no revienta con un hex inválido (parseInt da NaN, no lanza)', () => {
  assertEquals(contrastText('no-es-un-color'), '#000000');
});

// -------- sustituirVariables --------
Deno.test('sustituirVariables: reemplaza cada placeholder por su valor', () => {
  const resultado = sustituirVariables('Hola {{cliente}}, tu {{vehiculo}} te espera', {
    cliente: 'Ana', vehiculo: 'Ibiza',
  });
  assertEquals(resultado, 'Hola Ana, tu Ibiza te espera');
});

Deno.test('sustituirVariables: deja intacto un placeholder sin valor provisto', () => {
  const resultado = sustituirVariables('Hola {{cliente}}, {{desconocido}}', { cliente: 'Ana' });
  assertEquals(resultado, 'Hola Ana, {{desconocido}}');
});

// -------- construirEmail --------
function empresaFixture(overrides: Partial<EmpresaEmail> = {}): EmpresaEmail {
  return {
    id: 'emp-1', nombre: 'Taller Ejemplo', plantillas_recordatorios: null,
    logo_url: null, brand_color: null, correo: null, telefono: null, web: null,
    ...overrides,
  };
}

Deno.test('construirEmail: usa la plantilla por defecto cuando la empresa no tiene una propia', () => {
  const { asunto, html } = construirEmail(
    'itv', empresaFixture(),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: '2026-10-01', kilometraje_limite: null },
  );
  assertStringIncludes(asunto, 'ITV');
  assertStringIncludes(asunto, 'Seat Ibiza (1111AAA)');
  assertStringIncludes(html, 'Ana');
  assertStringIncludes(html, 'Taller Ejemplo');
  // La fecha se formatea con el mismo Date/locale que usa el código bajo
  // prueba — no se compara contra un literal fijo para no depender de la
  // zona horaria de la máquina donde corran los tests.
  assertStringIncludes(html, new Date('2026-10-01').toLocaleDateString('es-ES'));
});

Deno.test('construirEmail: usa la plantilla personalizada de la empresa cuando existe', () => {
  const { html } = construirEmail(
    'seguro',
    empresaFixture({ plantillas_recordatorios: { seguro: 'Mensaje a medida para {{cliente}}' } }),
    { nombre: 'Luis', apellidos: 'Pérez' },
    { marca: 'Renault', modelo: 'Clio', matricula: '2222BBB' },
    { fecha_limite: '2026-11-01', kilometraje_limite: null },
  );
  assertStringIncludes(html, 'Mensaje a medida para Luis');
});

Deno.test('construirEmail: aceite — recordatorio con fecha y km', () => {
  const { asunto, html } = construirEmail(
    'aceite', empresaFixture(),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: '2027-05-12', kilometraje_limite: 100000 },
  );
  assertStringIncludes(asunto, 'se acerca el cambio de aceite');
  assertStringIncludes(html, 'le toca el cambio de aceite el 12/5/2027 o a los 100.000 km, lo que ocurra antes');
  assertStringIncludes(html, 'Próximo cambio: 12 de mayo de 2027');
  assertStringIncludes(html, 'O a los 100.000 km');
});

Deno.test('construirEmail: aceite — solo km no deja la frase coja', () => {
  const { html } = construirEmail(
    'aceite', empresaFixture(),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: null, kilometraje_limite: 50000 },
  );
  assertStringIncludes(html, 'le toca el cambio de aceite a los 50.000 km.');
  assertStringIncludes(html, 'A los 50.000 km');
});

Deno.test('construirEmail: aceite — el último aviso usa su propio texto y asunto, no la plantilla del recordatorio', () => {
  const { asunto, html } = construirEmail(
    'aceite', empresaFixture({ plantillas_recordatorios: { aceite: 'PLANTILLA PROPIA' } }),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: '2026-11-01', kilometraje_limite: null },
    'vencido',
  );
  assertStringIncludes(asunto, 'Tu cambio de aceite está pendiente');
  assertStringIncludes(html, 'le tocaba el cambio de aceite el 1/11/2026');
  assertStringIncludes(html, 'Si ya lo cambiaste en otro sitio');
  assertEquals(html.includes('PLANTILLA PROPIA'), false);
});

Deno.test('construirEmail: lo que viene de la base de datos se escapa (no se puede inyectar HTML en el correo)', () => {
  const { html } = construirEmail(
    'itv', empresaFixture({ nombre: 'Taller <b>X</b>', plantillas_recordatorios: { itv: 'Hola {{cliente}} <script>alert(1)</script>' } }),
    { nombre: '<img src=x onerror=alert(1)>', apellidos: '' },
    { marca: 'Seat', modelo: '"Ibiza"', matricula: '1111AAA' },
    { fecha_limite: '2026-10-01', kilometraje_limite: null },
  );
  assertEquals(html.includes('<script>'), false);
  assertEquals(html.includes('<img src=x'), false);
  assertEquals(html.includes('<b>X</b>'), false);
  assertStringIncludes(html, '&lt;script&gt;');
});

Deno.test('construirEmail: todos llevan la forma de darse de baja', () => {
  const { html } = construirEmail('seguro', empresaFixture(), { nombre: 'Ana', apellidos: '' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' }, { fecha_limite: '2026-10-01', kilometraje_limite: null });
  assertStringIncludes(html, 'Si prefieres no recibir estos avisos');
});

Deno.test('construirEmail: un logo que no sea https o un color raro no llegan al HTML', () => {
  const { html } = construirEmail('itv', empresaFixture({ logo_url: 'javascript:alert(1)', brand_color: 'red;background:url(x)' }),
    { nombre: 'Ana', apellidos: '' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' }, { fecha_limite: '2026-10-01', kilometraje_limite: null });
  assertEquals(html.includes('javascript:'), false);
  assertEquals(html.includes('url(x)'), false);
});

Deno.test('construirEmail: sin logo, no incluye la celda de imagen', () => {
  const { html } = construirEmail(
    'itv', empresaFixture({ logo_url: null }),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: '2026-10-01', kilometraje_limite: null },
  );
  assertEquals(html.includes('<img'), false);
});

// -------- vencimientoToca --------
// Decide si un cliente recibe o no el recordatorio automático de ITV/seguro/impuesto — un fallo aquí
// significa avisos que nunca llegan, llegan tarde o salen con una fecha de hace meses.
Deno.test('vencimientoToca: entra cuando la fecha ya está dentro de la antelación', () => {
  assertEquals(vencimientoToca('2026-01-10', '2026-01-01'), true);
  assertEquals(vencimientoToca('2026-01-15', '2026-01-01'), true); // justo a 14 días
});

Deno.test('vencimientoToca: no entra si el vencimiento queda fuera de la antelación', () => {
  assertEquals(vencimientoToca('2026-06-01', '2026-01-01'), false);
  assertEquals(vencimientoToca('2026-01-16', '2026-01-01'), false); // 15 días con antelación de 14
});

Deno.test('vencimientoToca: la antelación de cada taller manda (7 o 30 días)', () => {
  assertEquals(vencimientoToca('2026-01-20', '2026-01-01', 30), true);
  assertEquals(vencimientoToca('2026-01-20', '2026-01-01', 7), false);
});

Deno.test('vencimientoToca: vencido hace poco sale; vencido hace más de 30 días lo decide una persona', () => {
  assertEquals(vencimientoToca('2025-12-20', '2026-01-01'), true);   // hace 12 días
  assertEquals(vencimientoToca('2025-12-02', '2026-01-01'), true);   // hace 30 días justos
  assertEquals(vencimientoToca('2025-12-01', '2026-01-01'), false);  // hace 31 días
});

Deno.test('vencimientoToca: sin fecha límite nunca entra', () => {
  assertEquals(vencimientoToca(null, '2026-01-01'), false);
});

// -------- avisoAceite --------
// Decide qué correo recibe el cliente y cuándo. Un fallo aquí es un cliente al que no se avisa, o
// al que se le escribe dos veces lo mismo.
const HOY = '2026-11-12';
const alertaAceite = (o: Partial<AlertaAceite> = {}): AlertaAceite => ({
  fecha_limite: null, kilometraje_limite: null, recordatorio_enviado_en: null, ultimo_aviso_enviado_en: null, ...o,
});

Deno.test('avisoAceite: recordatorio desde 14 días antes de la fecha', () => {
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-27' }), 0, HOY), null);           // faltan 15
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-26' }), 0, HOY), 'recordatorio'); // faltan 14
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-12' }), 0, HOY), 'recordatorio'); // hoy
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-06' }), 0, HOY), 'recordatorio'); // pasó hace 6
});

Deno.test('avisoAceite: el recordatorio sale una sola vez', () => {
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-20', recordatorio_enviado_en: '2026-11-07T08:00:00Z' }), 0, HOY), null);
});

Deno.test('avisoAceite: recordatorio por kilómetros aunque la fecha esté lejos', () => {
  const a = alertaAceite({ fecha_limite: '2027-05-12', kilometraje_limite: 100000 });
  assertEquals(avisoAceite(a, 99500, HOY), 'recordatorio');
  assertEquals(avisoAceite(a, 99499, HOY), null);
  assertEquals(avisoAceite(alertaAceite({ kilometraje_limite: 100000 }), 120000, HOY), 'recordatorio');
});

Deno.test('avisoAceite: último aviso entre 7 y 60 días después, una sola vez', () => {
  const enviado = '2026-10-20T08:00:00Z';
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-05', recordatorio_enviado_en: enviado }), 0, HOY), 'vencido'); // hace 7
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-09-13', recordatorio_enviado_en: enviado }), 0, HOY), 'vencido'); // hace 60
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-09-12', recordatorio_enviado_en: enviado }), 0, HOY), null);      // hace 61
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-05', recordatorio_enviado_en: enviado, ultimo_aviso_enviado_en: enviado }), 0, HOY), null);
});

Deno.test('avisoAceite: si el recordatorio nunca salió y ya pasó una semana, va directo el último aviso', () => {
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-11-01' }), 0, HOY), 'vencido');
});

Deno.test('avisoAceite: un cambio vencido hace más de 60 días no genera ningún correo, ni por km', () => {
  assertEquals(avisoAceite(alertaAceite({ fecha_limite: '2026-06-01', kilometraje_limite: 100000 }), 150000, HOY), null);
});

Deno.test('avisoAceite: sin fecha ni km no hay nada que avisar', () => {
  assertEquals(avisoAceite(alertaAceite(), 50000, HOY), null);
});

// -------- resumen al entregar --------
Deno.test('lineasFiltros: cambiados y no cambiados; los sin revisar no se cuentan al cliente', () => {
  assertEquals(lineasFiltros({ filtro_aire: 'cambiado', filtro_aceite: 'cambiado', filtro_combustible: null, filtro_habitaculo: 'no_cambiado' }),
    ['Filtros cambiados: aire y aceite', 'No se cambiaron: habitáculo']);
  assertEquals(lineasFiltros({}), []);
});

Deno.test('resumenTieneContenido: sin filtros ni próximo cambio no se envía nada', () => {
  assertEquals(resumenTieneContenido({}, null), false);
  assertEquals(resumenTieneContenido({ filtro_aire: 'cambiado' }, null), true);
  assertEquals(resumenTieneContenido({}, { fecha: '2027-05-12', km: null }), true);
  assertEquals(resumenTieneContenido({}, { fecha: null, km: null }), false);
});

Deno.test('construirEmailResumen: filtros y próximo cambio', () => {
  const { asunto, html } = construirEmailResumen(
    empresaFixture(), { nombre: 'Ana' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { filtro_aire: 'cambiado', filtro_aceite: 'cambiado', filtro_habitaculo: 'no_cambiado' },
    { fecha: '2027-05-12', km: 100000 },
  );
  assertStringIncludes(asunto, 'Resumen de tu cambio de aceite — Seat Ibiza (1111AAA)');
  assertStringIncludes(html, 'Gracias por confiar en Taller Ejemplo');
  assertStringIncludes(html, 'Filtros cambiados: aire y aceite');
  assertStringIncludes(html, 'No se cambiaron: habitáculo');
  assertStringIncludes(html, 'El próximo cambio le toca el 12/5/2027 o a los 100.000 km, lo que ocurra antes. Te avisaremos unos días antes.');
  assertStringIncludes(html, 'Próximo cambio: 12 de mayo de 2027');
});

Deno.test('construirEmailResumen: sin próximo cambio anotado no promete avisar', () => {
  const { html } = construirEmailResumen(empresaFixture(), { nombre: 'Ana' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { filtro_aceite: 'cambiado' }, null);
  assertEquals(html.includes('Te avisaremos'), false);
  assertStringIncludes(html, 'Filtros cambiados: aceite');
});

Deno.test('cuandoAceite / kmTexto / fechas', () => {
  assertEquals(cuandoAceite('2027-05-12', null), 'el 12/5/2027');
  assertEquals(cuandoAceite(null, 8500), 'a los 8.500 km');
  assertEquals(kmTexto(1234567), '1.234.567');
  assertEquals(fechaLarga('2027-01-05'), '5 de enero de 2027');
  assertEquals(diasHasta('2026-11-22', '2026-11-12'), 10);
});

// -------- Avisos: antelación del aceite, reserva online, avisos personalizados --------
Deno.test('avisoAceite: la antelación del taller también cuenta (30 días: ya toca; 7: aún no)', () => {
  const a = alertaAceite({ fecha_limite: '2026-12-05' }); // en 23 días
  assertEquals(avisoAceite(a, 0, HOY, 30), 'recordatorio');
  assertEquals(avisoAceite(a, 0, HOY, 7), null);
});

Deno.test('construirEmail: con reservas online activas lleva el botón «Pedir cita»; sin ellas, no', () => {
  const args = [{ nombre: 'Ana', apellidos: 'García' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' }, { fecha_limite: '2026-10-01', kilometraje_limite: null }] as const;
  const con = construirEmail('itv', empresaFixture({ reserva_url: 'https://motor.doonty.com/reservar/taller-gil' }), ...args).html;
  assertStringIncludes(con, 'Pedir cita');
  assertStringIncludes(con, 'href="https://motor.doonty.com/reservar/taller-gil"');
  assertEquals(construirEmail('itv', empresaFixture(), ...args).html.includes('Pedir cita'), false);
  // Un enlace que no sea https no llega al correo.
  assertEquals(construirEmail('itv', empresaFixture({ reserva_url: 'javascript:alert(1)' }), ...args).html.includes('Pedir cita'), false);
});

Deno.test('avisoPersonalizadoToca: por fecha cumplida o atrasada, por km cuando faltan 500 o menos', () => {
  assertEquals(avisoPersonalizadoToca({ avisar_en: '2026-11-12', avisar_km: null }, null, HOY), true);
  assertEquals(avisoPersonalizadoToca({ avisar_en: '2026-10-01', avisar_km: null }, null, HOY), true);
  assertEquals(avisoPersonalizadoToca({ avisar_en: '2026-11-13', avisar_km: null }, null, HOY), false);
  assertEquals(avisoPersonalizadoToca({ avisar_en: null, avisar_km: 50_300 }, 50_000, HOY), true);
  assertEquals(avisoPersonalizadoToca({ avisar_en: null, avisar_km: 60_000 }, 50_000, HOY), false);
  assertEquals(avisoPersonalizadoToca({ avisar_en: null, avisar_km: 50_300 }, null, HOY), false); // sin coche no hay km con que comparar
});

Deno.test('sumarMesesIso / siguienteRepeticion: fin de mes y avisos atrasados', () => {
  assertEquals(sumarMesesIso('2026-08-31', 6), '2027-02-28');
  assertEquals(sumarMesesIso('2026-11-12', 12), '2027-11-12');
  assertEquals(siguienteRepeticion('2026-11-12', 6, HOY), '2027-05-12');
  assertEquals(siguienteRepeticion('2026-01-05', 6, HOY), '2027-05-12'); // ya quedó atrás: cuenta desde hoy
});

Deno.test('construirEmailPersonalizado: su texto, con variables y botón de cita; el motivo es la etiqueta y el asunto', () => {
  const { asunto, html } = construirEmailPersonalizado(
    empresaFixture({ reserva_url: 'https://motor.doonty.com/reservar/taller-gil' }),
    { nombre: 'Ana' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { motivo: 'Neumáticos', mensaje: 'Hola {{cliente}}, los neumáticos del {{vehiculo}} ya tocan.' },
  );
  assertEquals(asunto, 'Neumáticos — Seat Ibiza (1111AAA)');
  assertStringIncludes(html, 'Hola Ana, los neumáticos del Seat Ibiza (1111AAA) ya tocan.');
  assertStringIncludes(html, 'NEUMÁTICOS');
  assertStringIncludes(html, 'Pedir cita');
});

Deno.test('construirEmailPersonalizado: sin texto usa el genérico; lo que viene de la base de datos se escapa', () => {
  const vacio = construirEmailPersonalizado(empresaFixture(), { nombre: 'Ana' }, { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' }, { motivo: 'Pintura', mensaje: '   ' });
  assertStringIncludes(vacio.html, 'recordarte lo que hablamos sobre tu vehículo Seat Ibiza (1111AAA)');
  const malo = construirEmailPersonalizado(empresaFixture(), { nombre: '<b>Ana</b>' }, null, { motivo: '<script>x</script>', mensaje: 'Hola {{cliente}}' });
  assertEquals(malo.html.includes('<script>'), false);
  assertEquals(malo.html.includes('<b>Ana</b>'), false);
  assertStringIncludes(malo.html, '&lt;b&gt;Ana&lt;/b&gt;');
});

Deno.test('construirEmailPersonalizado: sin vehículo no dibuja el recuadro del coche', () => {
  const { asunto, html } = construirEmailPersonalizado(empresaFixture(), { nombre: 'Ana' }, null, { motivo: 'Llamar', mensaje: 'Hola {{cliente}}' });
  assertEquals(asunto, 'Llamar');
  assertEquals(html.includes('border-radius:12px'), false);
});
