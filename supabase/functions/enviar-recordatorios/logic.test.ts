import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  contrastText,
  sustituirVariables,
  construirEmail,
  dentroDeVentanaAviso,
  DIAS_AVISO_VENCIMIENTO,
  KM_AVISO_MANTENIMIENTO,
  type EmpresaEmail,
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

Deno.test('construirEmail: mantenimiento muestra el kilometraje de aviso, no una fecha', () => {
  const { html } = construirEmail(
    'mantenimiento', empresaFixture(),
    { nombre: 'Ana', apellidos: 'García' },
    { marca: 'Seat', modelo: 'Ibiza', matricula: '1111AAA' },
    { fecha_limite: null, kilometraje_limite: 50000 },
  );
  assertStringIncludes(html, 'Kilometraje de aviso');
  assertStringIncludes(html, '50.000 km');
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

// -------- dentroDeVentanaAviso --------
// Determina si un cliente recibe o no el recordatorio automático — un fallo
// aquí significa avisos que nunca llegan o llegan demasiado tarde.
Deno.test('dentroDeVentanaAviso: mantenimiento entra cuando falta menos del margen de km', () => {
  const alerta = { fecha_limite: null, kilometraje_limite: 50000 };
  assertEquals(dentroDeVentanaAviso('mantenimiento', alerta, 50000 - KM_AVISO_MANTENIMIENTO, new Date()), true);
});

Deno.test('dentroDeVentanaAviso: mantenimiento NO entra si aún falta más del margen de km', () => {
  const alerta = { fecha_limite: null, kilometraje_limite: 50000 };
  assertEquals(dentroDeVentanaAviso('mantenimiento', alerta, 50000 - KM_AVISO_MANTENIMIENTO - 1, new Date()), false);
});

Deno.test('dentroDeVentanaAviso: mantenimiento sin kilometraje_limite nunca entra', () => {
  const alerta = { fecha_limite: null, kilometraje_limite: null };
  assertEquals(dentroDeVentanaAviso('mantenimiento', alerta, 0, new Date()), false);
});

Deno.test('dentroDeVentanaAviso: itv/seguro/impuesto entran cuando la fecha límite ya está dentro de la ventana', () => {
  const hoy = new Date('2026-01-01T00:00:00Z');
  const limiteAviso = new Date(hoy);
  limiteAviso.setUTCDate(limiteAviso.getUTCDate() + DIAS_AVISO_VENCIMIENTO);
  const alerta = { fecha_limite: '2026-01-10', kilometraje_limite: null };
  assertEquals(dentroDeVentanaAviso('itv', alerta, 0, limiteAviso), true);
});

Deno.test('dentroDeVentanaAviso: itv/seguro/impuesto NO entran si el vencimiento está fuera de la ventana', () => {
  const hoy = new Date('2026-01-01T00:00:00Z');
  const limiteAviso = new Date(hoy);
  limiteAviso.setUTCDate(limiteAviso.getUTCDate() + DIAS_AVISO_VENCIMIENTO);
  const alerta = { fecha_limite: '2026-06-01', kilometraje_limite: null };
  assertEquals(dentroDeVentanaAviso('seguro', alerta, 0, limiteAviso), false);
});

Deno.test('dentroDeVentanaAviso: itv/seguro/impuesto sin fecha_limite nunca entra', () => {
  const alerta = { fecha_limite: null, kilometraje_limite: null };
  assertEquals(dentroDeVentanaAviso('impuesto', alerta, 0, new Date()), false);
});
