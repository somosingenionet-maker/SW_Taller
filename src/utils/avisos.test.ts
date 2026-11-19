import { describe, expect, it } from 'vitest';
import type { Alerta, AvisoCliente, Cliente, OrdenTrabajo, Vehiculo } from '../types';
import { agruparPorMes, canalDelCliente, construirAvisos, mensajeParaCliente, siguienteRepeticion, textoCanal, tipoEventoDe, type ConfigAvisos } from './avisos';

const HOY = '2026-11-20';
const config: ConfigAvisos = { automatico: true, antelacion: 14, itv: true, seguro: true, impuesto: true };

const cliente = (o: Partial<Cliente> = {}): Cliente => ({
  id: 'c1', nombre: 'Ana', apellidos: 'Gil', nifNiePasaporte: '', correo: 'ana@correo.es', telefono: '644 09 50 97', direccion: '', interacciones: [], fechaRegistro: '2026-01-01', vehiculosAsociados: ['v1'], ...o,
});
const vehiculo = (o: Partial<Vehiculo> = {}): Vehiculo => ({
  id: 'v1', marca: 'Seat', modelo: 'Ibiza', matricula: '1234ABC', bastidor: '', kilometraje: 50_000, itvVencimiento: '', seguroVencimiento: '', impuestoVencimiento: '', fechaRegistro: '2026-01-01', ...o,
});
const alerta = (o: Partial<Alerta> = {}): Alerta => ({ id: 'a1', vehiculoId: 'v1', tipo: 'itv', descripcion: '', estado: 'activa', fechaLimite: '2026-11-30', ...o });
const aviso = (o: Partial<AvisoCliente> = {}): AvisoCliente => ({ id: 'p1', clienteId: 'c1', vehiculoId: 'v1', motivo: 'Neumáticos', mensaje: '', avisarEn: '2026-11-20', estado: 'programado', ...o });

const orden = (o: Partial<OrdenTrabajo> = {}) => ({ id: 'ot1', numero: 'OT-1', clienteId: 'c1', vehiculoId: 'v1', estado: 'listo', esCambioAceite: true, ...o }) as OrdenTrabajo;

const construir = (o: { alertas?: Alerta[]; personalizados?: AvisoCliente[]; ordenes?: OrdenTrabajo[]; clientes?: Cliente[]; vehiculos?: Vehiculo[]; config?: Partial<ConfigAvisos> }) =>
  construirAvisos({ alertas: o.alertas ?? [], personalizados: o.personalizados ?? [], ordenes: o.ordenes, clientes: o.clientes ?? [cliente()], vehiculos: o.vehiculos ?? [vehiculo()], config: { ...config, ...o.config }, hoy: HOY });

describe('canalDelCliente', () => {
  it('correo válido → correo; sin correo con teléfono → whatsapp; nada → sin contacto; no avisar manda sobre todo', () => {
    expect(canalDelCliente(cliente())).toBe('correo');
    expect(canalDelCliente(cliente({ correo: '' }))).toBe('whatsapp');
    expect(canalDelCliente(cliente({ correo: 'sin-arroba', telefono: '' }))).toBe('sin_contacto');
    expect(canalDelCliente(cliente({ noAvisar: true }))).toBe('no_avisar');
    expect(canalDelCliente(undefined)).toBe('sin_contacto');
  });
});

