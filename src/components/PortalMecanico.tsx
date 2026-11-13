import { useCallback, useEffect, useRef, useState } from 'react';
import { Wrench, Car, ShieldAlert, ClipboardCheck, Check, RefreshCw, Play, Flag, RotateCcw, MessageSquarePlus, Clock, X, Bell, BellOff, Droplet, Download, ChevronDown } from 'lucide-react';
import { useInstalar, usarManifiestoMecanico } from '../lib/pwa';
import {
  getPortalMecanicoData, marcarTareaMecanico, cambiarDuracionMecanico, cambiarEstadoMecanico, dejarNotaMecanico,
  marcarCambioAceiteMecanico, marcarFiltroMecanico, anotarProximoCambioMecanico,
  type PortalMecanicoData, type PortalMecanicoOrden, type PortalMecanicoTarea,
} from '../lib/data/portalMecanico';
import { OPCIONES_DURACION, textoDuracion } from '../utils/duracionTarea';
import { GRUPOS, fechaHora, ordenarPorLlegada, ordenesNuevas, vistosActualizados } from '../utils/portalMecanico';
import { FILTROS, sumarMeses } from '../utils/aceite';
import { formatDate } from '../utils/dateFormat';
import { formatKm } from '../utils/moneda';

interface Props {
  token: string;
}

const REFRESCO_MS = 20_000;
const NOTA_MAX = 500;

// Lo que el mecánico ya ha visto y si quiere sonido se guardan en su móvil (no en el servidor).
// El almacenamiento puede no estar disponible (modo privado): la página funciona igual sin él.
const leer = (clave: string): string | null => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardar = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };

function pitido() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => void ctx.close();
  } catch { /* el navegador no deja sonar sin un toque previo: no pasa nada */ }
}

/** Ventana inferior para elegir cuánto se tardó en una tarea (o desmarcarla si ya estaba hecha). */
function SelectorDuracion({ tarea, color, ocupado, onElegir, onDesmarcar, onCerrar }: {
  tarea: PortalMecanicoTarea; color: string; ocupado: boolean;
  onElegir: (minutos: number) => void; onDesmarcar: () => void; onCerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Tiempo de la tarea">
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} />
      <div className="relative bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 pb-7 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{tarea.completado ? 'Tarea hecha' : '¿Cuánto has tardado?'}</p>
            <p className="text-base font-extrabold text-slate-800 leading-snug">{tarea.descripcion}</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="p-2 -m-2 text-slate-400 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {OPCIONES_DURACION.map((m) => {
            const actual = tarea.completado && tarea.duracionMin === m;
            return (
              <button key={m} type="button" disabled={ocupado} onClick={() => onElegir(m)}
                className="py-3.5 rounded-2xl border text-sm font-bold transition active:scale-[0.97] disabled:opacity-50 cursor-pointer"
                style={actual ? { backgroundColor: color, borderColor: color, color: '#fff' } : { borderColor: '#e2e8f0', color: '#334155' }}>
                {textoDuracion(m)}
              </button>
            );
          })}
        </div>
        {tarea.completado ? (
          <button type="button" disabled={ocupado} onClick={onDesmarcar}
            className="w-full py-3 rounded-2xl border border-rose-200 text-rose-600 text-sm font-bold disabled:opacity-50 cursor-pointer">
            Desmarcar: no está hecha
          </button>
        ) : (
          <p className="text-xs text-slate-400 text-center">La tarea se marca como hecha al elegir el tiempo.</p>
        )}
        <button type="button" onClick={onCerrar} className="w-full py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold cursor-pointer">Cancelar</button>
      </div>
    </div>
  );
}

