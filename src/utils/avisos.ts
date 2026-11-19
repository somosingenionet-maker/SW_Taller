import type { Alerta, AlertaTipo, AvisoCliente, Cliente, Empresa, NotificacionCliente, OrdenTrabajo, Vehiculo } from '../types';
import { avisoAceitePendiente, diasHasta, sumarMeses } from './aceite';
import { sumarDias } from './compras';
import { formatDate } from './dateFormat';
import { formatKm } from './moneda';
import { MOTIVOS_AVISO, PLANTILLA_ACEITE_VENCIDO, PLANTILLA_DEFAULT, sustituirVariables } from './recordatorioTemplates';
import { telefonoWhatsApp } from './telefono';

// Cola de avisos del taller: junta las alertas de vencimientos (ITV, seguro, impuesto, aceite) y los avisos personalizados,
// decide qué sale solo y qué necesita a una persona, y lo ordena por urgencia. Es lo que pinta la pantalla «Avisos»;
// lo que se envía de verdad solo lo decide el servidor (supabase/functions/enviar-recordatorios), con las mismas reglas.

/** ITV, seguro e impuesto vencidos hace más de estos días no salen solos: el dato probablemente ya no vale y decide una persona. */
export const DIAS_TOPE_VENCIDO = 30;
/** Un aviso por kilometraje sale cuando al coche le faltan estos km (o menos). */
export const KM_AVISO = 500;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type CanalAviso = 'correo' | 'whatsapp' | 'sin_contacto' | 'no_avisar';
/** `para_hoy`: necesita a una persona. `programado`: saldrá solo (o aún no toca). `avisado`: ya se avisó y sigue abierto. */
export type FaseAviso = 'para_hoy' | 'programado' | 'avisado';
export type Urgencia = 'vencido' | 'hoy' | 'pronto' | 'luego';
/** Por qué un aviso espera a una persona. */
export type PorQue = 'whatsapp' | 'correo_manual' | 'sin_contacto' | 'vencido_antiguo' | 'anotar_aceite';

export interface ConfigAvisos {
  /** El interruptor general de envíos automáticos (Configuración → Recordatorios). */
  automatico: boolean;
  antelacion: number;
  itv: boolean;
  seguro: boolean;
  impuesto: boolean;
}

export const configDeEmpresa = (e: Pick<Empresa, 'recordatoriosAutomaticosActivos' | 'avisosAntelacionDias' | 'avisosItv' | 'avisosSeguro' | 'avisosImpuesto'>): ConfigAvisos => ({
  automatico: e.recordatoriosAutomaticosActivos, antelacion: e.avisosAntelacionDias, itv: e.avisosItv, seguro: e.avisosSeguro, impuesto: e.avisosImpuesto,
});

export interface ItemAviso {
  clave: string;
  /** `orden`: una orden de cambio de aceite lista o entregada a la que falta anotar el próximo cambio (sin eso no habrá aviso). */
  origen: 'alerta' | 'personalizado' | 'orden';
  ordenId?: string;
  ordenNumero?: string;
  alertaId?: string;
  avisoId?: string;
  tipo: AlertaTipo | 'personalizado';
  motivo: string;
  clienteId?: string;
  vehiculoId?: string;
  fase: FaseAviso;
  canal: CanalAviso;
  porQue?: PorQue;
  /** Programado y ya en plazo: sale en el próximo envío diario. */
  enElProximoEnvio?: boolean;
  /** Día en que saldrá el aviso (vencimiento menos la antelación del taller; en los personalizados, la fecha elegida). Null si depende de los km. */
  saleEl?: string | null;
  /** Aceite: qué correo toca (el recordatorio o el último aviso por vencido). */
  aviso?: 'recordatorio' | 'vencido';
  /** Día en que se avisa (personalizado) o vencimiento (ITV, seguro, impuesto, aceite). Null si solo es por kilometraje. */
  fecha: string | null;
  kmObjetivo: number | null;
  /** Días desde hoy hasta `fecha` (negativo = ya pasó). */
  dias: number | null;
  urgencia: Urgencia;
  /** Frase para la fila: «Venció hace 12 días», «Avisar el 19 may. 2027»… */
  cuando: string;
}