describe('construirAvisos: vencimientos', () => {
  it('en plazo, con correo y envío automático → programado, sale en el próximo envío', () => {
    const [it] = construir({ alertas: [alerta()] });
    expect(it).toMatchObject({ fase: 'programado', enElProximoEnvio: true, canal: 'correo', cuando: 'Vence en 10 días', urgencia: 'luego' });
    expect(textoCanal(it, true)).toContain('próximo envío');
  });

  it('con el envío automático apagado nada sale solo: pasa a «para hoy» para enviarlo a mano', () => {
    const [it] = construir({ alertas: [alerta()], config: { automatico: false } });
    expect(it).toMatchObject({ fase: 'para_hoy', porQue: 'correo_manual' });
  });

  it('sin correo pero con teléfono → para hoy por WhatsApp; sin nada → sin contacto', () => {
    expect(construir({ alertas: [alerta()], clientes: [cliente({ correo: '' })] })[0]).toMatchObject({ fase: 'para_hoy', porQue: 'whatsapp' });
    expect(construir({ alertas: [alerta()], clientes: [cliente({ correo: '', telefono: '' })] })[0]).toMatchObject({ fase: 'para_hoy', porQue: 'sin_contacto' });
  });

  it('el cliente que no quiere avisos no aparece', () => {
    expect(construir({ alertas: [alerta()], clientes: [cliente({ noAvisar: true })] })).toEqual([]);
  });

  it('fuera de plazo → programado (aún no toca); ya avisado → avisado', () => {
    const lejos = construir({ alertas: [alerta({ fechaLimite: '2027-03-01' })] })[0];
    expect(lejos.fase).toBe('programado');
    expect(lejos.enElProximoEnvio).toBeUndefined();
    expect(construir({ alertas: [alerta({ recordatorioEnviadoEn: '2026-11-10T08:00:00Z' })] })[0]).toMatchObject({ fase: 'avisado' });
  });

  it('lo programado dice qué día saldrá: el vencimiento menos la antelación del taller', () => {
    const [it] = construir({ alertas: [alerta({ fechaLimite: '2027-03-01' })] });
    expect(it.saleEl).toBe('2027-02-15');
    expect(textoCanal(it, true)).toBe('Saldrá solo por correo el 15 feb. 2027');
    expect(textoCanal({ ...it, canal: 'whatsapp' }, true)).toBe('Por WhatsApp a partir del 15 feb. 2027: sin correo en su ficha');
    expect(construir({ alertas: [alerta({ fechaLimite: '2027-03-01' })], config: { antelacion: 30 } })[0].saleEl).toBe('2027-01-30');
  });

  it('vencida hace más de 30 días y nunca avisada: no sale sola aunque haya correo, decide una persona', () => {
    const [it] = construir({ alertas: [alerta({ fechaLimite: '2026-09-01' })] });
    expect(it).toMatchObject({ fase: 'para_hoy', porQue: 'vencido_antiguo', urgencia: 'vencido' });
    expect(it.cuando).toBe('Venció hace 80 días');
  });

  it('vencida hace poco con correo sigue saliendo sola', () => {
    expect(construir({ alertas: [alerta({ fechaLimite: '2026-11-10' })] })[0]).toMatchObject({ fase: 'programado', enElProximoEnvio: true, urgencia: 'vencido' });
  });

  it('un tipo desactivado en el taller no aparece; las atendidas tampoco', () => {
    expect(construir({ alertas: [alerta({ tipo: 'seguro' })], config: { seguro: false } })).toEqual([]);
    expect(construir({ alertas: [alerta({ estado: 'atendida' })] })).toEqual([]);
  });

  it('la antelación de cada taller manda: a 30 días ya está en plazo, a 7 todavía no', () => {
    const a = alerta({ fechaLimite: '2026-12-10' }); // en 20 días
    expect(construir({ alertas: [a], config: { antelacion: 30 } })[0].enElProximoEnvio).toBe(true);
    expect(construir({ alertas: [a], config: { antelacion: 7 } })[0].enElProximoEnvio).toBeUndefined();
  });
});

describe('construirAvisos: aceite', () => {
  const aceite = (o: Partial<Alerta> = {}) => alerta({ tipo: 'aceite', fechaLimite: '2026-11-25', ...o });

  it('en plazo y con correo → sale solo; sin correo → WhatsApp', () => {
    expect(construir({ alertas: [aceite()] })[0]).toMatchObject({ fase: 'programado', enElProximoEnvio: true, aviso: 'recordatorio' });
    expect(construir({ alertas: [aceite()], clientes: [cliente({ correo: '' })] })[0]).toMatchObject({ fase: 'para_hoy', porQue: 'whatsapp', aviso: 'recordatorio' });
  });

  it('pasada una semana de la fecha toca el «último aviso»', () => {
    expect(construir({ alertas: [aceite({ fechaLimite: '2026-11-10', recordatorioEnviadoEn: '2026-11-01T08:00:00Z' })], clientes: [cliente({ correo: '' })] })[0])
      .toMatchObject({ fase: 'para_hoy', aviso: 'vencido', cuando: 'Le tocaba el 10 nov. 2026' });
  });

  it('por kilometraje: cuando al coche le faltan 500 km o menos', () => {
    const it = construir({ alertas: [aceite({ fechaLimite: undefined, kilometrajeLimite: 50_300 })] })[0];
    expect(it).toMatchObject({ enElProximoEnvio: true, kmObjetivo: 50_300 });
    expect(it.cuando).toBe('A los 50.300 km (lleva 50.000)');
  });
});

