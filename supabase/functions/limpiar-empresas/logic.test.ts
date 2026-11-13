import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { construirAviso, fechaLarga, planificarCuenta, type Cuenta } from './logic.ts';

const DIA = 86_400_000;
const AHORA = new Date('2026-11-13T03:15:00Z');
const en = (dias: number) => new Date(AHORA.getTime() + dias * DIA).toISOString();

const cuenta = (o: Partial<Cuenta> = {}): Cuenta => ({
  empresa_id: 't1', nombre: 'Taller', acceso_hasta: en(-90), estado: 'prueba', fin_conservacion: en(0), retencion: null,
  aviso1_en: null, aviso2_en: null, borrado_previsto_en: null, correos_aviso: ['admin@taller.es'], ...o,
});

Deno.test('una cuenta retenida (facturas emitidas o suscripción activa) nunca se toca, ni avisa ni borra', () => {
  for (const retencion of ['facturas_emitidas', 'suscripcion_activa']) {
    assertEquals(planificarCuenta(cuenta({ retencion, fin_conservacion: en(-200), aviso1_en: en(-100), aviso2_en: en(-90), borrado_previsto_en: en(-80) }), AHORA).tipo, 'nada');
  }
});

Deno.test('sin avisar: no toca hasta que faltan 30 días o menos', () => {
  assertEquals(planificarCuenta(cuenta({ fin_conservacion: en(31) }), AHORA).tipo, 'nada');
  assertEquals(planificarCuenta(cuenta({ fin_conservacion: en(60) }), AHORA).tipo, 'nada');
  assertEquals(planificarCuenta(cuenta({ fin_conservacion: en(30) }), AHORA).tipo, 'aviso1');
});

Deno.test('primer aviso: la fecha de borrado es la fecha de fin de conservación si aún falta', () => {
  const a = planificarCuenta(cuenta({ fin_conservacion: en(20) }), AHORA);
  assertEquals(a, { tipo: 'aviso1', borradoPrevisto: en(20) });
});

Deno.test('una cuenta vieja que ya pasó la fecha NO se borra: primero el aviso, con 14 días de margen', () => {
  const a = planificarCuenta(cuenta({ fin_conservacion: en(-200) }), AHORA);
  assertEquals(a, { tipo: 'aviso1', borradoPrevisto: en(14) });
});

Deno.test('sin ningún administrador con correo válido no se avisa (y por tanto no se borra)', () => {
  for (const correos of [null, [], [''], ['no-es-un-correo']]) {
    assertEquals(planificarCuenta(cuenta({ fin_conservacion: en(10), correos_aviso: correos }), AHORA).tipo, 'sin_destinatario');
  }
  // …y tampoco se borra aunque se hubiera avisado antes y ya no quede nadie
  const previa = cuenta({ fin_conservacion: en(-100), aviso1_en: en(-40), borrado_previsto_en: en(-26), correos_aviso: null });
  assertEquals(planificarCuenta(previa, AHORA).tipo, 'sin_destinatario');
});

Deno.test('avisada una vez: espera hasta 7 días antes y entonces manda el último aviso', () => {
  const base = { fin_conservacion: en(-5), aviso1_en: en(-20), borrado_previsto_en: en(10) };
  assertEquals(planificarCuenta(cuenta(base), AHORA).tipo, 'nada');
  assertEquals(planificarCuenta(cuenta({ ...base, borrado_previsto_en: en(8) }), AHORA).tipo, 'nada');
  assertEquals(planificarCuenta(cuenta({ ...base, borrado_previsto_en: en(7) }), AHORA), { tipo: 'aviso2', borradoPrevisto: en(7) });
  assertEquals(planificarCuenta(cuenta({ ...base, borrado_previsto_en: en(-1) }), AHORA).tipo, 'aviso2'); // se retrasó el cron: aviso tardío, aún sin borrar
});

Deno.test('con los dos avisos: no se borra antes de la fecha prevista', () => {
  const c = cuenta({ fin_conservacion: en(-10), aviso1_en: en(-30), aviso2_en: en(-7), borrado_previsto_en: en(1) });
  assertEquals(planificarCuenta(c, AHORA).tipo, 'nada');
});