export const ETIQUETA_TIPO: Record<AlertaTipo, string> = { itv: 'ITV', seguro: 'Seguro', impuesto: 'Impuesto de circulación', aceite: 'Cambio de aceite' };
const TIPO_EVENTO: Record<AlertaTipo, NotificacionCliente['tipoEvento']> = { itv: 'itv_proxima', seguro: 'vencimiento_seguro', impuesto: 'impuesto_proximo', aceite: 'cambio_aceite' };

export function tipoEventoDe(item: Pick<ItemAviso, 'tipo' | 'aviso'>): NotificacionCliente['tipoEvento'] {
  if (item.tipo === 'personalizado') return 'aviso_personalizado';
  return item.tipo === 'aceite' && item.aviso === 'vencido' ? 'aceite_vencido' : TIPO_EVENTO[item.tipo];
}

/** Cómo se le puede avisar a este cliente. */
export function canalDelCliente(c: Pick<Cliente, 'correo' | 'telefono' | 'noAvisar'> | undefined): CanalAviso {
  if (!c) return 'sin_contacto';
  if (c.noAvisar) return 'no_avisar';
  if (CORREO_VALIDO.test((c.correo ?? '').trim())) return 'correo';
  return telefonoWhatsApp(c.telefono).length >= 9 ? 'whatsapp' : 'sin_contacto';
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

function urgenciaDe(dias: number | null, antelacion: number): Urgencia {
  if (dias == null) return 'luego';
  if (dias < 0) return 'vencido';
  if (dias === 0) return 'hoy';
  return dias <= Math.min(antelacion, 7) ? 'pronto' : 'luego';
}

function cuandoVencimiento(dias: number, fecha: string): string {
  if (dias < 0) return `Venció hace ${-dias} ${plural(-dias, 'día', 'días')}`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return dias <= 60 ? `Vence en ${dias} días` : `Vence el ${formatDate(fecha)}`;
}

function cuandoAceiteFila(dias: number | null, fecha: string | null, km: number | null, kmActual?: number): string {
  const partes: string[] = [];
  if (fecha) partes.push(`${dias != null && dias < 0 ? 'Le tocaba' : 'Le toca'} el ${formatDate(fecha)}`);
  if (km != null) partes.push(`${fecha ? 'o a' : 'A'} los ${formatKm(km)} km${kmActual != null ? ` (lleva ${formatKm(kmActual)})` : ''}`);
  return partes.join(' ') || 'Sin fecha';
}

function cuandoPersonalizado(dias: number | null, fecha: string | null, km: number | null, kmActual?: number): string {
  const partes: string[] = [];
  if (fecha) partes.push(dias != null && dias < 0 ? `Tocaba el ${formatDate(fecha)}` : dias === 0 ? 'Avisar hoy' : `Avisar el ${formatDate(fecha)}`);
  if (km != null) partes.push(`${fecha ? 'o a' : 'Avisar a'} los ${formatKm(km)} km${kmActual != null ? ` (lleva ${formatKm(kmActual)})` : ''}`);
  return partes.join(' ');
}

function porQueEspera(canal: CanalAviso, automatico: boolean): PorQue | null {
  if (canal === 'correo') return automatico ? null : 'correo_manual';
  if (canal === 'whatsapp') return 'whatsapp';
  if (canal === 'sin_contacto') return 'sin_contacto';
  return null; // no_avisar: no se le avisa
}

export interface EntradaAvisos {
  alertas: Alerta[];
  personalizados: AvisoCliente[];
  /** Órdenes cargadas por la aplicación (activas y entregadas hace poco). Solo se miran las de cambio de aceite. */
  ordenes?: OrdenTrabajo[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  config: ConfigAvisos;
  /** «AAAA-MM-DD» */
  hoy: string;
}

/** Todos los avisos abiertos del taller, ordenados por urgencia. Los clientes que pidieron no recibir avisos no aparecen. */
export function construirAvisos({ alertas, personalizados, ordenes = [], clientes, vehiculos, config, hoy }: EntradaAvisos): ItemAviso[] {
  const vehiculoPorId = new Map(vehiculos.map((v) => [v.id, v]));
  const clientePorId = new Map(clientes.map((c) => [c.id, c]));
  const clienteDeVehiculo = new Map<string, Cliente>();
  for (const c of clientes) for (const v of c.vehiculosAsociados ?? []) clienteDeVehiculo.set(v, c);
  const items: ItemAviso[] = [];

  for (const a of alertas) {
    if (a.estado === 'atendida') continue;
    if (a.tipo !== 'aceite' && !config[a.tipo]) continue;
    const veh = vehiculoPorId.get(a.vehiculoId);
    if (!veh) continue;
    const cli = clienteDeVehiculo.get(veh.id);
    const canal = canalDelCliente(cli);
    if (canal === 'no_avisar') continue;
    const fecha = a.fechaLimite ? a.fechaLimite.slice(0, 10) : null;
    const kmObjetivo = a.tipo === 'aceite' ? a.kilometrajeLimite ?? null : null;
    if (!fecha && kmObjetivo == null) continue;
    const dias = fecha ? diasHasta(fecha, hoy) : null;
    const base = {
      clave: `a:${a.id}`, origen: 'alerta' as const, alertaId: a.id, tipo: a.tipo, motivo: ETIQUETA_TIPO[a.tipo],
      clienteId: cli?.id, vehiculoId: veh.id, canal, fecha, kmObjetivo, dias, urgencia: urgenciaDe(dias, config.antelacion),
    };

    if (a.tipo === 'aceite') {
      const toca = avisoAceitePendiente(a, veh.kilometraje, hoy, config.antelacion);
      const cuando = cuandoAceiteFila(dias, fecha, kmObjetivo, veh.kilometraje);
      if (toca) {
        const porQue = porQueEspera(canal, config.automatico);
        items.push(porQue
          ? { ...base, cuando, fase: 'para_hoy', porQue, aviso: toca }
          : { ...base, cuando, fase: 'programado', enElProximoEnvio: true, aviso: toca });
      } else {
        items.push({ ...base, cuando, fase: a.recordatorioEnviadoEn ? 'avisado' : 'programado', saleEl: fecha ? sumarDias(fecha, -config.antelacion) : null });
      }
      continue;
    }

    // ITV, seguro e impuesto
    const d = dias!;
    const cuando = cuandoVencimiento(d, fecha!);
    if (a.recordatorioEnviadoEn) { items.push({ ...base, cuando, fase: 'avisado' }); continue; }
    if (d > config.antelacion) { items.push({ ...base, cuando, fase: 'programado', saleEl: sumarDias(fecha!, -config.antelacion) }); continue; }
    if (d < -DIAS_TOPE_VENCIDO) { items.push({ ...base, cuando, fase: 'para_hoy', porQue: 'vencido_antiguo' }); continue; }
    const porQue = porQueEspera(canal, config.automatico);
    items.push(porQue ? { ...base, cuando, fase: 'para_hoy', porQue } : { ...base, cuando, fase: 'programado', enElProximoEnvio: true });
  }

  for (const p of personalizados) {
    if (p.estado !== 'programado') continue;
    const cli = clientePorId.get(p.clienteId);
    const veh = p.vehiculoId ? vehiculoPorId.get(p.vehiculoId) : undefined;
    const canal = canalDelCliente(cli);
    if (canal === 'no_avisar') continue;
    const fecha = p.avisarEn ? p.avisarEn.slice(0, 10) : null;
    const dias = fecha ? diasHasta(fecha, hoy) : null;
    const kmObjetivo = p.avisarKm ?? null;
    const porFecha = dias != null && dias <= 0;
    const porKm = kmObjetivo != null && veh != null && kmObjetivo - veh.kilometraje <= KM_AVISO;
    const base = {
      clave: `p:${p.id}`, origen: 'personalizado' as const, avisoId: p.id, tipo: 'personalizado' as const, motivo: p.motivo,
      clienteId: p.clienteId, vehiculoId: p.vehiculoId, canal, fecha, kmObjetivo, dias,
      urgencia: porKm && !porFecha ? 'hoy' as const : urgenciaDe(dias, config.antelacion),
      cuando: cuandoPersonalizado(dias, fecha, kmObjetivo, veh?.kilometraje),
    };
    if (!porFecha && !porKm) { items.push({ ...base, fase: 'programado', saleEl: fecha }); continue; }
    const porQue = porQueEspera(canal, config.automatico);
    items.push(porQue ? { ...base, fase: 'para_hoy', porQue } : { ...base, fase: 'programado', enElProximoEnvio: true });
  }

  // Un cambio de aceite ya hecho (orden lista o entregada) sin el próximo cambio anotado: nunca habrá aviso hasta que se anote.
  for (const o of ordenes) {
    if (!o.esCambioAceite || o.aceiteAnotadoEn || (o.estado !== 'listo' && o.estado !== 'entregado')) continue;
    const cli = clientePorId.get(o.clienteId);
    const canal = canalDelCliente(cli);
    if (canal === 'no_avisar') continue;
    items.push({
      clave: `o:${o.id}`, origen: 'orden', ordenId: o.id, ordenNumero: o.numero, tipo: 'aceite', motivo: 'Cambio de aceite',
      clienteId: o.clienteId, vehiculoId: o.vehiculoId, fase: 'para_hoy', porQue: 'anotar_aceite', canal,
      fecha: null, kmObjetivo: null, dias: null, urgencia: 'hoy',
      cuando: `Falta anotar cuándo le toca el próximo · ${o.numero}`,
    });
  }

  return ordenarAvisos(items);
}

const RANGO: Record<Urgencia, number> = { vencido: 0, hoy: 1, pronto: 2, luego: 3 };

/** Más urgente primero; a igual urgencia, el que lleva más tiempo esperando (o el más cercano). */
export function ordenarAvisos(items: ItemAviso[]): ItemAviso[] {
  return [...items].sort((a, b) =>
    RANGO[a.urgencia] - RANGO[b.urgencia]
    || (a.dias ?? Number.MAX_SAFE_INTEGER) - (b.dias ?? Number.MAX_SAFE_INTEGER)
    || a.clave.localeCompare(b.clave));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface GrupoMes { clave: string; titulo: string; items: ItemAviso[] }

/** Agrupa por mes de la fecha, de más cercano a más lejano; lo que solo depende de los km va al final. */
export function agruparPorMes(items: ItemAviso[]): GrupoMes[] {
  const grupos = new Map<string, GrupoMes>();
  const ordenados = [...items].sort((a, b) => (a.fecha ?? '9999-99-99').localeCompare(b.fecha ?? '9999-99-99') || a.clave.localeCompare(b.clave));
  for (const it of ordenados) {
    const clave = it.fecha ? it.fecha.slice(0, 7) : 'km';
    if (!grupos.has(clave)) {
      const titulo = clave === 'km' ? 'Cuando alcancen los kilómetros' : `${MESES[Number(clave.slice(5, 7)) - 1][0].toUpperCase()}${MESES[Number(clave.slice(5, 7)) - 1].slice(1)} de ${clave.slice(0, 4)}`;
      grupos.set(clave, { clave, titulo, items: [] });
    }
    grupos.get(clave)!.items.push(it);
  }
  return [...grupos.values()];
}

/** Quién y cómo: «Sale solo por correo», «Por WhatsApp», «Falta teléfono o correo»… */
export function textoCanal(it: Pick<ItemAviso, 'canal' | 'enElProximoEnvio' | 'saleEl'>, automatico: boolean): string {
  if (it.canal === 'correo') return automatico ? (it.enElProximoEnvio ? 'Sale solo en el próximo envío diario' : it.saleEl ? `Saldrá solo por correo el ${formatDate(it.saleEl)}` : 'Saldrá solo por correo') : 'Por correo (envío automático desactivado)';
  if (it.canal === 'whatsapp' && it.saleEl) return `Por WhatsApp a partir del ${formatDate(it.saleEl)}: sin correo en su ficha`;
  if (it.canal === 'whatsapp') return 'Por WhatsApp: sin correo en su ficha';
  return 'Sin correo ni teléfono en su ficha';
}

// ---- Mensajes ----

const fechaCorta = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d}/${m}/${a}`; };

/** «el 12/5/2027», «a los 100.000 km» o las dos cosas (misma frase que el correo automático). */
export function cuandoAceite(fecha: string | null | undefined, km: number | null | undefined): string {
  if (fecha && km != null) return `el ${fechaCorta(fecha)} o a los ${formatKm(km)} km, lo que ocurra antes`;
  if (fecha) return `el ${fechaCorta(fecha)}`;
  if (km != null) return `a los ${formatKm(km)} km`;
  return 'próximamente';
}

export const descripcionVehiculo = (v?: Pick<Vehiculo, 'marca' | 'modelo' | 'matricula'>) => (v ? `${v.marca} ${v.modelo} (${v.matricula})` : '');

/** Enlace de reserva online del taller, si la tiene activa. */
export function enlaceReserva(empresa: Pick<Empresa, 'reservasActivas' | 'reservasSlug'>, origen: string): string | null {
  return empresa.reservasActivas && empresa.reservasSlug && origen ? `${origen}/reservar/${empresa.reservasSlug}` : null;
}

/** Texto del aviso tal como lo recibe el cliente (WhatsApp asistido y vista previa), con el enlace de reserva si procede. */
export function mensajeParaCliente(
  item: Pick<ItemAviso, 'origen' | 'tipo' | 'aviso'>,
  ctx: {
    empresa: Pick<Empresa, 'nombre' | 'plantillasRecordatorios' | 'reservasActivas' | 'reservasSlug'>;
    cliente: Pick<Cliente, 'nombre'>;
    vehiculo?: Pick<Vehiculo, 'marca' | 'modelo' | 'matricula'>;
    alerta?: Pick<Alerta, 'fechaLimite' | 'kilometrajeLimite'>;
    personalizado?: Pick<AvisoCliente, 'mensaje' | 'motivo'>;
    origen: string;
  },
): string {
  let plantilla: string;
  if (item.origen === 'personalizado') {
    plantilla = ctx.personalizado?.mensaje.trim() || MOTIVOS_AVISO.find((m) => m.etiqueta === ctx.personalizado?.motivo)?.mensaje || MOTIVOS_AVISO.at(-1)!.mensaje;
  } else if (item.tipo === 'aceite' && item.aviso === 'vencido') {
    plantilla = PLANTILLA_ACEITE_VENCIDO;
  } else {
    const t = item.tipo as AlertaTipo;
    plantilla = ctx.empresa.plantillasRecordatorios[t]?.trim() || PLANTILLA_DEFAULT[t];
  }
  const texto = sustituirVariables(plantilla, {
    cliente: ctx.cliente.nombre,
    vehiculo: descripcionVehiculo(ctx.vehiculo),
    empresa: ctx.empresa.nombre,
    fecha: ctx.alerta?.fechaLimite ? fechaCorta(ctx.alerta.fechaLimite) : '',
    km: ctx.alerta?.kilometrajeLimite != null ? formatKm(ctx.alerta.kilometrajeLimite) : '',
    cuando: cuandoAceite(ctx.alerta?.fechaLimite, ctx.alerta?.kilometrajeLimite),
  });
  const reserva = enlaceReserva(ctx.empresa, ctx.origen);
  return reserva ? `${texto}\n\nPuedes pedir tu cita aquí: ${reserva}` : texto;
}

/** Fecha en que se vuelve a programar un aviso que se repite: cuenta desde la fecha prevista, o desde hoy si ya quedó atrás. */
export function siguienteRepeticion(avisarEn: string, repetirMeses: number, hoy: string): string {
  const [a, m, d] = avisarEn.slice(0, 10).split('-').map(Number);
  let fecha = sumarMeses(repetirMeses, new Date(a, m - 1, d));
  if (fecha <= hoy) {
    const [ha, hm, hd] = hoy.split('-').map(Number);
    fecha = sumarMeses(repetirMeses, new Date(ha, hm - 1, hd));
  }
  return fecha;
}

export const hoyLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
