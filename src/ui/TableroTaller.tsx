import { Check, Droplet, Wrench } from 'lucide-react';
import type { Cliente, OTEstado, OrdenTrabajo, Vehiculo } from '../types';
import { fmt2 } from '../utils/moneda';
import { resumenTiempos, textoDuracion } from '../utils/duracionTarea';
import { Chip, Placa } from './componentes';
import { diasDesde } from '../components/orden/utilidades';
import { NOMBRE_ESTADO, PASOS_ORDEN, esRetroceso, siguientePaso } from './etapasOrden';

interface Props {
  ordenes: OrdenTrabajo[];
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  onSelect: (ot: OrdenTrabajo) => void;
  /** Mismo cambio de estado que el taller ya hacía al arrastrar (incluida la ventana de recepción). */
  onDrop: (ot: OrdenTrabajo, estado: OTEstado) => void;
  onRetrocesoBloqueado: (ot: OrdenTrabajo, estado: OTEstado) => void;
  dragOtId: string | null;
  setDragOtId: React.Dispatch<React.SetStateAction<string | null>>;
  dragOverEstado: OTEstado | null;
  setDragOverEstado: React.Dispatch<React.SetStateAction<OTEstado | null>>;
}

/** Tablero del taller (nuevo diseño): una columna por paso, con la matrícula bien a la vista y un botón con lo que toca después. Se puede arrastrar. */
export default function TableroTaller({ ordenes, vehiculos, clientes, onSelect, onDrop, onRetrocesoBloqueado, dragOtId, setDragOtId, dragOverEstado, setDragOverEstado }: Props) {
  const otArrastrada = dragOtId ? ordenes.find((o) => o.id === dragOtId) : null;
  return (
    <div className="u-tablero" data-testid="tablero-taller">
      {PASOS_ORDEN.map((estado) => {
        const items = ordenes.filter((o) => o.estado === estado);
        const destino = dragOverEstado === estado;
        const malDestino = destino && !!otArrastrada && esRetroceso(otArrastrada.estado, estado);
        return (
          <section
            key={estado}
            aria-label={`${NOMBRE_ESTADO[estado]}: ${items.length}`}
            className={`u-col-tablero${destino ? (malDestino ? ' mal' : ' destino') : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverEstado(estado); }}
            onDragLeave={() => setDragOverEstado((prev) => (prev === estado ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverEstado(null);
              // El id viaja en el propio dataTransfer: entre el dragstart y el drop puede no haberse confirmado el estado de React.
              const ot = ordenes.find((o) => o.id === e.dataTransfer.getData('text/plain'));
              setDragOtId(null);
              if (!ot || ot.estado === estado) return;
              if (esRetroceso(ot.estado, estado)) { onRetrocesoBloqueado(ot, estado); return; }
              onDrop(ot, estado);
            }}
          >
            <header><Chip tono={estado}>{NOMBRE_ESTADO[estado]}</Chip><span className="u-cuenta">{items.length}</span></header>
            {estado === 'entregado' && <p className="u-nota">Solo las de los últimos 30 días. Para entregas más antiguas, usa la lista.</p>}
            <div className="u-col-tablero-lista">
              {items.length === 0 && <div className="u-sin-ordenes">Sin órdenes</div>}
              {items.map((ot) => {
                const veh = vehiculos.find((v) => v.id === ot.vehiculoId);
                const cli = clientes.find((c) => c.id === ot.clienteId);
                const { texto, aviso } = diasDesde(ot.fechaRecepcion);
                const sig = siguientePaso(ot.estado);
                const t = resumenTiempos(ot.lineas);
                const enTaller = estado === 'recibido' || estado === 'en_reparacion' || estado === 'listo';
                const terminado = t.tareas > 0 && t.hechas === t.tareas;
                return (
                  <article key={ot.id} className={`u-tarjeta-ot${dragOtId === ot.id ? ' arrastrando' : ''}`} draggable data-testid="tarjeta-orden"
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', ot.id); setDragOtId(ot.id); }}
                    onDragEnd={() => { setDragOtId(null); setDragOverEstado(null); }}>
                    <button type="button" className="u-tarjeta-abrir" onClick={() => onSelect(ot)} aria-label={`Abrir ${ot.numero}${veh ? `, ${veh.marca} ${veh.modelo}` : ''}`}>
                      <span className="u-tarjeta-fila">
                        {veh ? <Placa matricula={veh.matricula} /> : <span className="u-num">{ot.numero}</span>}
                        <span className={`u-dias${aviso ? ' aviso' : ''}`}>{texto}</span>
                      </span>
                      <b>{veh ? `${veh.marca} ${veh.modelo}` : '—'}{ot.esCambioAceite && <Droplet aria-label="Cambio de aceite" size={13} style={{ marginLeft: 6, verticalAlign: -2 }} />}</b>
                      <span className="u-cli">{cli ? `${cli.nombre} ${cli.apellidos}` : '—'} · <span className="u-num">{ot.numero}</span></span>
                      {enTaller && (ot.tecnicoAsignado || t.tareas > 0) && (
                        <span className="u-avance">
                          <span><Wrench aria-hidden="true" size={12} /> {ot.tecnicoAsignado || 'Sin técnico'}</span>
                          {t.tareas > 0 && <span className={terminado ? 'ok' : ''}>{terminado && <Check aria-hidden="true" size={12} />}{t.hechas}/{t.tareas}{t.minutosReales > 0 && ` · ${textoDuracion(t.minutosReales)}`}</span>}
                          {t.tareas > 0 && <i role="progressbar" aria-valuemin={0} aria-valuemax={t.tareas} aria-valuenow={t.hechas} aria-label="Tareas hechas"><u style={{ width: `${(t.hechas / t.tareas) * 100}%` }} className={terminado ? 'ok' : ''} /></i>}
                        </span>
                      )}
                      <span className="u-tarjeta-fila">
                        <strong>{ot.total > 0 ? `${fmt2(ot.total)} €` : <span className="u-muted">Por definir</span>}</strong>
                        {estado === 'presupuesto' && ot.presupuestoEstado === 'enviado' && <Chip tono="listo">Enviado</Chip>}
                        {(estado === 'recibido' || estado === 'en_reparacion') && ot.presupuestoEstado === 'enviado' && ot.presupuestoAprobado === false && <Chip tono="peligro">Rechazado</Chip>}
                        {(estado === 'recibido' || estado === 'en_reparacion') && ot.presupuestoEstado === 'enviado' && ot.presupuestoAprobado == null && <Chip tono="presupuesto">Pdte. respuesta</Chip>}
                      </span>
                    </button>
                    {sig && <button type="button" className="u-siguiente" onClick={() => onDrop(ot, sig.estado)} data-testid="siguiente-paso">{sig.accion} →</button>}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
