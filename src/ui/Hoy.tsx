import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus } from 'lucide-react';
import type { Cita, Cliente, Empresa, ModuloId, OrdenTrabajo, Perfil, Vehiculo } from '../types';
import { getFacturasResumen, type FacturasResumen } from '../lib/data/facturas';
import { listTecnicos } from '../lib/data/tecnicos';
import { fmt2 } from '../utils/moneda';
import type { AvisoPagos } from '../utils/compras';
import type { AccionPaso } from '../utils/guiaInicial';
import type { ItemAviso } from '../utils/avisos';
import GuiaInicial from '../components/GuiaInicial';
import { Boton, Chip, Llavero, Matricula, Tarjeta } from './componentes';
import { saludo, tareasHoy, textoDias, type TareaOrden } from './tareasHoy';
import type { IrA } from './Marco';

interface Props {
  currentUser: Perfil;
  citas: Cita[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  /** Cola de avisos a clientes (vencimientos y personalizados); aquí solo interesan los que esperan a una persona. */
  avisos: ItemAviso[];
  modulos: ModuloId[];
  empresa: Empresa;
  /** Órdenes ya cargadas por la aplicación (activas y entregadas hace poco), siempre al día. */
  ordenes: OrdenTrabajo[];
  datosListos: boolean;
  onIr: IrA;
  onNavegar: (tab: ModuloId, vista?: 'porpagar') => void;
  pagosProveedores?: AvisoPagos | null;
  onAbrirEmpresa: (pestana: Extract<AccionPaso, { tipo: 'empresa' }>['pestana']) => void;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** «Hoy»: lo que toca hacer ahora en el taller, antes que cifras. Cada fila lleva a la orden. */
export default function Hoy({ currentUser, citas, clientes, vehiculos, avisos, modulos, empresa, ordenes, datosListos, onIr, onNavegar, pagosProveedores, onAbrirEmpresa }: Props) {
  const puede = (m: ModuloId) => modulos.includes(m);
  const esAdmin = currentUser.rol === 'admin';

  // Los totales de facturación los calcula el servidor: no se trae la tabla de facturas para sumarla aquí.
  const [resumen, setResumen] = useState<FacturasResumen | null>(null);
  useEffect(() => { if (puede('facturas')) getFacturasResumen().then(setResumen).catch(() => setResumen(null)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  // La guía de primeros pasos cuenta mecánicos con una consulta aparte (no están cargados en App).
  const [nTecnicos, setNTecnicos] = useState<number | null>(null);
  useEffect(() => { if (esAdmin) listTecnicos().then((t) => setNTecnicos(t.length)).catch(() => setNTecnicos(null)); }, [esAdmin]);

  const hoyIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaLarga = useMemo(() => { const s = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }, []);
  const t = useMemo(() => tareasHoy(ordenes, vehiculos, clientes), [ordenes, vehiculos, clientes]);
  const clientePorId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const citasHoy = useMemo(() => citas.filter((c) => (c.estado === 'pendiente' || c.estado === 'confirmada') && c.fechaHora.slice(0, 10) === hoyIso).sort((a, b) => a.fechaHora.localeCompare(b.fechaHora)), [citas, hoyIso]);
  const avisosHoy = useMemo(() => avisos.filter((a) => a.fase === 'para_hoy'), [avisos]);
  const avisosVencidos = useMemo(() => avisosHoy.filter((a) => a.urgencia === 'vencido'), [avisosHoy]);

  const nombreCoche = (x: TareaOrden) => (x.vehiculo ? `${x.vehiculo.marca} ${x.vehiculo.modelo}` : `Orden ${x.orden.numero}`);
  const nombreCliente = (x: TareaOrden) => (x.cliente ? `${x.cliente.nombre} ${x.cliente.apellidos}`.trim() : '');
  const abrir = (x: TareaOrden) => onIr('taller', { tipo: 'buscar', texto: x.orden.numero });
  const FilaOrden = ({ x, texto, chip }: { x: TareaOrden; texto: string; chip?: React.ReactNode }) => (
    <button type="button" className="u-fila" onClick={() => abrir(x)} data-testid="hoy-orden">
      <Llavero estado={x.orden.estado} />
      <span className="u-fila-txt"><b>{nombreCoche(x)}{nombreCliente(x) ? ` · ${nombreCliente(x)}` : ''}</b><span>{x.vehiculo && <><Matricula matricula={x.vehiculo.matricula} /> · </>}{texto}</span></span>
      {chip}
    </button>
  );

  const hayMoverOrdenes = t.listos.length + t.esperando.length + t.rechazados.length + t.aprobados.length + t.porEnviar.length > 0;
  const facturasVencidas = resumen?.facturasVencidas ?? 0;

  return (
    <div>
      <div className="u-pagina-cab">
        <div>
          <h2>{saludo()}, {currentUser.nombre.split(' ')[0]}</h2>
          <p>{fechaLarga}</p>
        </div>
        <div className="u-acciones">
          {puede('taller') && <Boton variante="principal" onClick={() => onIr('taller', { tipo: 'nuevo', modo: 'recibido' })} data-testid="hoy-recibir"><Plus />Recibir un coche</Boton>}
          {puede('citas') && <Boton onClick={() => onIr('citas', { tipo: 'nuevo' })}><CalendarClock />Nueva cita</Boton>}
        </div>
      </div>

      {esAdmin && datosListos && nTecnicos !== null && (
        <GuiaInicial
          empresaId={empresa.id} modulos={modulos} brandColor={empresa.brandColor}
          datos={{
            razonSocial: empresa.razonSocial, nif: empresa.nif, direccionFiscal: empresa.direccionFiscal, tieneLogo: !!(empresa.logoUrl || empresa.logoBase64),
            nTecnicos, nClientes: clientes.length, nVehiculos: vehiculos.length, nOrdenes: ordenes.length, recordatoriosActivos: empresa.recordatoriosAutomaticosActivos,
          }}
          onAccion={(a) => (a.tipo === 'empresa' ? onAbrirEmpresa(a.pestana) : onNavegar(a.modulo))}
        />
      )}

      {puede('facturas') && facturasVencidas > 0 && (
        <div className="u-aviso peligro" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>Tienes {facturasVencidas} {plural(facturasVencidas, 'factura vencida', 'facturas vencidas')} sin cobrar ({fmt2(resumen?.importeVencido ?? 0)} €)</span>
          <button type="button" className="u-enlace" onClick={() => onNavegar('facturas')}>Ver facturas →</button>
        </div>
      )}
      {puede('compras') && pagosProveedores?.hay && (
        <div className={`u-aviso ${pagosProveedores.vencidas.n > 0 ? 'peligro' : 'aviso'}`} data-testid="aviso-pagos-proveedores" role="status">
          <AlertTriangle aria-hidden="true" />
          <span>
            {pagosProveedores.vencidas.n > 0 && <>Tienes {pagosProveedores.vencidas.n} {plural(pagosProveedores.vencidas.n, 'pago a proveedores vencido', 'pagos a proveedores vencidos')} ({fmt2(pagosProveedores.vencidas.importe)} €)</>}
            {pagosProveedores.vencidas.n > 0 && pagosProveedores.semana.n > 0 && ' y '}
            {pagosProveedores.semana.n > 0 && <>{pagosProveedores.vencidas.n > 0 ? '' : 'Tienes '}{pagosProveedores.semana.n} que {plural(pagosProveedores.semana.n, 'vence', 'vencen')} esta semana ({fmt2(pagosProveedores.semana.importe)} €)</>}
          </span>
          <button type="button" className="u-enlace" onClick={() => onNavegar('compras', 'porpagar')}>Ver lo que debo →</button>
        </div>
      )}
      {puede('alertas') && avisosHoy.length > 0 && (
        <div className="u-aviso aviso" role="status" data-testid="hoy-avisos">
          <AlertTriangle aria-hidden="true" />
          <span>{avisosHoy.length} {plural(avisosHoy.length, 'aviso a un cliente espera', 'avisos a clientes esperan')} a que los mandes (WhatsApp, vencimientos…){avisosVencidos.length > 0 ? ` · ${avisosVencidos.length} ya ${plural(avisosVencidos.length, 'vencido', 'vencidos')}` : ''}</span>
          <button type="button" className="u-enlace" onClick={() => onNavegar('alertas')}>Ver avisos →</button>
        </div>
      )}

      <div className="u-grid2">
        <div>
          {puede('taller') && (
            <Tarjeta>
              <div className="u-card-cab"><h3>Para mover hoy</h3><button type="button" className="u-enlace marca" onClick={() => onNavegar('taller')}>Ver el taller →</button></div>
              {!hayMoverOrdenes && <p className="u-vacio-mini" data-testid="hoy-nada-que-mover">Nada pendiente de entregar ni de contestar. Buen momento para recibir un coche.</p>}
              {t.listos.length > 0 && <>
                <div className="u-sub">Listos para entregar · {t.listos.length}</div>
                {t.listos.map((x) => <FilaOrden key={x.orden.id} x={x} texto={x.orden.notificacionEnviada ? `Cliente avisado · listo ${textoDias(x.dias)}` : `Falta avisar al cliente · listo ${textoDias(x.dias)}`} chip={<Chip tono="listo">Listo</Chip>} />)}
              </>}
              {t.esperando.length > 0 && <>
                <div className="u-sub">Presupuestos sin respuesta · {t.esperando.length}</div>
                {t.esperando.map((x) => <FilaOrden key={x.orden.id} x={x} texto={`Enviado ${textoDias(x.dias)} · ${fmt2(x.orden.total)} €${x.orden.estado === 'presupuesto' ? '' : ' · coche ya en el taller'}${x.orden.presupuestoRecordadoEn && (x.orden.presupuestoRecordatorios ?? 0) > 0 ? ` · avisado ${x.orden.presupuestoRecordatorios === 1 ? 'una vez' : 'dos veces'}` : ''}`} chip={<Chip tono="presupuesto">Esperando</Chip>} />)}
              </>}
              {t.rechazados.length > 0 && <>
                <div className="u-sub">Presupuestos rechazados · {t.rechazados.length}</div>
                {t.rechazados.map((x) => <FilaOrden key={x.orden.id} x={x} texto={`Rechazado ${textoDias(x.dias)} · ${fmt2(x.orden.total)} € · habla con el cliente`} chip={<Chip tono="peligro">Rechazado</Chip>} />)}
              </>}
              {t.aprobados.length > 0 && <>
                <div className="u-sub">Aprobados: falta recibir el coche · {t.aprobados.length}</div>
                {t.aprobados.map((x) => <FilaOrden key={x.orden.id} x={x} texto={`Aprobado ${textoDias(x.dias)} · ${fmt2(x.orden.total)} €`} chip={<Chip tono="presupuesto">Aprobado</Chip>} />)}
              </>}
              {t.porEnviar.length > 0 && <>
                <div className="u-sub">Presupuestos por enviar · {t.porEnviar.length}</div>
                {t.porEnviar.map((x) => <FilaOrden key={x.orden.id} x={x} texto={`Creado ${textoDias(x.dias)}`} chip={<Chip tono="presupuesto">Presupuesto</Chip>} />)}
              </>}
            </Tarjeta>
          )}

          {puede('taller') && (
            <Tarjeta>
              <div className="u-card-cab"><h3>Dentro del taller · {t.enTaller.length}</h3><button type="button" className="u-enlace marca" onClick={() => onNavegar('taller')}>Ver tablero →</button></div>
              {t.enTaller.length === 0 && <p className="u-vacio-mini">No hay coches en el taller ahora mismo.</p>}
              {t.enTaller.map((x) => <FilaOrden key={x.orden.id} x={x} texto={`Recibido ${textoDias(x.dias)}`} chip={<Chip tono={x.orden.estado === 'en_reparacion' ? 'en_reparacion' : 'recibido'}>{x.orden.estado === 'en_reparacion' ? 'En reparación' : 'Recibido'}</Chip>} />)}
            </Tarjeta>
          )}
        </div>

        <div>
          {puede('citas') && (
            <Tarjeta>
              <div className="u-card-cab"><h3>Citas de hoy · {citasHoy.length}</h3><button type="button" className="u-enlace marca" onClick={() => onNavegar('citas')}>Ver agenda →</button></div>
              {citasHoy.length === 0 && <p className="u-vacio-mini">No hay citas programadas para hoy.</p>}
              {citasHoy.map((c) => {
                const cli = c.clienteId ? clientePorId.get(c.clienteId) : undefined;
                const nombre = cli ? `${cli.nombre} ${cli.apellidos}` : ([c.contactoNombre, c.contactoApellidos].filter(Boolean).join(' ') || 'Sin nombre');
                return (
                  <button key={c.id} type="button" className="u-fila" onClick={() => onNavegar('citas')} data-testid="hoy-cita">
                    <span className="u-hora">{hora(c.fechaHora)}</span>
                    <span className="u-fila-txt"><b>{nombre}{c.vehiculoDescripcion ? ` · ${c.vehiculoDescripcion}` : ''}</b><span>{c.motivo}</span></span>
                    <Chip tono={c.estado === 'confirmada' ? 'listo' : 'en_reparacion'}>{c.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}</Chip>
                  </button>
                );
              })}
            </Tarjeta>
          )}

          {(puede('facturas') || puede('alertas')) && (
            <Tarjeta>
              <div className="u-card-cab"><h3>Resumen</h3></div>
              <div className="u-kpis">
                {puede('facturas') && <div className="u-kpi"><small>Facturado este mes</small><strong>{fmt2(resumen?.importeMesActual ?? 0)} €</strong><span>{resumen?.facturasMesActual ?? 0} {plural(resumen?.facturasMesActual ?? 0, 'factura emitida', 'facturas emitidas')}</span></div>}
                {puede('alertas') && <div className="u-kpi"><small>Avisos para hoy</small><strong>{avisosHoy.length}</strong><span>{avisosVencidos.length > 0 ? `${avisosVencidos.length} ya vencidos` : 'Todo al día'}</span></div>}
              </div>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
