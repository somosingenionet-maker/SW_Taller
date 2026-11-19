import { useMemo, useState } from 'react';
import { BellPlus, CheckCircle2, Mail, MessageCircle, PhoneOff, Send, TriangleAlert } from 'lucide-react';
import type { AlertaTipo, Alerta, AvisoCliente, Cliente, Empresa, NotificacionCliente, Vehiculo } from '../types';
import type { NuevoAviso as DatosAviso } from '../lib/data/avisos';
import { waHref } from '../utils/whatsapp';
import { agruparPorMes, descripcionVehiculo, mensajeParaCliente, textoCanal, type ItemAviso } from '../utils/avisos';
import { proximaRenovacion } from '../utils/renovacion';
import { formatDate } from '../utils/dateFormat';
import { NOMBRE_EVENTO, textoDeHtml } from '../utils/textoHtml';
import { mensajeDeError } from '../lib/errores';
import ConfirmDialog from '../components/ConfirmDialog';
import NuevoAviso from '../components/NuevoAviso';
import { Boton, Matricula, Tarjeta, Ventana } from './componentes';

interface Props {
  empresa: Empresa;
  esAdmin: boolean;
  items: ItemAviso[];
  alertas: Alerta[];
  personalizados: AvisoCliente[];
  notificaciones: NotificacionCliente[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  hoy: string;
  onEnviarCorreo: (ref: { alertaId?: string; avisoId?: string }) => Promise<void>;
  /** Anota que una persona del taller avisó por WhatsApp (historial + estado del aviso). */
  onAvisoManual: (item: ItemAviso, mensaje: string) => Promise<void>;
  onRenovar: (vehiculoId: string, tipo: Exclude<AlertaTipo, 'aceite'>, nuevaFecha: string) => Promise<void>;
  onDescartar: (item: ItemAviso) => Promise<void>;
  onCrearAviso: (a: DatosAviso) => Promise<void>;
  onActivarAutomatico: () => Promise<void>;
  onAbrirAjustes: () => void;
}

type Vista = 'hoy' | 'programados' | 'avisados';
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const nombreCliente = (c?: Cliente) => (c ? `${c.nombre} ${c.apellidos}`.trim() : 'Cliente sin ficha');

/**
 * «Avisos»: lo que hay que decirle a los clientes y cuándo. Lo que tiene correo sale solo; lo demás aparece en «Para hoy» con un botón
 * de WhatsApp. Junta los vencimientos (ITV, seguro, impuesto, aceite) y los avisos personalizados («neumáticos en 6 meses»).
 */
export default function AvisosTab({
  empresa, esAdmin, items, alertas, personalizados, notificaciones, clientes, vehiculos, hoy,
  onEnviarCorreo, onAvisoManual, onRenovar, onDescartar, onCrearAviso, onActivarAutomatico, onAbrirAjustes,
}: Props) {
  const [vista, setVista] = useState<Vista>('hoy');
  const [nuevo, setNuevo] = useState(false);
  const [confirmando, setConfirmando] = useState<{ item: ItemAviso; mensaje: string } | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<{ clave: string; texto: string } | null>(null);
  const [descartando, setDescartando] = useState<ItemAviso | null>(null);
  const [renovando, setRenovando] = useState<ItemAviso | null>(null);
  const [activando, setActivando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);

  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const vehiculoPorId = useMemo(() => new Map(vehiculos.map((v) => [v.id, v])), [vehiculos]);
  const alertaPorId = useMemo(() => new Map(alertas.map((a) => [a.id, a])), [alertas]);
  const avisoPorId = useMemo(() => new Map(personalizados.map((p) => [p.id, p])), [personalizados]);
  const automatico = empresa.recordatoriosAutomaticosActivos;

  const paraHoy = items.filter((i) => i.fase === 'para_hoy');
  const programados = items.filter((i) => i.fase === 'programado');
  const avisados = items.filter((i) => i.fase === 'avisado');
  const enProximoEnvio = programados.filter((i) => i.enElProximoEnvio);
  const mesesProgramados = useMemo(() => agruparPorMes(programados.filter((i) => !i.enElProximoEnvio)), [programados]);

  const ejecutar = async (item: ItemAviso, accion: () => Promise<void>, fallo: string) => {
    setError(null);
    setTrabajando(item.clave);
    try { await accion(); } catch (e) { setError({ clave: item.clave, texto: mensajeDeError(e, fallo) }); } finally { setTrabajando(null); }
  };

  const mensajeDe = (item: ItemAviso): string | null => {
    const cliente = item.clienteId ? clientePorId.get(item.clienteId) : undefined;
    if (!cliente) return null;
    return mensajeParaCliente(item, {
      empresa, cliente, vehiculo: item.vehiculoId ? vehiculoPorId.get(item.vehiculoId) : undefined,
      alerta: item.alertaId ? alertaPorId.get(item.alertaId) : undefined,
      personalizado: item.avisoId ? avisoPorId.get(item.avisoId) : undefined,
      origen: typeof window !== 'undefined' ? window.location.origin : '',
    });
  };

  const avisarPorWhatsApp = (item: ItemAviso) => {
    const cliente = item.clienteId ? clientePorId.get(item.clienteId) : undefined;
    const mensaje = mensajeDe(item);
    const href = mensaje ? waHref(cliente?.telefono, mensaje) : null;
    if (!mensaje || !href) { setError({ clave: item.clave, texto: 'No se pudo preparar el mensaje: revisa el teléfono en la ficha del cliente.' }); return; }
    setError(null);
    window.open(href, '_blank', 'noopener');
    setConfirmando({ item, mensaje });
  };

  const confirmarEnvio = () => {
    if (!confirmando) return;
    const { item, mensaje } = confirmando;
    setConfirmando(null);
    void ejecutar(item, () => onAvisoManual(item, mensaje), 'No se pudo anotar el aviso.');
  };

  const cabeceraFila = (item: ItemAviso) => {
    const cliente = item.clienteId ? clientePorId.get(item.clienteId) : undefined;
    const veh = item.vehiculoId ? vehiculoPorId.get(item.vehiculoId) : undefined;
    return (
      <>
        <b>{nombreCliente(cliente)}{veh && <span className="u-av-veh"> · {veh.marca} {veh.modelo} <Matricula matricula={veh.matricula} /></span>}</b>
        <span>{item.motivo} · {item.cuando}</span>
      </>
    );
  };

  const iconoCanal = (item: ItemAviso) => (item.canal === 'correo' ? <Mail aria-hidden="true" /> : item.canal === 'whatsapp' ? <MessageCircle aria-hidden="true" /> : <PhoneOff aria-hidden="true" />);

  const esVencimiento = (item: ItemAviso) => item.origen === 'alerta' && item.tipo !== 'aceite';

  const filaPara = (item: ItemAviso) => {
    const ocupado = trabajando === item.clave;
    const enConfirmacion = confirmando?.item.clave === item.clave;
    return (
      <div key={item.clave} className="u-av-fila" data-testid="aviso-fila" data-clave={item.clave}>
        <span className={`u-av-punto ${item.urgencia}`} aria-hidden="true" />
        <div className="u-av-txt">
          {cabeceraFila(item)}
          <small className="u-av-canal">{iconoCanal(item)}{item.porQue === 'vencido_antiguo' ? 'Lleva mucho vencido y no sale solo: ¿lo renovó ya?' : textoCanal(item, automatico)}</small>
          {error?.clave === item.clave && <small className="u-av-error" role="alert">{error.texto}</small>}
        </div>
        <div className="u-av-acc">
          {enConfirmacion ? (
            <>
              <span className="u-av-pregunta">¿Se lo has mandado?</span>
              <Boton variante="principal" onClick={confirmarEnvio} data-testid="aviso-confirmar-envio">Sí, enviado</Boton>
              <Boton variante="fantasma" onClick={() => setConfirmando(null)}>Todavía no</Boton>
            </>
          ) : (
            <>
              {item.canal === 'whatsapp' && <Boton variante="principal" onClick={() => avisarPorWhatsApp(item)} disabled={ocupado} data-testid="aviso-whatsapp"><MessageCircle aria-hidden="true" /> Avisar por WhatsApp</Boton>}
              {item.canal === 'correo' && <Boton variante="principal" onClick={() => void ejecutar(item, () => onEnviarCorreo(item.alertaId ? { alertaId: item.alertaId } : { avisoId: item.avisoId }), 'No se pudo enviar el correo.')} disabled={ocupado} data-testid="aviso-enviar-correo"><Send aria-hidden="true" /> {ocupado ? 'Enviando…' : 'Enviar correo'}</Boton>}
              {esVencimiento(item) && <Boton onClick={() => setRenovando(item)} disabled={ocupado} data-testid="aviso-renovado">Ya renovó</Boton>}
              <Boton variante="fantasma" onClick={() => setDescartando(item)} disabled={ocupado}>Descartar</Boton>
            </>
          )}
        </div>
      </div>
    );
  };

  const filaProgramada = (item: ItemAviso) => {
    const ocupado = trabajando === item.clave;
    return (
      <div key={item.clave} className="u-av-fila" data-testid="aviso-programado" data-clave={item.clave}>
        <span className={`u-av-punto ${item.urgencia}`} aria-hidden="true" />
        <div className="u-av-txt">
          {cabeceraFila(item)}
          <small className="u-av-canal">{iconoCanal(item)}{textoCanal(item, automatico)}</small>
          {error?.clave === item.clave && <small className="u-av-error" role="alert">{error.texto}</small>}
        </div>
        <div className="u-av-acc">
          {item.canal === 'correo' && <Boton onClick={() => void ejecutar(item, () => onEnviarCorreo(item.alertaId ? { alertaId: item.alertaId } : { avisoId: item.avisoId }), 'No se pudo enviar el correo.')} disabled={ocupado}>{ocupado ? 'Enviando…' : 'Enviar ahora'}</Boton>}
          <Boton variante="fantasma" onClick={() => setDescartando(item)} disabled={ocupado}>{item.origen === 'personalizado' ? 'Quitar' : 'Descartar'}</Boton>
        </div>
      </div>
    );
  };

  const historial = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return [...notificaciones]
      .sort((a, b) => b.fechaEnvio.localeCompare(a.fechaEnvio))
      .filter((n) => !f || nombreCliente(clientePorId.get(n.clienteId)).toLowerCase().includes(f) || (n.asunto ?? '').toLowerCase().includes(f))
      .slice(0, 80);
  }, [notificaciones, filtro, clientePorId]);

  const pestanas: [Vista, string, number][] = [['hoy', 'Para hoy', paraHoy.length], ['programados', 'Programados', programados.length], ['avisados', 'Avisados', avisados.length]];

  return (
    <div data-testid="avisos-tab">
      <div className="u-pagina-cab">
        <div>
          <h2>Avisos</h2>
          <p>Lo que hay que decirle a cada cliente y cuándo. Lo que tiene correo sale solo; lo demás te sale aquí.</p>
        </div>
        <div className="u-acciones">
          <Boton variante="principal" onClick={() => setNuevo(true)} data-testid="nuevo-aviso-abrir"><BellPlus aria-hidden="true" /> Nuevo aviso</Boton>
        </div>
      </div>

      {!automatico && (
        <div className="u-aviso aviso" role="status" data-testid="avisos-automatico-apagado">
          <TriangleAlert aria-hidden="true" />
          <span>Los envíos automáticos están desactivados: ningún aviso sale solo, así que todo te saldrá en «Para hoy» para mandarlo a mano.</span>
          {esAdmin
            ? <button type="button" className="u-enlace" disabled={activando} onClick={() => { setActivando(true); void onActivarAutomatico().finally(() => setActivando(false)); }} data-testid="avisos-activar-automatico">{activando ? 'Activando…' : 'Activar envíos automáticos'}</button>
            : <span className="u-av-nota">Pídele a un administrador que los active.</span>}
        </div>
      )}

      <div className="u-av-tabs" role="tablist" aria-label="Vistas de avisos">
        {pestanas.map(([id, texto, n]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} className="u-av-tab" onClick={() => setVista(id)} data-testid={`avisos-vista-${id}`}>
            {texto}<span className={`u-av-n${id === 'hoy' && n > 0 ? ' alerta' : ''}`}>{n}</span>
          </button>
        ))}
        <button type="button" className="u-enlace marca u-av-ajustes" onClick={onAbrirAjustes}>Ajustes de avisos</button>
      </div>

      {vista === 'hoy' && (
        <Tarjeta>
          {paraHoy.length === 0 ? (
            <p className="u-vacio-mini" data-testid="avisos-hoy-vacio">
              <CheckCircle2 aria-hidden="true" className="u-av-ok" /> No tienes avisos pendientes. {automatico ? 'Lo que toca avisar a clientes con correo sale solo.' : 'Activa los envíos automáticos para que lo de los clientes con correo salga solo.'}
            </p>
          ) : (
            <>
              <div className="u-sub">{paraHoy.length} {plural(paraHoy.length, 'aviso espera', 'avisos esperan')} a una persona del taller</div>
              {paraHoy.map(filaPara)}
            </>
          )}
        </Tarjeta>
      )}

      {vista === 'programados' && (
        <Tarjeta>
          {programados.length === 0 && <p className="u-vacio-mini">No hay avisos programados. Crea uno con «Nuevo aviso», por ejemplo «neumáticos en 6 meses».</p>}
          {enProximoEnvio.length > 0 && (
            <>
              <div className="u-sub">Saldrán en el próximo envío diario · {enProximoEnvio.length}</div>
              {enProximoEnvio.map(filaProgramada)}
            </>
          )}
          {mesesProgramados.map((g) => (
            <div key={g.clave}>
              <div className="u-sub">{g.titulo} · {g.items.length}</div>
              {g.items.map(filaProgramada)}
            </div>
          ))}
        </Tarjeta>
      )}

      {vista === 'avisados' && (
        <>
          <Tarjeta>
            <div className="u-card-cab"><h3>Avisados que aún no han renovado · {avisados.length}</h3></div>
            {avisados.length === 0 && <p className="u-vacio-mini">Cuando avises a un cliente de un vencimiento y todavía no lo haya renovado, lo verás aquí para hacerle seguimiento.</p>}
            {avisados.map((item) => {
              const ocupado = trabajando === item.clave;
              const alerta = item.alertaId ? alertaPorId.get(item.alertaId) : undefined;
              return (
                <div key={item.clave} className="u-av-fila" data-testid="aviso-avisado" data-clave={item.clave}>
                  <span className={`u-av-punto ${item.urgencia}`} aria-hidden="true" />
                  <div className="u-av-txt">
                    {cabeceraFila(item)}
                    <small className="u-av-canal"><CheckCircle2 aria-hidden="true" />Avisado el {alerta?.ultimoAvisoEnviadoEn || alerta?.recordatorioEnviadoEn ? formatDate((alerta.ultimoAvisoEnviadoEn ?? alerta.recordatorioEnviadoEn)!.slice(0, 10)) : '—'}</small>
                    {error?.clave === item.clave && <small className="u-av-error" role="alert">{error.texto}</small>}
                  </div>
                  <div className="u-av-acc">
                    {esVencimiento(item) && <Boton variante="principal" onClick={() => setRenovando(item)} disabled={ocupado}>Ya renovó</Boton>}
                    <Boton variante="fantasma" onClick={() => setDescartando(item)} disabled={ocupado}>Descartar</Boton>
                  </div>
                </div>
              );
            })}
          </Tarjeta>

          <Tarjeta>
            <div className="u-card-cab">
              <h3>Historial de mensajes</h3>
              <input className="u-av-buscar" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por cliente o motivo…" aria-label="Buscar en el historial" />
            </div>
            {historial.length === 0 && <p className="u-vacio-mini" data-testid="avisos-historial-vacio">Todavía no se ha enviado ningún aviso.</p>}
            {historial.map((n) => {
              const c = clientePorId.get(n.clienteId);
              const v = n.vehiculoId ? vehiculoPorId.get(n.vehiculoId) : undefined;
              const abiertoAhora = abierta === n.id;
              return (
                <div key={n.id} className="u-av-hist" data-testid="aviso-historial">
                  <button type="button" className="u-av-hist-cab" aria-expanded={abiertoAhora} onClick={() => setAbierta(abiertoAhora ? null : n.id)}>
                    <span className="u-av-canal-ico" aria-label={n.tipoEnvio === 'email' ? 'Correo' : 'WhatsApp'}>{n.tipoEnvio === 'email' ? <Mail aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}</span>
                    <span className="u-av-txt">
                      <b>{nombreCliente(c)}{v ? ` · ${descripcionVehiculo(v)}` : ''}</b>
                      <span>{NOMBRE_EVENTO[n.tipoEvento] ?? n.tipoEvento} · {formatDate(n.fechaEnvio.slice(0, 10))} · {n.origen === 'automatico' ? 'salió solo' : 'enviado por el taller'}</span>
                    </span>
                  </button>
                  {abiertoAhora && <p className="u-av-mensaje">{n.asunto && <b>{n.asunto}<br /></b>}{textoDeHtml(n.mensaje, 1200)}</p>}
                </div>
              );
            })}
          </Tarjeta>
        </>
      )}

      {nuevo && (
        <NuevoAviso
          empresa={empresa} clientes={clientes} vehiculos={vehiculos}
          onGuardar={async (a) => { await onCrearAviso(a); setNuevo(false); setVista('programados'); }}
          onCerrar={() => setNuevo(false)}
        />
      )}

      {renovando && (
        <RenovarVencimiento
          item={renovando} vehiculo={renovando.vehiculoId ? vehiculoPorId.get(renovando.vehiculoId) : undefined} hoy={hoy}
          onCerrar={() => setRenovando(null)}
          onGuardar={async (fecha) => { const it = renovando; await onRenovar(it.vehiculoId!, it.tipo as Exclude<AlertaTipo, 'aceite'>, fecha); setRenovando(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!descartando}
        title={descartando?.origen === 'personalizado' ? 'Quitar este aviso' : 'Descartar este aviso'}
        message={descartando?.origen === 'personalizado'
          ? 'No se le avisará al cliente. El aviso queda guardado como descartado.'
          : 'No se le avisará al cliente de este vencimiento. Si cambias la fecha en la ficha del coche, volverá a vigilarse.'}
        confirmLabel={descartando?.origen === 'personalizado' ? 'Sí, quitarlo' : 'Sí, descartarlo'}
        variant="info"
        onConfirm={() => { const it = descartando!; setDescartando(null); void ejecutar(it, () => onDescartar(it), 'No se pudo descartar el aviso.'); }}
        onCancel={() => setDescartando(null)}
      />
    </div>
  );
}

function RenovarVencimiento({ item, vehiculo, hoy, onGuardar, onCerrar }: {
  item: ItemAviso; vehiculo?: Vehiculo; hoy: string; onGuardar: (fecha: string) => Promise<void>; onCerrar: () => void;
}) {
  const tipo = item.tipo as Exclude<AlertaTipo, 'aceite'>;
  const propuesta = item.fecha ? proximaRenovacion(tipo, item.fecha, hoy, vehiculo?.anio) : '';
  const [fecha, setFecha] = useState(propuesta);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setError('Elige la nueva fecha de vencimiento.'); return; }
    setGuardando(true); setError('');
    try { await onGuardar(fecha); } catch (err) { setError(mensajeDeError(err, 'No se pudo guardar la fecha.')); setGuardando(false); }
  };
  return (
    <Ventana titulo={`${item.motivo} renovada`} onCerrar={onCerrar}>
      <form onSubmit={guardar} data-testid="renovar-vencimiento">
        <p className="u-av-nota">{vehiculo ? descripcionVehiculo(vehiculo) : ''} · vencía el {item.fecha ? formatDate(item.fecha) : '—'}.</p>
        <label className="u-campo">
          <span>Nueva fecha de vencimiento</span>
          <input type="date" className="u-sola" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          <small>{tipo === 'itv' ? 'Propuesta según la edad del coche (turismo particular); cámbiala si es otro caso.' : 'Propuesta: un año después del vencimiento anterior.'}</small>
        </label>
        {error && <p className="u-error" role="alert">{error}</p>}
        <div className="u-acciones">
          <Boton variante="principal" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y cerrar el aviso'}</Boton>
          <Boton variante="fantasma" onClick={onCerrar} disabled={guardando}>Cancelar</Boton>
        </div>
      </form>
    </Ventana>
  );
}