describe('construirAvisos: personalizados', () => {
  it('con la fecha cumplida: correo → sale solo; sin correo → WhatsApp para hoy', () => {
    expect(construir({ personalizados: [aviso()] })[0]).toMatchObject({ fase: 'programado', enElProximoEnvio: true, motivo: 'Neumáticos' });
    expect(construir({ personalizados: [aviso()], clientes: [cliente({ correo: '' })] })[0]).toMatchObject({ fase: 'para_hoy', porQue: 'whatsapp', cuando: 'Avisar hoy' });
  });

  it('en el futuro queda programado, con el texto del día', () => {
    const [it] = construir({ personalizados: [aviso({ avisarEn: '2027-05-19' })] });
    expect(it).toMatchObject({ fase: 'programado', cuando: 'Avisar el 19 may. 2027', saleEl: '2027-05-19' });
    expect(it.enElProximoEnvio).toBeUndefined();
  });

  it('un aviso atrasado cuenta como vencido', () => {
    expect(construir({ personalizados: [aviso({ avisarEn: '2026-11-15' })], clientes: [cliente({ correo: '' })] })[0]).toMatchObject({ urgencia: 'vencido', cuando: 'Tocaba el 15 nov. 2026' });
  });

  it('por kilometraje', () => {
    const [it] = construir({ personalizados: [aviso({ avisarEn: undefined, avisarKm: 50_200 })] });
    expect(it).toMatchObject({ fase: 'programado', enElProximoEnvio: true });
    expect(construir({ personalizados: [aviso({ avisarEn: undefined, avisarKm: 80_000 })] })[0].enElProximoEnvio).toBeUndefined();
  });

  it('los ya enviados, hechos o descartados no aparecen; el cliente que no quiere avisos tampoco', () => {
    expect(construir({ personalizados: [aviso({ estado: 'enviado' }), aviso({ id: 'p2', estado: 'descartado' })] })).toEqual([]);
    expect(construir({ personalizados: [aviso()], clientes: [cliente({ noAvisar: true })] })).toEqual([]);
  });
});

describe('construirAvisos: cambio de aceite sin próximo cambio anotado', () => {
  it('una orden de aceite lista o entregada sin el próximo cambio anotado espera a una persona', () => {
    for (const estado of ['listo', 'entregado'] as const) {
      const [it] = construir({ ordenes: [orden({ estado })] });
      expect(it).toMatchObject({ origen: 'orden', fase: 'para_hoy', porQue: 'anotar_aceite', ordenId: 'ot1', ordenNumero: 'OT-1', urgencia: 'hoy', clave: 'o:ot1' });
      expect(it.cuando).toContain('OT-1');
    }
  });

  it('no sale si el próximo ya está anotado, si aún no está terminada, si no es de aceite o si el cliente no quiere avisos', () => {
    expect(construir({ ordenes: [orden({ aceiteAnotadoEn: '2026-11-13T10:00:00Z' })] })).toEqual([]);
    expect(construir({ ordenes: [orden({ estado: 'en_reparacion' }), orden({ id: 'ot2', estado: 'presupuesto' }), orden({ id: 'ot3', estado: 'cancelado' })] })).toEqual([]);
    expect(construir({ ordenes: [orden({ esCambioAceite: false })] })).toEqual([]);
    expect(construir({ ordenes: [orden()], clientes: [cliente({ noAvisar: true })] })).toEqual([]);
  });
});

