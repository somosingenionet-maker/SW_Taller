import { assertEquals } from 'jsr:@std/assert@1';
import {
  descripcionVehiculo, diaSemanaDe, disponibilidad, fechaHoraLarga, fechaMadrid, fechaValida, horaMadrid, huecosDelDia, instanteMadrid,
  matriculaValida, sumarDias, telefonoValido, validarSolicitud, type ConfigReservas,
} from './logic.ts';

const SEMANA = { lun: [['09:00', '13:30'], ['16:00', '19:30']], mar: [['09:00', '13:30'], ['16:00', '19:30']], mie: [['09:00', '13:30'], ['16:00', '19:30']], jue: [['09:00', '13:30'], ['16:00', '19:30']], vie: [['09:00', '13:30'], ['16:00', '19:30']], sab: [['09:00', '13:00']], dom: [] } as ConfigReservas['horario'];
const CFG: ConfigReservas = { horario: SEMANA, cierres: [], capacidad: 2, antelacionHoras: 12, diasMax: 30 };
// Domingo 15 de noviembre de 2026, 12:00 de Madrid (invierno, UTC+1)
const AHORA = instanteMadrid('2026-11-15', '12:00');

Deno.test('fechas: validez real, día de la semana y suma de días (con cambio de mes y de año)', () => {
  assertEquals(fechaValida('2026-02-28'), true);
  assertEquals(fechaValida('2026-02-30'), false);
  assertEquals(fechaValida('2028-02-29'), true);
  assertEquals(fechaValida('2026-13-01'), false);
  assertEquals(fechaValida('26-11-17'), false);
  assertEquals(fechaValida(20261117), false);
  assertEquals(diaSemanaDe('2026-11-15'), 'dom');
  assertEquals(diaSemanaDe('2026-11-17'), 'mar');
  assertEquals(sumarDias('2026-12-31', 1), '2027-01-01');
  assertEquals(sumarDias('2026-03-01', -1), '2026-02-28');
});

Deno.test('instanteMadrid: invierno UTC+1, verano UTC+2 y días del cambio de hora', () => {
  assertEquals(new Date(instanteMadrid('2026-11-17', '10:00')).toISOString(), '2026-11-17T09:00:00.000Z');
  assertEquals(new Date(instanteMadrid('2026-07-14', '10:00')).toISOString(), '2026-07-14T08:00:00.000Z');
  // 29-mar-2026: a las 02:00 se pasa a las 03:00 (UTC+2). Las 10:00 ya son verano.
  assertEquals(new Date(instanteMadrid('2026-03-29', '10:00')).toISOString(), '2026-03-29T08:00:00.000Z');
  assertEquals(new Date(instanteMadrid('2026-03-28', '10:00')).toISOString(), '2026-03-28T09:00:00.000Z');
  // 25-oct-2026: a las 03:00 se vuelve a las 02:00 (UTC+1).
  assertEquals(new Date(instanteMadrid('2026-10-25', '10:00')).toISOString(), '2026-10-25T09:00:00.000Z');
  assertEquals(new Date(instanteMadrid('2026-10-24', '10:00')).toISOString(), '2026-10-24T08:00:00.000Z');
});

Deno.test('fechaMadrid y horaMadrid: ida y vuelta, y la medianoche UTC ya es otro día en Madrid', () => {
  const t = instanteMadrid('2026-11-17', '10:30');
  assertEquals([fechaMadrid(t), horaMadrid(t)], ['2026-11-17', '10:30']);
  const tarde = Date.UTC(2026, 10, 14, 23, 30); // 23:30 UTC = 00:30 del 15 en Madrid
  assertEquals(fechaMadrid(tarde), '2026-11-15');
  assertEquals(horaMadrid(tarde), '00:30');
});

Deno.test('huecos: lunes con dos tramos, cita de 60 min, de 30 en 30, sin pasarse del cierre de cada tramo', () => {
  const h = huecosDelDia('2026-11-16', CFG, 60, [], AHORA);
  assertEquals(h[0], '09:00');
  assertEquals(h.includes('12:30'), true);    // acaba 13:30 justo
  assertEquals(h.includes('13:00'), false);   // acabaría 14:00, ya cerrado
  assertEquals(h.includes('14:00'), false);   // pausa del mediodía
  assertEquals(h.includes('15:30'), false);
  assertEquals(h.includes('16:00'), true);
  assertEquals(h.includes('18:30'), true);    // acaba 19:30 justo
  assertEquals(h.includes('19:00'), false);
  assertEquals(h.length, 8 + 6);
});