Deno.test('con los dos avisos: se borra pasada la fecha prevista', () => {
  const c = cuenta({ fin_conservacion: en(-10), aviso1_en: en(-30), aviso2_en: en(-7), borrado_previsto_en: en(-1) });
  assertEquals(planificarCuenta(c, AHORA), { tipo: 'borrar' });
});

Deno.test('con los dos avisos: no se borra antes de 3 días tras el último aviso, aunque la fecha ya pasara', () => {
  const tarde = cuenta({ fin_conservacion: en(-60), aviso1_en: en(-30), aviso2_en: en(-1), borrado_previsto_en: en(-20) });
  assertEquals(planificarCuenta(tarde, AHORA).tipo, 'nada');
  assertEquals(planificarCuenta({ ...tarde, aviso2_en: en(-3) }, AHORA).tipo, 'borrar');
});

Deno.test('nunca se borra sin haber enviado el último aviso, por viejo que sea todo lo demás', () => {
  const sinUltimo = cuenta({ acceso_hasta: en(-600), fin_conservacion: en(-500), aviso1_en: en(-400), borrado_previsto_en: en(-300), aviso2_en: null });
  assertEquals(planificarCuenta(sinUltimo, AHORA).tipo, 'aviso2');
  const sinNada = cuenta({ fin_conservacion: en(-500) });
  assertEquals(planificarCuenta(sinNada, AHORA).tipo, 'aviso1');
});

Deno.test('estados rotos no borran: aviso enviado sin fecha prevista, o fecha ilegible', () => {
  assertEquals(planificarCuenta(cuenta({ aviso1_en: en(-30), borrado_previsto_en: null }), AHORA).tipo, 'nada');
  assertEquals(planificarCuenta(cuenta({ fin_conservacion: 'no-es-fecha' }), AHORA).tipo, 'nada');
});

Deno.test('fechaLarga usa la fecha de Madrid', () => {
  assertEquals(fechaLarga('2027-02-12T09:00:00Z'), '12 de febrero de 2027');
  assertEquals(fechaLarga('2027-02-11T23:30:00Z'), '12 de febrero de 2027'); // ya es 12 en Madrid
});

Deno.test('el primer aviso dice cuándo, qué se pierde y qué hacer; el último, que es el último', () => {
  const primero = construirAviso({ nombre: 'Talleres Ruiz', acceso_hasta: '2026-08-10T00:00:00Z' }, 'primero', '2027-02-12T00:00:00Z');
  assertStringIncludes(primero.asunto, 'se eliminará el 12 de febrero de 2027');
  assertStringIncludes(primero.html, 'solo lectura desde el 10 de agosto de 2026');
  assertStringIncludes(primero.html, 'Esto no se puede deshacer');
  assertStringIncludes(primero.html, 'suscríbete');
  assertStringIncludes(primero.html, 'exportar');
  assertStringIncludes(primero.html, 'send@doonty.com');
  const ultimo = construirAviso({ nombre: 'Talleres Ruiz', acceso_hasta: '2026-08-10T00:00:00Z' }, 'ultimo', '2027-02-12T00:00:00Z');
  assertStringIncludes(ultimo.asunto, 'Último aviso');
  assertStringIncludes(ultimo.html, 'último aviso');
});

Deno.test('el nombre del taller se escapa en el correo', () => {
  const { html } = construirAviso({ nombre: '<script>alert(1)</script> & Cía', acceso_hasta: '2026-08-10T00:00:00Z' }, 'primero', '2027-02-12T00:00:00Z');
  assertEquals(html.includes('<script>'), false);
  assertStringIncludes(html, '&lt;script&gt;');
  assertStringIncludes(html, '&amp; Cía');
});

Deno.test('si el acceso se amplió después del aviso, se reinician los avisos y NO se borra', () => {
  const c = cuenta({ acceso_hasta: en(-5), fin_conservacion: en(85), aviso1_en: en(-40), aviso2_en: en(-10), borrado_previsto_en: en(-3) });
  assertEquals(planificarCuenta(c, AHORA), { tipo: 'reiniciar' });
  // aviso normal: posterior al fin del acceso → sigue su curso
  const normal = cuenta({ acceso_hasta: en(-100), fin_conservacion: en(-10), aviso1_en: en(-40), aviso2_en: en(-10), borrado_previsto_en: en(-3) });
  assertEquals(planificarCuenta(normal, AHORA).tipo, 'borrar');
});
