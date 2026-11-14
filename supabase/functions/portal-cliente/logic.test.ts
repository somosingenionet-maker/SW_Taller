import { assertEquals } from 'jsr:@std/assert@1';
import {
  puedeResponderPresupuesto,
  calcularVehiculosAMostrar,
  otActivaPorVehiculo,
  presupuestosPendientes,
  puedeResponderInspeccion,
  formatearInforme,
  puntosAprobables,
  textoAceptacion,
  validarAceptacion,
  dispositivoDe,
  ipDeCabecera,
  puntosElegibles,
  validarAceptacionInspeccion,
  textoAceptacionInspeccion,
  type Cliente,
  type OtCliente,
} from './logic.ts';

function cliente(overrides: Partial<Cliente> = {}): Cliente {
  return { id: 'cli-1', empresa_id: 'emp-1', nombre: 'Ana', apellidos: 'García', ...overrides };
}

function ot(overrides: Partial<OtCliente> = {}): OtCliente {
  return {
    id: 'ot-1', numero: 'OT-1', vehiculo_id: 'v1', estado: 'recibido', fecha_estimada_entrega: null,
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

Deno.test('puedeResponderInspeccion: solo el dueño y solo mientras está enviada', () => {
  const c = { id: 'c1', empresa_id: 'e', nombre: 'A', apellidos: 'B' };
  assertEquals(puedeResponderInspeccion(c, { cliente_id: 'c1', estado: 'enviada' }), true);
  assertEquals(puedeResponderInspeccion(c, { cliente_id: 'c2', estado: 'enviada' }), false);
  assertEquals(puedeResponderInspeccion(c, { cliente_id: 'c1', estado: 'respondida' }), false);
  assertEquals(puedeResponderInspeccion(c, { cliente_id: 'c1', estado: 'terminada' }), false);
  assertEquals(puedeResponderInspeccion(c, { cliente_id: 'c1', estado: 'borrador' }), false);
});

const INSP = { id: 'i1', orden_id: 'o1', vehiculo_id: 'v1', cliente_id: 'c1', estado: 'enviada', nota_general: null, enviada_en: '2026-11-14T10:00:00Z', respondida_en: null, fotos_borradas_en: null };
const P = (id: string, estado: string | null, pos: number, extra: Record<string, unknown> = {}) =>
  ({ id, categoria: 'Frenos', nombre: id, posicion: pos, estado, nota: null, fotos: [], reparacion: null, precio: null, decision: null, ...extra });

Deno.test('formatearInforme: urgentes primero, atención después, el resto solo cuenta; sin «no aplica» ni sin marcar', () => {
  const puntos = [
    P('a', 'bien', 1), P('b', 'urgente', 3, { precio: 64, nota: 'Sin margen' }), P('c', 'atencion', 2, { precio: 30.5 }),
    P('d', 'no_aplica', 4), P('e', null, 5), P('f', 'urgente', 0, { precio: 10 }),
  ];
  const r = formatearInforme(INSP, 'Seat León (1234ABC)', puntos, new Map());
  assertEquals(r.urgentes.map((p) => p.id), ['f', 'b']);        // ordenados por posición
  assertEquals(r.atencion.map((p) => p.id), ['c']);
  assertEquals(r.bien, 1);
  assertEquals(r.totalAprobable, 104.5);
  assertEquals(r.puntosAprobables, 3);
  assertEquals(r.fotosEliminadas, false);
});

Deno.test('formatearInforme: fotos solo con enlace disponible; fotos eliminadas se avisa; atención sin precio no es aprobable', () => {
  const urls = new Map([['r1', 'https://firmada/1']]);
  const puntos = [P('a', 'urgente', 1, { fotos: ['r1', 'r-borrada'], precio: 20 }), P('b', 'atencion', 2)];
  const r = formatearInforme({ ...INSP, fotos_borradas_en: '2027-05-01T00:00:00Z' }, 'X', puntos, urls);
  assertEquals(r.urgentes[0].fotos, ['https://firmada/1']);
  assertEquals(r.fotosEliminadas, true);
  assertEquals(r.puntosAprobables, 1);
  assertEquals(puntosAprobables(puntos), 1);
  assertEquals(puntosAprobables([{ estado: 'urgente', precio: 0 }, { estado: 'bien', precio: 50 }]), 0);
});

Deno.test('textoAceptacion: lo que se guarda es lo que el cliente lee, con coma decimal', () => {
  assertEquals(textoAceptacion('OT-1', 'Seat León (1234ABC)', 123.4), 'Acepto el presupuesto OT-1 para Seat León (1234ABC) por un importe de 123,40 € (IVA incluido) y autorizo la realización de los trabajos descritos.');
});

Deno.test('validarAceptacion: casilla, nombre e importe visto igual al actual', () => {
  const ok = validarAceptacion({ nombre: '  Ana   García ', acepta: true, totalVisto: 123.4 }, 123.4);
  assertEquals(ok, { ok: true, nombre: 'Ana García' });
  assertEquals(validarAceptacion({ nombre: 'Ana', acepta: false, totalVisto: 10 }, 10).ok, false);
  assertEquals(validarAceptacion({ nombre: 'Ana', acepta: 'true', totalVisto: 10 }, 10).ok, false);   // solo true booleano
  assertEquals(validarAceptacion({ nombre: 'A', acepta: true, totalVisto: 10 }, 10).ok, false);
  assertEquals(validarAceptacion({ nombre: 'x'.repeat(121), acepta: true, totalVisto: 10 }, 10).ok, false);
  assertEquals(validarAceptacion({ nombre: 123, acepta: true, totalVisto: 10 }, 10).ok, false);
  const cambiado = validarAceptacion({ nombre: 'Ana', acepta: true, totalVisto: 100 }, 120);
  assertEquals(cambiado.ok === false && cambiado.status, 409);
  assertEquals(validarAceptacion({ nombre: 'Ana', acepta: true, totalVisto: '10' }, 10).ok, false);   // el importe debe ser número
  assertEquals(validarAceptacion({ nombre: 'Ana', acepta: true, totalVisto: 0 }, 0).ok, false);       // sin importe
  assertEquals(validarAceptacion({ nombre: 'Ana', acepta: true, totalVisto: 10.004 }, 10).ok, true);  // céntimos redondeados
});

Deno.test('dispositivoDe e ipDeCabecera: recortan y devuelven null si no hay dato', () => {
  assertEquals(dispositivoDe(null), null);
  assertEquals(dispositivoDe('  \n '), null);
  assertEquals(dispositivoDe('Mozilla/5.0\r\n(iPhone)'), 'Mozilla/5.0 (iPhone)');
  assertEquals(dispositivoDe('a'.repeat(500))!.length, 300);
  assertEquals(ipDeCabecera('83.45.1.2, 10.0.0.1'), '83.45.1.2');
  assertEquals(ipDeCabecera(null), null);
  assertEquals(ipDeCabecera('  '), null);
});

const EL = [{ id: 'a', nombre: 'Pastillas', precio: 64 }, { id: 'b', nombre: 'Discos', precio: 120 }, { id: 'c', nombre: 'Neumático', precio: 85.5 }];

Deno.test('puntosElegibles: solo problemas con precio', () => {
  const r = puntosElegibles([
    { id: '1', nombre: 'A', estado: 'urgente', precio: '64.00' }, { id: '2', nombre: 'B', estado: 'atencion', precio: null },
    { id: '3', nombre: 'C', estado: 'bien', precio: 50 }, { id: '4', nombre: 'D', estado: 'atencion', precio: 0 }, { id: '5', nombre: 'E', estado: 'atencion', precio: 10 },
  ]);
  assertEquals(r, [{ id: '1', nombre: 'A', precio: 64 }, { id: '5', nombre: 'E', precio: 10 }]);
});

Deno.test('inspección punto por punto: aprobar un subconjunto exige nombre, casilla e importe de lo marcado', () => {
  const ok = validarAceptacionInspeccion({ aprobados: ['a', 'c'], nombre: ' Ana  García ', acepta: true, totalVisto: 149.5 }, EL);
  assertEquals(ok, { ok: true, aprobados: ['a', 'c'], rechazados: ['b'], total: 149.5, nombre: 'Ana García' });
  const sinCasilla = validarAceptacionInspeccion({ aprobados: ['a'], nombre: 'Ana', acepta: false, totalVisto: 64 }, EL);
  assertEquals(sinCasilla.ok === false && sinCasilla.status, 400);
  assertEquals(validarAceptacionInspeccion({ aprobados: ['a'], nombre: 'A', acepta: true, totalVisto: 64 }, EL).ok, false);
  assertEquals(validarAceptacionInspeccion({ aprobados: ['a'], nombre: 'Ana', acepta: 'true', totalVisto: 64 }, EL).ok, false);
});

Deno.test('inspección punto por punto: el importe visto debe ser la suma de lo marcado (409 si no)', () => {
  const mal = validarAceptacionInspeccion({ aprobados: ['a', 'b'], nombre: 'Ana', acepta: true, totalVisto: 64 }, EL);
  assertEquals(mal.ok === false && mal.status, 409);
  assertEquals(validarAceptacionInspeccion({ aprobados: ['a'], nombre: 'Ana', acepta: true, totalVisto: '64' }, EL).ok, false);
  assertEquals(validarAceptacionInspeccion({ aprobados: ['a', 'b', 'c'], nombre: 'Ana', acepta: true, totalVisto: 269.5 }, EL).ok, true);
});

Deno.test('inspección punto por punto: no aprobar ninguna es rechazarlo todo y no pide datos', () => {
  assertEquals(validarAceptacionInspeccion({ aprobados: [], nombre: undefined, acepta: undefined, totalVisto: undefined }, EL),
    { ok: true, aprobados: [], rechazados: ['a', 'b', 'c'], total: 0, nombre: null });
});

Deno.test('inspección punto por punto: ids inventados, repetidos o mal formados', () => {
  assertEquals(validarAceptacionInspeccion({ aprobados: ['zzz'], nombre: 'Ana', acepta: true, totalVisto: 1 }, EL).ok, false);
  assertEquals(validarAceptacionInspeccion({ aprobados: 'a', nombre: 'Ana', acepta: true, totalVisto: 64 }, EL).ok, false);
  assertEquals(validarAceptacionInspeccion({ aprobados: [1], nombre: 'Ana', acepta: true, totalVisto: 64 }, EL).ok, false);
  assertEquals(validarAceptacionInspeccion({ aprobados: undefined, nombre: 'Ana', acepta: true, totalVisto: 64 }, EL).ok, false);   // cliente antiguo
  const rep = validarAceptacionInspeccion({ aprobados: ['a', 'a'], nombre: 'Ana', acepta: true, totalVisto: 64 }, EL);
  assertEquals(rep.ok && rep.total, 64);   // un id repetido no suma dos veces
});

Deno.test('textoAceptacionInspeccion lista lo aceptado con importes y total', () => {
  const t = textoAceptacionInspeccion('Seat León (1234ABC)', '2026-11-14T10:00:00Z', [{ nombre: 'Pastillas', precio: 64 }, { nombre: 'Neumático', precio: 85.5 }], 149.5);
  assertEquals(t, 'Acepto las siguientes reparaciones del informe de inspección del 14 de noviembre de 2026 de Seat León (1234ABC): Pastillas (64,00 €); Neumático (85,50 €). Importe total: 149,50 € (IVA no incluido), y autorizo su realización.');
});
