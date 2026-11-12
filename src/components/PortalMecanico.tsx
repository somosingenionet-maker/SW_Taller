import { useCallback, useEffect, useRef, useState } from 'react';
import { Wrench, Car, ShieldAlert, ClipboardCheck, Check, RefreshCw, Play, Flag, RotateCcw, MessageSquarePlus, Clock, X, Bell, BellOff } from 'lucide-react';
import {
  getPortalMecanicoData, marcarTareaMecanico, cambiarDuracionMecanico, cambiarEstadoMecanico, dejarNotaMecanico,
  type PortalMecanicoData, type PortalMecanicoOrden, type PortalMecanicoTarea,
} from '../lib/data/portalMecanico';
import { OPCIONES_DURACION, textoDuracion } from '../utils/duracionTarea';
import { GRUPOS, fechaHora, ordenesNuevas, vistosActualizados } from '../utils/portalMecanico';
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

function OrdenCard({ orden, color, token, nuevo, onVisto, onCambio }: {
  orden: PortalMecanicoOrden; color: string; token: string; nuevo: boolean;
  onVisto: () => void; onCambio: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [tareaAbierta, setTareaAbierta] = useState<PortalMecanicoTarea | null>(null);
  const [confirmarListo, setConfirmarListo] = useState(false);
  const [notaAbierta, setNotaAbierta] = useState(false);
  const [nota, setNota] = useState('');

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

  const chip = orden.estado === 'en_reparacion' ? 'bg-orange-50 text-orange-700'
    : orden.estado === 'listo' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-600';
  const etiqueta = orden.estado === 'en_reparacion' ? 'En reparación' : orden.estado === 'listo' ? 'Listo' : 'Por empezar';

  return (
    <div className={`bg-white rounded-3xl border shadow-sm p-5 ${nuevo ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`} onClick={nuevo ? onVisto : undefined}>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <Car className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-base font-extrabold text-slate-800 truncate">
            {orden.vehiculo ? `${orden.vehiculo.marca} ${orden.vehiculo.modelo}` : orden.numero}
          </p>
          <p className="text-xs text-slate-500 font-mono">{orden.vehiculo?.matricula ? `${orden.vehiculo.matricula} · ` : ''}{orden.numero}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {nuevo && <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-600 text-white">Nuevo</span>}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${chip}`}>{etiqueta}</span>
        </div>
      </div>

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

  const ordenes = data?.ordenes ?? [];
  const nuevas = ordenesNuevas(ordenes, vistos);

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
      <div className="rounded-b-[28px] px-5 pt-6 pb-7" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: '#ffffff22' }}>
            {data.empresa?.logoUrl ? (
              <img src={data.empresa.logoUrl} alt={data.empresa.nombre} className="w-full h-full object-contain" />
            ) : (
              <Wrench className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="text-white font-bold text-sm flex-1 truncate">{data.empresa?.nombre}</span>
          <button onClick={alternarSonido} aria-label={sonido ? 'Quitar el sonido de los avisos' : 'Activar el sonido de los avisos'} aria-pressed={sonido}
            className="p-2.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: '#ffffff22' }}>
            {sonido ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
          <button onClick={() => void refrescarAMano()} aria-label="Actualizar" disabled={refrescando}
            className="p-2.5 rounded-full text-white cursor-pointer" style={{ backgroundColor: '#ffffff22' }}>
            <RefreshCw className={`w-4 h-4 ${refrescando ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <h1 className="text-xl font-black text-white mb-1">Hola, {data.tecnico.nombre}</h1>
        <p className="text-xs text-white/80">
          {ordenes.length === 0 ? 'No tienes vehículos asignados' : `${ordenes.length} ${ordenes.length === 1 ? 'vehículo asignado' : 'vehículos asignados'}`}
          {nuevas.length > 0 && ` · ${nuevas.length} ${nuevas.length === 1 ? 'nuevo' : 'nuevos'}`}
        </p>
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
            const delGrupo = ordenes.filter((o) => o.estado === g.estado);
            if (delGrupo.length === 0) return null;
            return (
              <section key={g.estado} className="space-y-3" aria-label={g.titulo}>
                <h2 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 px-1 pt-1 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> {g.titulo} · {delGrupo.length}
                </h2>
                {delGrupo.map((o) => (
                  <OrdenCard key={o.id} orden={o} color={color} token={token} nuevo={nuevas.includes(o.id)} onVisto={() => marcarVisto(o.id)} onCambio={cargar} />
                ))}
              </section>
            );
          })
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Enlace personal de {data.tecnico.nombre} · Doonty Motor
        </p>
      </div>
    </div>
  );
}