function OrdenCard({ orden, color, token, nuevo, abierta, onAlternar, onVisto, onCambio }: {
  orden: PortalMecanicoOrden; color: string; token: string; nuevo: boolean;
  /** Qué coches están desplegados lo decide la página, no cada tarjeta: al marcar la primera tarea el coche
   *  cambia de grupo («Por empezar» → «En reparación»), la tarjeta se vuelve a montar y se plegaría sola. */
  abierta: boolean;
  onAlternar: () => void;
  onVisto: () => void; onCambio: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [tareaAbierta, setTareaAbierta] = useState<PortalMecanicoTarea | null>(null);
  const [confirmarListo, setConfirmarListo] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [nota, setNota] = useState('');
  const [proximoAbierto, setProximoAbierto] = useState(false);
  const [proximaFecha, setProximaFecha] = useState('');
  const [proximoKm, setProximoKm] = useState('');

  const editable = orden.estado === 'recibido' || orden.estado === 'en_reparacion';
  const hechas = orden.tareas.filter((t) => t.completado).length;
  const pendientes = orden.tareas.length - hechas;
  const todoHecho = orden.tareas.length > 0 && pendientes === 0;

  /** Ejecuta una acción contra el servidor y vuelve a leer la lista: lo que se ve es siempre lo guardado. */
  const ejecutar = async (accion: () => Promise<void>) => {
    setError('');
    setOcupado(true);
    onVisto();
    try {
      await accion();
      await onCambio();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.');
      // Puede que la orden haya cambiado en el taller: se relee para enseñar el estado real.
      await onCambio().catch(() => undefined);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const elegirDuracion = async (minutos: number) => {
    const t = tareaAbierta;
    if (!t) return;
    const ok = await ejecutar(() => (t.completado ? cambiarDuracionMecanico(token, t.id, minutos) : marcarTareaMecanico(token, t.id, true, minutos)));
    if (ok) setTareaAbierta(null);
  };

  const desmarcar = async () => {
    const t = tareaAbierta;
    if (!t) return;
    const ok = await ejecutar(() => marcarTareaMecanico(token, t.id, false));
    if (ok) setTareaAbierta(null);
  };

  const marcarListo = async () => {
    if (pendientes > 0 && !confirmarListo) { setConfirmarListo(true); return; }
    setConfirmarListo(false);
    await ejecutar(() => cambiarEstadoMecanico(token, orden.id, 'listo'));
  };

  const guardarNota = async () => {
    const texto = nota.trim();
    if (!texto) return;
    const ok = await ejecutar(() => dejarNotaMecanico(token, orden.id, texto));
    if (ok) { setNota(''); setNotaAbierta(false); }
  };

  const abrirProximo = () => {
    onVisto();
    setError('');
    setProximaFecha(orden.aceiteProximo?.fecha ?? '');
    setProximoKm(orden.aceiteProximo?.km ? String(orden.aceiteProximo.km) : '');
    setProximoAbierto(true);
  };

  const guardarProximo = async () => {
    if (!proximaFecha) { setError('Indica la fecha del próximo cambio.'); return; }
    const km = proximoKm.trim() === '' ? null : Number(proximoKm);
    if (km !== null && (!Number.isInteger(km) || km <= 0)) { setError('Los kilómetros no son válidos.'); return; }
    const ok = await ejecutar(() => anotarProximoCambioMecanico(token, orden.id, proximaFecha, km));
    if (ok) setProximoAbierto(false);
  };

  const chip = orden.estado === 'en_reparacion' ? 'bg-orange-50 text-orange-700'
    : orden.estado === 'listo' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600';
  const etiqueta = orden.estado === 'en_reparacion' ? 'En reparación' : orden.estado === 'listo' ? 'Listo' : 'Por empezar';

  return (
    <div className={`bg-white rounded-3xl border shadow-sm p-5 ${nuevo ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
      {/* Toda la cabecera es un botón: tocarla pliega o despliega el coche. */}
      <button
        type="button" aria-expanded={abierta} aria-controls={`orden-${orden.id}`}
        onClick={() => { onVisto(); onAlternar(); }}
        className="w-full flex items-center gap-3 text-left cursor-pointer"
      >
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <Car className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0 block">
          <span data-testid="nombre-vehiculo" className="block text-base font-extrabold text-slate-800 truncate">
            {orden.vehiculo ? `${orden.vehiculo.marca} ${orden.vehiculo.modelo}` : orden.numero}
          </span>
          <span className="block text-xs text-slate-500 font-mono truncate">{orden.vehiculo?.matricula ? `${orden.vehiculo.matricula} · ` : ''}{orden.numero}</span>
        </span>
        <span className="flex flex-col items-end gap-1 shrink-0">
          {nuevo && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-600 text-white">Nuevo</span>}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chip}`}>{etiqueta}</span>
        </span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-slate-400 transition-transform ${abierta ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {/* Plegado: lo justo para decidir si merece la pena abrirlo. */}
      {!abierta && (
        <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-500" data-testid="resumen-vehiculo">
          {orden.tareas.length > 0 ? (
            <>
              <span className={`font-bold shrink-0 ${todoHecho ? 'text-teal-700' : 'text-slate-600'}`}>
                {todoHecho && <Check className="w-3 h-3 inline -mt-0.5 mr-0.5" />}{hechas}/{orden.tareas.length} tareas
              </span>
              <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={orden.tareas.length} aria-valuenow={hechas} aria-label="Tareas hechas">
                <span className="block h-full rounded-full" style={{ width: `${(hechas / orden.tareas.length) * 100}%`, backgroundColor: todoHecho ? '#14b8a6' : color }} />
              </span>
            </>
          ) : <span className="flex-1">Sin tareas apuntadas</span>}
          {orden.esCambioAceite && <Droplet className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-label="Cambio de aceite" />}
          <span className="shrink-0">Ingreso {fechaHora(orden.ingreso)}</span>
        </div>
      )}

      {abierta && (
      <div id={`orden-${orden.id}`}>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>Ingreso: <span className="font-semibold text-slate-700">{fechaHora(orden.ingreso)}</span></span>
        {orden.kilometrajeEntrada ? <span>{formatKm(orden.kilometrajeEntrada)} km</span> : null}
        {orden.fechaEstimadaEntrega && <span>Entrega prevista: <span className="font-semibold text-slate-700">{formatDate(orden.fechaEstimadaEntrega)}</span></span>}
      </div>

      {orden.descripcionProblema && (
        <div className="bg-slate-50 rounded-xl px-3 py-2 mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Qué le pasa</p>
          <p className="text-sm text-slate-700 whitespace-pre-line">{orden.descripcionProblema}</p>
        </div>
      )}
      {orden.diagnostico && (
        <div className="bg-slate-50 rounded-xl px-3 py-2 mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Diagnóstico</p>
          <p className="text-sm text-slate-700 whitespace-pre-line">{orden.diagnostico}</p>
        </div>
      )}

      {orden.tareas.length === 0 ? (
        <p className="text-xs text-slate-400 italic mt-3">Esta orden no tiene tareas apuntadas. Trabaja con la descripción y márcala lista al terminar.</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tareas</p>
            <p className="text-[11px] font-bold" style={{ color: todoHecho ? color : '#64748b' }}>{hechas} de {orden.tareas.length} hechas</p>
          </div>
          {orden.tareas.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onVisto(); setTareaAbierta(t); }}
              disabled={!editable || ocupado}
              className={`w-full flex items-center gap-3 text-left px-3.5 py-3.5 rounded-2xl border transition cursor-pointer disabled:cursor-default ${
                t.completado ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200 active:scale-[0.99]'
              } ${!editable ? 'opacity-80' : ''}`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 text-white"
                style={t.completado ? { backgroundColor: color, borderColor: color } : { borderColor: '#cbd5e1' }}
              >
                {t.completado && <Check className="w-4 h-4" />}
              </span>
              <span className={`flex-1 text-sm ${t.completado ? 'text-slate-500' : 'text-slate-800 font-semibold'}`}>{t.descripcion}</span>
              <span className="text-[11px] font-bold shrink-0 text-right" style={{ color: t.completado ? color : '#94a3b8' }}>
                {t.completado
                  ? <>{t.duracionMin ? textoDuracion(t.duracionMin) : 'Hecha'}{editable && <span className="block font-medium text-slate-400">cambiar</span>}</>
                  : editable ? 'Marcar' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Cambio de aceite: check list de filtros y próximo cambio. */}
      {orden.esCambioAceite ? (
        <div className="mt-3 rounded-2xl border border-slate-200 p-3 space-y-3" data-testid="aceite-mecanico">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1"><Droplet className="w-3 h-3" /> Cambio de aceite</p>
            {editable && (
              <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => marcarCambioAceiteMecanico(token, orden.id, false))}
                className="text-[11px] font-semibold text-slate-400 underline cursor-pointer disabled:opacity-50">No es un cambio de aceite</button>
            )}
          </div>
          {FILTROS.map((f) => (
            <div key={f.id} role="group" aria-label={f.nombre}>
              <p className="text-sm font-semibold text-slate-700 mb-1.5">{f.nombre}</p>
              <div className="grid grid-cols-2 gap-2">
                {([['cambiado', 'Cambiado'], ['no_cambiado', 'No se cambió']] as const).map(([estado, texto]) => {
                  const activo = orden.filtros[f.id] === estado;
                  return (
                    <button key={estado} type="button" disabled={!editable || ocupado} aria-pressed={activo}
                      onClick={() => void ejecutar(() => marcarFiltroMecanico(token, orden.id, f.id, activo ? null : estado))}
                      className={`py-3 rounded-2xl border text-sm font-bold transition active:scale-[0.98] cursor-pointer disabled:cursor-default flex items-center justify-center gap-1.5 ${
                        activo
                          ? estado === 'cambiado' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}>
                      {activo && <Check className="w-4 h-4" />}{texto}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Próximo cambio</p>
            {proximoAbierto ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setProximaFecha(sumarMeses(6))} className="py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 cursor-pointer">6 meses</button>
                  <button type="button" onClick={() => setProximaFecha(sumarMeses(12))} className="py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 cursor-pointer">1 año</button>
                </div>
                <label className="block text-xs font-semibold text-slate-500">Fecha
                  <input type="date" value={proximaFecha} onChange={(e) => setProximaFecha(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </label>
                <label className="block text-xs font-semibold text-slate-500">O a los kilómetros (opcional)
                  <input type="number" inputMode="numeric" min="1" step="1" value={proximoKm} onChange={(e) => setProximoKm(e.target.value)}
                    placeholder="Ej.: 100000"
                    className="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setProximoAbierto(false); setError(''); }} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold cursor-pointer">Cancelar</button>
                  <button type="button" onClick={() => void guardarProximo()} disabled={ocupado}
                    className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: color }}>
                    {ocupado ? 'Guardando…' : 'Guardar próximo cambio'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  {orden.aceiteProximo
                    ? <><span className="font-bold text-slate-800">{formatDate(orden.aceiteProximo.fecha)}</span>{orden.aceiteProximo.km ? ` o a los ${formatKm(orden.aceiteProximo.km)} km` : ''}</>
                    : 'Sin anotar todavía.'}
                </p>
                <button type="button" onClick={abrirProximo} disabled={ocupado}
                  className="w-full py-3 rounded-2xl border-2 text-sm font-bold disabled:opacity-50 cursor-pointer" style={{ borderColor: color, color }}>
                  {orden.aceiteProximo ? 'Cambiar el próximo cambio' : 'Anotar próximo cambio'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : editable && (
        <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => marcarCambioAceiteMecanico(token, orden.id, true))}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm font-semibold disabled:opacity-50 cursor-pointer">
          <Droplet className="w-4 h-4" /> Es un cambio de aceite
        </button>
      )}

      {orden.notas.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tus notas</p>
          {orden.notas.map((n) => (
            <div key={n.fecha + n.texto} className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              <p className="text-sm text-slate-700">{n.texto}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{fechaHora(n.fecha)}</p>
            </div>
          ))}
        </div>
      )}

      {error && <div role="alert" className="mt-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3 py-2.5 rounded-xl">{error}</div>}

      {notaAbierta && (
        <div className="mt-3 space-y-2">
          <textarea
            value={nota} onChange={(e) => setNota(e.target.value.slice(0, NOTA_MAX))} rows={3} autoFocus
            placeholder="Ej.: falta la junta de la culata, hay que pedirla"
            aria-label="Nota para el taller"
            className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => { setNotaAbierta(false); setNota(''); }} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold cursor-pointer">Cancelar</button>
            <button type="button" onClick={() => void guardarNota()} disabled={ocupado || !nota.trim()}
              className="flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: color }}>
              {ocupado ? 'Guardando…' : 'Enviar nota al taller'}
            </button>
          </div>
        </div>
      )}

      {confirmarListo && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
          <p className="text-sm font-semibold text-amber-800">
            {pendientes === 1 ? 'Queda 1 tarea sin marcar.' : `Quedan ${pendientes} tareas sin marcar.`} ¿Marcar el coche como listo igualmente?
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmarListo(false)} className="flex-1 py-3 rounded-2xl bg-white border border-amber-200 text-amber-800 text-sm font-bold cursor-pointer">No, sigo</button>
            <button type="button" onClick={() => void marcarListo()} disabled={ocupado} className="flex-1 py-3 rounded-2xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50 cursor-pointer">Sí, está listo</button>
          </div>
        </div>
      )}

      {!notaAbierta && !confirmarListo && (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => { onVisto(); setNotaAbierta(true); }} disabled={ocupado}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold disabled:opacity-50 cursor-pointer">
            <MessageSquarePlus className="w-4 h-4" /> Nota
          </button>
          {orden.estado === 'recibido' && (
            <button type="button" onClick={() => void ejecutar(() => cambiarEstadoMecanico(token, orden.id, 'empezar'))} disabled={ocupado}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: color }}>
              <Play className="w-4 h-4" /> Empezar
            </button>
          )}
          {orden.estado === 'en_reparacion' && (
            <button type="button" onClick={() => void marcarListo()} disabled={ocupado}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 cursor-pointer ${todoHecho ? 'text-white' : 'bg-white border-2'}`}
              style={todoHecho ? { backgroundColor: color } : { borderColor: color, color }}>
              <Flag className="w-4 h-4" /> {todoHecho ? 'Todo hecho: marcar como listo' : 'Marcar como listo'}
            </button>
          )}
          {orden.estado === 'listo' && (
            <button type="button" onClick={() => void ejecutar(() => cambiarEstadoMecanico(token, orden.id, 'reabrir'))} disabled={ocupado}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold disabled:opacity-50 cursor-pointer">
              <RotateCcw className="w-4 h-4" /> Reabrir
            </button>
          )}
        </div>
      )}
      </div>
      )}

      {tareaAbierta && (
        <SelectorDuracion
          tarea={tareaAbierta} color={color} ocupado={ocupado}
          onElegir={(m) => void elegirDuracion(m)} onDesmarcar={() => void desmarcar()} onCerrar={() => setTareaAbierta(null)}
        />
      )}
    </div>
  );
}

export default function PortalMecanico({ token }: Props) {
  const [data, setData] = useState<PortalMecanicoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sinConexion, setSinConexion] = useState(false);
  const [refrescando, setRefrescando] = useState(false);

  // Claves por enlace: dos técnicos que compartan móvil no se pisan.
  const claveVistos = `doonty-mecanico-vistos-${token.slice(0, 12)}`;
  const claveSonido = 'doonty-mecanico-sonido';
  const [vistos, setVistos] = useState<string[] | null>(() => {
    try { const v = leer(claveVistos); return v ? (JSON.parse(v) as string[]) : null; } catch { return null; }
  });
  const [sonido, setSonido] = useState(() => leer(claveSonido) === '1');
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;
  const nuevosAnteriores = useRef(0);

  const cargar = useCallback(async () => {
    const d = await getPortalMecanicoData(token);
    setData(d);
    setSinConexion(false);
  }, [token]);

  useEffect(() => {
    cargar()
      .catch((err) => setError(err instanceof Error ? err.message : 'No se pudo cargar tu información.'))
      .finally(() => setLoading(false));
  }, [cargar]);

  // Refresco automático: cada 20 s con la página a la vista, y al volver a ella.
  useEffect(() => {
    if (loading || error) return;
    const refrescar = () => {
      if (document.visibilityState !== 'visible') return;
      cargar().catch(() => setSinConexion(true));
    };
    const reloj = setInterval(refrescar, REFRESCO_MS);
    document.addEventListener('visibilitychange', refrescar);
    return () => { clearInterval(reloj); document.removeEventListener('visibilitychange', refrescar); };
  }, [cargar, loading, error]);

  // Instalar en el móvil: el icono abre ESTE enlace (el del propio mecánico), no la aplicación del taller.
  const { puedeInstalar, pistaIOS, instalar } = useInstalar();
  const nombreTaller = data?.empresa?.nombre ?? '';
  const colorTaller = data?.empresa?.brandColor ?? '';
  const cargado = !!data;
  useEffect(() => {
    if (!cargado) return;
    return usarManifiestoMecanico(window.location.href, nombreTaller, colorTaller);
  }, [cargado, nombreTaller, colorTaller]);

  const ordenes = data?.ordenes ?? [];
  const nuevas = ordenesNuevas(ordenes, vistos);

  // Coches desplegados. Sin tocar nada: con un solo coche asignado se abre solo; con varios, todos plegados.
  const [abiertasPorElUsuario, setAbiertasPorElUsuario] = useState<Record<string, boolean>>({});
  const estaAbierta = (id: string) => abiertasPorElUsuario[id] ?? ordenes.length === 1;
  const alternar = (id: string) => setAbiertasPorElUsuario((a) => ({ ...a, [id]: !(a[id] ?? ordenes.length === 1) }));

  // La primera vez se da todo por visto; después solo se recuerda lo que sigue existiendo.
  useEffect(() => {
    if (!data) return;
    const siguiente = vistosActualizados(data.ordenes, vistos, []);
    if (vistos === null || siguiente.length !== vistos.length) {
      setVistos(siguiente);
      guardar(claveVistos, JSON.stringify(siguiente));
    }
    // Solo al cambiar los datos: `vistos` se actualiza aquí mismo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Aviso de coche nuevo: título de la pestaña, vibración y (si lo activó) pitido.
  useEffect(() => {
    document.title = nuevas.length > 0 ? `(${nuevas.length}) Mis vehículos` : 'Mis vehículos';
    if (nuevas.length > nuevosAnteriores.current) {
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* sin vibración */ }
      if (sonidoRef.current) pitido();
    }
    nuevosAnteriores.current = nuevas.length;
  }, [nuevas.length]);

  const marcarVisto = (id: string) => {
    if (!data || vistos?.includes(id)) return;
    const siguiente = vistosActualizados(data.ordenes, vistos, [id]);
    setVistos(siguiente);
    guardar(claveVistos, JSON.stringify(siguiente));
  };

  const alternarSonido = () => {
    const activo = !sonido;
    setSonido(activo);
    guardar(claveSonido, activo ? '1' : '0');
    if (activo) pitido(); // suena una vez: confirma que funciona y da permiso al navegador
  };

  const refrescarAMano = async () => {
    setRefrescando(true);
    try { await cargar(); } catch { setSinConexion(true); } finally { setRefrescando(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-sm text-center">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h1 className="text-base font-extrabold text-slate-800 mb-1.5">Enlace no válido</h1>
          <p className="text-sm text-slate-500">{error || 'Este enlace ha caducado o no existe. Pide al taller que te envíe uno nuevo.'}</p>
        </div>
      </div>
    );
  }

  const color = data.empresa?.brandColor || '#2563eb';

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      <div className="rounded-b-[28px] px-5 pt-4 pb-7" style={{ backgroundColor: color }}>
        {/* Todo el contenido va en la misma columna que las tarjetas (también en pantallas anchas). */}
        <div className="max-w-md mx-auto">
          <div className="flex justify-end gap-2">
            <button onClick={alternarSonido} aria-label={sonido ? 'Quitar el sonido de los avisos' : 'Activar el sonido de los avisos'} aria-pressed={sonido}
              className="p-2.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: '#ffffff22' }}>
              {sonido ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            </button>
            {puedeInstalar && (
              <button onClick={() => void instalar()} aria-label="Instalar como aplicación" title="Instalar como aplicación"
                className="p-2.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: '#ffffff22' }}>
                <Download className="w-4 h-4" />
              </button>
            )}
            <button onClick={() => void refrescarAMano()} aria-label="Actualizar" disabled={refrescando}
              className="p-2.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: '#ffffff22' }}>
              <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col items-center text-center -mt-1" data-testid="cabecera-mecanico">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center overflow-hidden" style={{ backgroundColor: '#ffffff22' }}>
              {data.empresa?.logoUrl ? (
                <img src={data.empresa.logoUrl} alt={data.empresa.nombre} className="w-full h-full object-contain" />
              ) : (
                <Wrench className="w-6 h-6 text-white" />
              )}
            </div>
            <p className="mt-2 text-white/80 font-bold text-xs uppercase tracking-wider max-w-full truncate">{data.empresa?.nombre}</p>
            <h1 className="mt-3 text-2xl font-black text-white">Hola, {data.tecnico.nombre}</h1>
            <p className="mt-1 text-sm text-white/85">
              {ordenes.length === 0 ? 'No tienes vehículos asignados' : `${ordenes.length} ${ordenes.length === 1 ? 'vehículo asignado' : 'vehículos asignados'}`}
              {nuevas.length > 0 && ` · ${nuevas.length} ${nuevas.length === 1 ? 'nuevo' : 'nuevos'}`}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 mt-4 space-y-4">
        {sinConexion && (
          <div role="status" className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold px-4 py-3 rounded-2xl">
            Sin conexión: puede que la lista no esté al día. Se actualizará sola cuando vuelva la red.
          </div>
        )}

        {ordenes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
            <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No tienes vehículos asignados ahora mismo</p>
            <p className="text-xs text-slate-400 mt-1">Cuando el taller te asigne uno aparecerá aquí solo.</p>
          </div>
        ) : (
          GRUPOS.map((g) => {
            // Los que van llegando, arriba (la lista del servidor viene del más antiguo al más reciente).
            const delGrupo = ordenarPorLlegada(ordenes.filter((o) => o.estado === g.estado));
            if (delGrupo.length === 0) return null;
            return (
              <section key={g.estado} className="space-y-3" aria-label={g.titulo}>
                <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 px-1 pt-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> {g.titulo} · {delGrupo.length}
                </h2>
                {delGrupo.map((o) => (
                  <OrdenCard key={o.id} orden={o} color={color} token={token} nuevo={nuevas.includes(o.id)} abierta={estaAbierta(o.id)} onAlternar={() => alternar(o.id)} onVisto={() => marcarVisto(o.id)} onCambio={cargar} />
                ))}
              </section>
            );
          })
        )}

        {pistaIOS && (
          <p className="text-center text-[11px] text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-3">
            Para tenerlo como una aplicación en tu iPhone: pulsa el botón <strong>Compartir</strong> de Safari y elige <strong>Añadir a pantalla de inicio</strong>.
          </p>
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Enlace personal de {data.tecnico.nombre} · Doonty Motor
        </p>
      </div>
    </div>
  );
}