describe('orden y agrupación', () => {
  it('lo vencido primero, de más a menos atrasado', () => {
    const items = construir({
      alertas: [alerta({ id: 'a1', fechaLimite: '2026-12-01' }), alerta({ id: 'a2', fechaLimite: '2026-11-18' }), alerta({ id: 'a3', fechaLimite: '2026-11-05' })],
    });
    expect(items.map((i) => i.alertaId)).toEqual(['a3', 'a2', 'a1']);
  });

  it('agrupa por mes, con los avisos por kilómetros al final', () => {
    const items = construir({ personalizados: [aviso({ id: 'x', avisarEn: '2027-02-10' }), aviso({ id: 'y', avisarEn: '2027-01-05' }), aviso({ id: 'z', avisarEn: undefined, avisarKm: 90_000 }), aviso({ id: 'w', avisarEn: '2027-01-20' })] });
    const grupos = agruparPorMes(items);
    expect(grupos.map((g) => g.titulo)).toEqual(['Enero de 2027', 'Febrero de 2027', 'Cuando alcancen los kilómetros']);
    expect(grupos[0].items.map((i) => i.avisoId)).toEqual(['y', 'w']);
  });
});

describe('mensajeParaCliente', () => {
  const empresa = { nombre: 'Taller Gil', plantillasRecordatorios: {}, reservasActivas: true, reservasSlug: 'taller-gil' };

  it('rellena las variables y añade el enlace de reserva si el taller lo tiene', () => {
    const t = mensajeParaCliente({ origen: 'alerta', tipo: 'itv' }, { empresa, cliente: cliente(), vehiculo: vehiculo(), alerta: alerta({ fechaLimite: '2026-12-05' }), origen: 'https://motor.doonty.com' });
    expect(t).toContain('Hola Ana');
    expect(t).toContain('la ITV de tu vehículo Seat Ibiza (1234ABC) vence el 5/12/2026');
    expect(t).toContain('https://motor.doonty.com/reservar/taller-gil');
  });

  it('sin reservas activas no añade enlace; usa el texto propio del taller si lo cambió', () => {
    const t = mensajeParaCliente({ origen: 'alerta', tipo: 'seguro' }, {
      empresa: { ...empresa, reservasActivas: false, plantillasRecordatorios: { seguro: 'Ana, tu seguro vence el {{fecha}}' } }, cliente: cliente(), vehiculo: vehiculo(), alerta: alerta({ fechaLimite: '2026-12-05' }), origen: 'https://x.es',
    });
    expect(t).toBe('Ana, tu seguro vence el 5/12/2026');
  });

  it('personalizado: su propio texto, o el del motivo si lo dejó vacío', () => {
    const base = { empresa: { ...empresa, reservasActivas: false }, cliente: cliente(), vehiculo: vehiculo(), origen: '' };
    expect(mensajeParaCliente({ origen: 'personalizado', tipo: 'personalizado' }, { ...base, personalizado: { motivo: 'Neumáticos', mensaje: 'Ana, los neumáticos del {{vehiculo}}' } })).toBe('Ana, los neumáticos del Seat Ibiza (1234ABC)');
    expect(mensajeParaCliente({ origen: 'personalizado', tipo: 'personalizado' }, { ...base, personalizado: { motivo: 'Neumáticos', mensaje: '  ' } })).toContain('revisar los neumáticos de tu vehículo Seat Ibiza (1234ABC)');
  });

  it('aceite vencido usa el texto del último aviso', () => {
    const t = mensajeParaCliente({ origen: 'alerta', tipo: 'aceite', aviso: 'vencido' }, { empresa: { ...empresa, reservasActivas: false }, cliente: cliente(), vehiculo: vehiculo(), alerta: alerta({ fechaLimite: '2026-11-10' }), origen: '' });
    expect(t).toContain('le tocaba el cambio de aceite el 10/11/2026');
  });
});

describe('tipoEventoDe y siguienteRepeticion', () => {
  it('traduce al evento del historial', () => {
    expect(tipoEventoDe({ tipo: 'itv' })).toBe('itv_proxima');
    expect(tipoEventoDe({ tipo: 'aceite', aviso: 'vencido' })).toBe('aceite_vencido');
    expect(tipoEventoDe({ tipo: 'aceite', aviso: 'recordatorio' })).toBe('cambio_aceite');
    expect(tipoEventoDe({ tipo: 'personalizado' })).toBe('aviso_personalizado');
  });

  it('un aviso que se repite cada 6 meses cuenta desde su fecha, o desde hoy si ya quedó atrás', () => {
    expect(siguienteRepeticion('2026-11-20', 6, HOY)).toBe('2027-05-20');
    expect(siguienteRepeticion('2026-03-01', 6, HOY)).toBe('2027-05-20');
  });
});