Deno.test('huecos: la duración manda (30 min caben más)', () => {
  assertEquals(huecosDelDia('2026-11-16', CFG, 30, [], AHORA).includes('13:00'), true);
  assertEquals(huecosDelDia('2026-11-16', CFG, 30, [], AHORA).includes('13:30'), false);
  assertEquals(huecosDelDia('2026-11-16', CFG, 200, [], AHORA).includes('09:00'), true);   // 09:00-12:20 cabe en el tramo de 4,5 h
  assertEquals(huecosDelDia('2026-11-16', CFG, 300, [], AHORA), []);                       // 5 h no cabe en ningún tramo
});

Deno.test('huecos: domingo cerrado, sábado solo por la mañana, y un cierre puntual cierra el día', () => {
  assertEquals(huecosDelDia('2026-11-22', CFG, 60, [], AHORA), []);
  const sab = huecosDelDia('2026-11-21', CFG, 60, [], AHORA);
  assertEquals([sab[0], sab[sab.length - 1]], ['09:00', '12:00']);
  assertEquals(huecosDelDia('2026-11-17', { ...CFG, cierres: ['2026-11-17'] }, 60, [], AHORA), []);
  assertEquals(huecosDelDia('2026-11-17', { ...CFG, horario: {} }, 60, [], AHORA), []);
});

Deno.test('huecos: la antelación mínima quita los huecos demasiado cercanos', () => {
  // Ahora = domingo 12:00; antelación 12 h → el lunes antes de las 00:00 no hay nada que quitar, pero con 24 h sí
  const lunes = huecosDelDia('2026-11-16', { ...CFG, antelacionHoras: 24 }, 60, [], AHORA);
  assertEquals(lunes.includes('09:00'), false);
  assertEquals(lunes.includes('12:00'), true);
  assertEquals(huecosDelDia('2026-11-16', { ...CFG, antelacionHoras: 24 }, 60, [], AHORA)[0], '12:00');
  assertEquals(huecosDelDia('2026-11-16', { ...CFG, antelacionHoras: 0 }, 60, [], AHORA)[0], '09:00');
  // el mismo día, ya pasadas las 10:00, la mañana anterior no se ofrece
  const ahoraLunes = instanteMadrid('2026-11-16', '10:15');
  assertEquals(huecosDelDia('2026-11-16', { ...CFG, antelacionHoras: 0 }, 60, [], ahoraLunes)[0], '10:30');
});

Deno.test('huecos: capacidad 2 → con 2 citas solapadas el hueco desaparece; con 1 sigue; las adyacentes no cuentan', () => {
  const cita = (ini: string, min: number) => ({ inicio: instanteMadrid('2026-11-16', ini), fin: instanteMadrid('2026-11-16', ini) + min * 60_000 });
  const una = huecosDelDia('2026-11-16', CFG, 60, [cita('10:00', 60)], AHORA);
  assertEquals(una.includes('10:00'), true);
  const dos = huecosDelDia('2026-11-16', CFG, 60, [cita('10:00', 60), cita('10:30', 60)], AHORA);
  assertEquals(dos.includes('10:00'), false);    // se solapa con las dos
  assertEquals(dos.includes('10:30'), false);
  assertEquals(dos.includes('09:00'), true);     // acaba justo cuando empieza la de las 10:00 → cabe
  assertEquals(dos.includes('09:30'), true);     // solo roza la primera (09:30-10:30 solapa con 10:00-11:00: 1 cita) → cabe
  assertEquals(dos.includes('11:30'), true);     // la segunda acaba 11:30 → cabe
  assertEquals(dos.includes('11:00'), true);     // solo solapa con la segunda (10:30-11:30)
  const uno = huecosDelDia('2026-11-16', { ...CFG, capacidad: 1 }, 60, [cita('10:00', 60)], AHORA);
  assertEquals(uno.includes('10:00') || uno.includes('10:30') || uno.includes('09:30'), false);
  assertEquals(uno.includes('09:00') && uno.includes('11:00'), true);
});

Deno.test('disponibilidad: solo días con hueco, hasta diasMax, empezando hoy', () => {
  const d = disponibilidad(CFG, 60, [], AHORA);
  const dias = Object.keys(d);
  assertEquals(dias.includes('2026-11-15'), false);   // hoy es domingo: cerrado
  assertEquals(dias.includes('2026-11-16'), true);
  assertEquals(dias.includes('2026-11-22'), false);   // domingo
  assertEquals(dias.includes('2026-11-21'), true);    // sábado
  assertEquals(dias[dias.length - 1] <= sumarDias('2026-11-15', 30), true);
  assertEquals(dias.includes('2026-12-16'), false);   // fuera de rango (31 días)
  assertEquals(Object.keys(disponibilidad({ ...CFG, diasMax: 1 }, 60, [], AHORA)), ['2026-11-16']);
});

