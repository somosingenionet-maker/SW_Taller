import { assertEquals } from 'jsr:@std/assert@1';
import {
  puedeResponderPresupuesto,
  calcularVehiculosAMostrar,
  otActivaPorVehiculo,
  presupuestosPendientes,
  type Cliente,
  type OtCliente,
} from './logic.ts';

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return { id: 'cli-1', empresa_id: 'emp-1', nombre: 'Ana', apellidos: 'García', ...overrides };
}

function ot(overrides: Partial<OtCliente> = {}): OtCliente {
  return {
    id: 'ot-1', vehiculo_id: 'v1', estado: 'recibido', fecha_estimada_entrega: null,
    created_at: '2026-01-01T00:00:00Z', total: 100, presupuesto_estado: null, presupuesto_aprobado: null,
    ...overrides,
  };
}

// -------- puedeResponderPresupuesto --------
// Único control de acceso del portal público: evita que un cliente apruebe
// o rechace el presupuesto de OTRO cliente.
Deno.test('puedeResponderPresupuesto: permite cuando la OT es del mismo cliente', () => {
  assertEquals(puedeResponderPresupuesto(cliente(), { cliente_id: 'cli-1' }), true);
});

Deno.test('puedeResponderPresupuesto: rechaza la OT de OTRO cliente', () => {
  assertEquals(puedeResponderPresupuesto(cliente(), { cliente_id: 'cli-2' }), false);
});

// -------- calcularVehiculosAMostrar --------
Deno.test('calcularVehiculosAMostrar: incluye vehículos asociados aunque no tengan OT activa', () => {
  const resultado = calcularVehiculosAMostrar(['v1', 'v2'], []);
  assertEquals(new Set(resultado), new Set(['v1', 'v2']));
});

Deno.test('calcularVehiculosAMostrar: incluye un vehículo con OT activa aunque NO esté asociado (caso flota)', () => {
  const ordenes = [ot({ vehiculo_id: 'v-flota', estado: 'en_reparacion' })];
  const resultado = calcularVehiculosAMostrar([], ordenes);
  assertEquals(resultado, ['v-flota']);
});

Deno.test('calcularVehiculosAMostrar: no duplica un vehículo que está en ambas fuentes', () => {
  const ordenes = [ot({ vehiculo_id: 'v1', estado: 'listo' })];
  const resultado = calcularVehiculosAMostrar(['v1'], ordenes);
  assertEquals(resultado, ['v1']);
});

Deno.test('calcularVehiculosAMostrar: no incluye vehículos con OT ya entregada/cancelada si no están asociados', () => {
  const ordenes = [ot({ vehiculo_id: 'v-viejo', estado: 'entregado' })];
  const resultado = calcularVehiculosAMostrar([], ordenes);
  assertEquals(resultado, []);
});

// -------- otActivaPorVehiculo --------
Deno.test('otActivaPorVehiculo: se queda con la primera OT activa por vehículo (la más reciente si viene ordenado desc)', () => {
  const ordenes = [
    ot({ id: 'ot-nueva', vehiculo_id: 'v1', estado: 'en_reparacion', created_at: '2026-02-01T00:00:00Z' }),
    ot({ id: 'ot-vieja', vehiculo_id: 'v1', estado: 'listo', created_at: '2026-01-01T00:00:00Z' }),
  ];
  const mapa = otActivaPorVehiculo(ordenes);
  assertEquals(mapa.get('v1')?.id, 'ot-nueva');
});

Deno.test('otActivaPorVehiculo: ignora OTs en estados no activos (entregado, cancelado, presupuesto)', () => {
  const ordenes = [ot({ vehiculo_id: 'v1', estado: 'entregado' })];
  const mapa = otActivaPorVehiculo(ordenes);
  assertEquals(mapa.has('v1'), false);
});

// -------- presupuestosPendientes --------
Deno.test('presupuestosPendientes: incluye solo presupuestos enviados sin respuesta aún', () => {
  const ordenes = [
    ot({ id: 'ot-pendiente', presupuesto_estado: 'enviado', presupuesto_aprobado: null }),
    ot({ id: 'ot-aprobado', presupuesto_estado: 'enviado', presupuesto_aprobado: true }),
    ot({ id: 'ot-rechazado', presupuesto_estado: 'enviado', presupuesto_aprobado: false }),
    ot({ id: 'ot-sin-presupuesto', presupuesto_estado: null, presupuesto_aprobado: null }),
  ];
  const resultado = presupuestosPendientes(ordenes);
  assertEquals(resultado.map((o) => o.id), ['ot-pendiente']);
});