Deno.test('huecos el día del cambio de hora: las horas siguen siendo las del reloj de Madrid', () => {
  const ahora = instanteMadrid('2026-03-25', '12:00');
  const h = huecosDelDia('2026-03-30', CFG, 60, [], ahora);   // lunes tras el cambio
  assertEquals(h[0], '09:00');
  assertEquals(new Date(instanteMadrid('2026-03-30', '09:00')).toISOString(), '2026-03-30T07:00:00.000Z');
});

Deno.test('validarSolicitud: acepta lo correcto y normaliza', () => {
  const r = validarSolicitud({ slug: 'Taller-Ruiz', tipoId: 't1', fecha: '2026-11-17', hora: '10:00', nombre: '  Ana   García ', telefono: '600 000 001', correo: ' ANA@Mail.es ', matricula: '1234 abc', vehiculo: 'Seat León', motivo: ' Frenos ', consentimiento: true });
  assertEquals(r.ok && r.datos, { slug: 'taller-ruiz', tipoId: 't1', fecha: '2026-11-17', hora: '10:00', nombre: 'Ana García', telefono: '600 000 001', correo: 'ana@mail.es', vehiculo: 'Seat León', matricula: '1234ABC', motivo: 'Frenos' });
});

Deno.test('validarSolicitud: rechaza lo que falta o está mal', () => {
  const base = { slug: 's', tipoId: 't', fecha: '2026-11-17', hora: '10:00', nombre: 'Ana', telefono: '600000001', correo: 'a@b.es', consentimiento: true };
  const mal = (cambios: Record<string, unknown>) => validarSolicitud({ ...base, ...cambios }).ok;
  assertEquals(mal({}), true);
  assertEquals(mal({ consentimiento: false }), false);
  assertEquals(mal({ consentimiento: 'true' }), false);
  assertEquals(mal({ consentimiento: undefined }), false);
  assertEquals(mal({ nombre: 'A' }), false);
  assertEquals(mal({ nombre: 7 }), false);
  assertEquals(mal({ telefono: '123' }), false);
  assertEquals(mal({ telefono: '6000000012345678' }), false);
  assertEquals(mal({ correo: 'sin-arroba' }), false);
  assertEquals(mal({ correo: '' }), false);
  assertEquals(mal({ matricula: '!!' }), false);
  assertEquals(mal({ matricula: '' }), true);          // la matrícula es opcional
  assertEquals(mal({ fecha: '2026-02-30' }), false);
  assertEquals(mal({ hora: '25:00' }), false);
  assertEquals(mal({ hora: '9:00' }), false);
  assertEquals(mal({ slug: '' }), false);
  assertEquals(mal({ tipoId: '' }), false);
});

Deno.test('validarSolicitud recorta textos largos', () => {
  const r = validarSolicitud({ slug: 's', tipoId: 't', fecha: '2026-11-17', hora: '10:00', nombre: 'x'.repeat(200), telefono: '600000001', correo: 'a@b.es', motivo: 'm'.repeat(500), vehiculo: 'v'.repeat(200), consentimiento: true });
  assertEquals(r.ok && r.datos.nombre.length, 80);
  assertEquals(r.ok && r.datos.motivo.length, 300);
  assertEquals(r.ok && r.datos.vehiculo.length, 80);
});

Deno.test('teléfono, matrícula, vehículo y fecha larga', () => {
  assertEquals(telefonoValido('+34 600 000 001'), true);
  assertEquals(telefonoValido('60000'), false);
  assertEquals(matriculaValida('1234ABC'), true);
  assertEquals(matriculaValida('M-1234-AB'), true);
  assertEquals(matriculaValida('ab'), false);
  assertEquals(descripcionVehiculo('Seat León', '1234ABC'), 'Seat León · 1234ABC');
  assertEquals(descripcionVehiculo('', '1234ABC'), '1234ABC');
  assertEquals(descripcionVehiculo('', ''), '');
  assertEquals(fechaHoraLarga(instanteMadrid('2026-11-17', '10:00')), 'martes, 17 de noviembre de 2026 a las 10:00');
});
