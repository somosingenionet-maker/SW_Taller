import { useCallback, useEffect, useState } from 'react';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import {
  actualizarTipoCita, borrarTipoCita, crearTipoCita, getConfigReservas, guardarConfigReservas, listTiposCita,
  type ConfigReservas, type TipoCita,
} from '../lib/data/reservasConfig';
import { mensajeDeError } from '../lib/errores';
import {
  codigoIframe, DIAS, errorDeHorario, MAX_TRAMOS, slugDesdeNombre, slugValido, type DiaId, type HorarioReservas, type Tramo,
} from '../utils/horarioReservas';
import { textoDuracionCita } from '../utils/reservas';
import { nombreValido } from '../utils/inspeccion';

const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const boton = 'px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer';
const DURACIONES = [15, 30, 45, 60, 90, 120, 180, 240];

interface Props {
  empresaId: string;
  nombreEmpresa: string;
  /** Si el taller tiene apagados los recordatorios automáticos, el del día anterior no se enviará. */
  recordatoriosActivos: boolean;
}

/** Ajustes de las reservas online: activar, dirección pública, horario, reglas y tipos de cita. */
export default function AjustesReservas({ empresaId, nombreEmpresa, recordatoriosActivos }: Props) {
  const [cfg, setCfg] = useState<ConfigReservas | null>(null);
  const [tipos, setTipos] = useState<TipoCita[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cambiado, setCambiado] = useState(false);
  const [nuevoCierre, setNuevoCierre] = useState('');
  const [nuevoTipo, setNuevoTipo] = useState({ nombre: '', duracion: 60 });

  const cargar = useCallback(async () => {
    const [c, t] = await Promise.all([getConfigReservas(empresaId), listTiposCita()]);
    setCfg(c); setTipos(t); setCambiado(false);
  }, [empresaId]);
  useEffect(() => { cargar().catch((e) => setError(mensajeDeError(e, 'No se pudo cargar la configuración de reservas.'))); }, [cargar]);

  if (!cfg) return error ? <p role="alert" className="text-xs text-rose-700">{error}</p> : <p className="text-xs text-slate-400">Cargando…</p>;

  const cambiar = (parcial: Partial<ConfigReservas>) => { setCfg({ ...cfg, ...parcial }); setCambiado(true); setAviso(''); };
  const cambiarDia = (dia: DiaId, tramos: Tramo[]) => cambiar({ horario: { ...cfg.horario, [dia]: tramos } as HorarioReservas });
  const url = typeof window !== 'undefined' && cfg.slug ? `${window.location.origin}/reservar/${cfg.slug}` : '';

  const guardar = async () => {
    setError(''); setAviso('');
    const slug = cfg.slug.trim();
    if (cfg.activas && !slug) return setError('Para activar las reservas hace falta una dirección pública.');
    if (slug && !slugValido(slug)) return setError('La dirección solo puede llevar letras minúsculas, números y guiones (de 3 a 40 caracteres).');
    const eh = errorDeHorario(cfg.horario);
    if (eh) return setError(eh);
    if (cfg.activas && !tipos.some((t) => t.activo)) return setError('Crea al menos un tipo de cita activo antes de activar las reservas.');
    setGuardando(true);
    try { await guardarConfigReservas(empresaId, { ...cfg, slug }); setCambiado(false); setAviso(cfg.activas ? 'Guardado. Tus reservas online están activas.' : 'Guardado.'); }
    catch (e) { setError(mensajeDeError(e, 'No se pudo guardar.')); }
    finally { setGuardando(false); }
  };

  const ejecutarTipos = async (accion: () => Promise<void>, queFallo: string) => {
    setError(''); setAviso('');
    try { await accion(); setTipos(await listTiposCita()); } catch (e) { setError(mensajeDeError(e, queFallo)); }
  };

  const copiar = async (texto: string, que: string) => {
    try { await navigator.clipboard.writeText(texto); setAviso(`${que} copiado.`); } catch { setError('No se pudo copiar. Selecciónalo y cópialo a mano.'); }
  };

  return (
    <div className="space-y-6" data-testid="ajustes-reservas">
      {/* Activar y dirección */}
      <section className="space-y-3">
        <label className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2.5 cursor-pointer">
          <span className="text-xs text-slate-600"><b className="text-slate-800">Reservas online.</b> Tus clientes piden cita desde una página pública y entra sola en la Agenda.</span>
          <input type="checkbox" checked={cfg.activas} onChange={(e) => cambiar({ activas: e.target.checked })} aria-label="Activar las reservas online" className="w-4 h-4 shrink-0 cursor-pointer" />
        </label>
        <div>
          <label htmlFor="reservas-slug" className="block text-xs font-semibold text-slate-600 mb-1">Dirección de tu página de reservas</label>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-slate-400">{typeof window !== 'undefined' ? window.location.host : ''}/reservar/</span>
            <input id="reservas-slug" value={cfg.slug} onChange={(e) => cambiar({ slug: e.target.value.toLowerCase() })} maxLength={40} placeholder="mi-taller" className={`${campo} flex-1 min-w-[8rem]`} />
            {!cfg.slug && <button type="button" className={boton} onClick={() => cambiar({ slug: slugDesdeNombre(nombreEmpresa) })}>Proponer una</button>}
          </div>
        </div>
        {url && (
          <div className="space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-3">
            <p className="text-[11px] text-slate-500">{cfg.activas && !cambiado ? 'Comparte este enlace (Google, Instagram, WhatsApp, tu web):' : 'Así será tu enlace una vez guardes y actives las reservas:'}</p>
            <p className="text-xs font-mono text-slate-700 break-all" data-testid="enlace-reservas">{url}</p>
            <div className="flex gap-2 flex-wrap">
              <button type="button" className={boton} onClick={() => void copiar(url, 'Enlace')}><Copy size={12} className="inline -mt-0.5" /> Copiar enlace</button>
              <button type="button" className={boton} onClick={() => void copiar(codigoIframe(url), 'Código')}><Copy size={12} className="inline -mt-0.5" /> Copiar código para mi web</button>
            </div>
          </div>
        )}
      </section>

      {/* Tipos de cita */}
      <section className="space-y-3" data-testid="ajustes-tipos-cita">
        <div>
          <p className="text-xs font-bold text-slate-600">Qué se puede reservar</p>
          <p className="text-[11px] text-slate-400">Cada tipo de cita tiene su duración: es lo que ocupa en tu agenda.</p>
        </div>
        {tipos.length > 0 && (
          <ul className="divide-y divide-slate-100 border border-slate-100 rounded-2xl">
            {tipos.map((t) => (
              <li key={t.id} className={`px-3 py-2 flex items-center gap-2 text-xs ${t.activo ? '' : 'opacity-50'}`}>
                <span className="flex-1 font-semibold text-slate-700 truncate">{t.nombre}</span>
                <select value={t.duracionMin} aria-label={`Duración de ${t.nombre}`} className={`${campo} py-1 text-xs`}
                  onChange={(e) => void ejecutarTipos(() => actualizarTipoCita(t.id, { duracionMin: Number(e.target.value) }), 'No se pudo cambiar la duración.')}>
                  {[...new Set([...DURACIONES, t.duracionMin])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{textoDuracionCita(d)}</option>)}
                </select>
                <button type="button" className={boton} onClick={() => void ejecutarTipos(() => actualizarTipoCita(t.id, { activo: !t.activo }), 'No se pudo cambiar el tipo de cita.')}>{t.activo ? 'Desactivar' : 'Activar'}</button>
                <button type="button" aria-label={`Borrar ${t.nombre}`} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => void ejecutarTipos(() => borrarTipoCita(t.id), 'No se pudo borrar el tipo de cita.')}><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 flex-wrap">
          <input value={nuevoTipo.nombre} onChange={(e) => setNuevoTipo({ ...nuevoTipo, nombre: e.target.value })} placeholder="Nuevo tipo (p. ej. Cambio de aceite)" aria-label="Nombre del tipo de cita" maxLength={60} className={`${campo} flex-1 min-w-[10rem]`} />
          <select value={nuevoTipo.duracion} onChange={(e) => setNuevoTipo({ ...nuevoTipo, duracion: Number(e.target.value) })} aria-label="Duración del nuevo tipo" className={campo}>
            {DURACIONES.map((d) => <option key={d} value={d}>{textoDuracionCita(d)}</option>)}
          </select>
          <button type="button" className={boton} onClick={() => {
            const n = nombreValido(nuevoTipo.nombre, 60); if (!n) return setError('Escribe el nombre del tipo de cita.');
            void ejecutarTipos(async () => { await crearTipoCita(n, nuevoTipo.duracion); setNuevoTipo({ nombre: '', duracion: nuevoTipo.duracion }); }, 'No se pudo crear el tipo de cita.');
          }}><Plus size={12} className="inline -mt-0.5" /> Añadir</button>
        </div>
      </section>

      {/* Horario */}
      <section className="space-y-2" data-testid="ajustes-horario">
        <p className="text-xs font-bold text-slate-600">Horario para reservas</p>
        <p className="text-[11px] text-slate-400">Los clientes solo ven huecos dentro de estas franjas. Puedes poner hasta {MAX_TRAMOS} por día (por ejemplo, mañana y tarde).</p>
        {DIAS.map(({ id, nombre }) => {
          const tramos = cfg.horario[id];
          return (
            <div key={id} className="flex items-start gap-3 border-t border-slate-100 pt-2" data-testid={`dia-${id}`}>
              <label className="flex items-center gap-2 w-28 shrink-0 text-xs font-semibold text-slate-700 cursor-pointer pt-2">
                <input type="checkbox" checked={tramos.length > 0} aria-label={`${nombre} abierto`} className="w-4 h-4 cursor-pointer"
                  onChange={(e) => cambiarDia(id, e.target.checked ? [['09:00', '13:30']] : [])} />
                {nombre}
              </label>
              <div className="flex-1 space-y-1.5">
                {tramos.length === 0 && <p className="text-xs text-slate-400 pt-2">Cerrado</p>}
                {tramos.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="time" step={300} value={t[0]} aria-label={`${nombre} franja ${i + 1} desde`} className={`${campo} py-1 text-xs`}
                      onChange={(e) => cambiarDia(id, tramos.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) as Tramo[])} />
                    <span className="text-xs text-slate-400">a</span>
                    <input type="time" step={300} value={t[1]} aria-label={`${nombre} franja ${i + 1} hasta`} className={`${campo} py-1 text-xs`}
                      onChange={(e) => cambiarDia(id, tramos.map((x, j) => (j === i ? [x[0], e.target.value] : x)) as Tramo[])} />
                    <button type="button" aria-label={`Quitar la franja ${i + 1} del ${nombre}`} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer" onClick={() => cambiarDia(id, tramos.filter((_, j) => j !== i))}><X size={13} /></button>
                  </div>
                ))}
                {tramos.length > 0 && tramos.length < MAX_TRAMOS && (
                  <button type="button" className="text-[11px] font-semibold text-blue-600 cursor-pointer"
                    onClick={() => cambiarDia(id, [...tramos, [tramos[tramos.length - 1][1] < '19:00' ? '16:00' : '19:00', '19:30']] as Tramo[])}>+ Añadir franja</button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Días cerrados */}
      <section className="space-y-2" data-testid="ajustes-cierres">
        <p className="text-xs font-bold text-slate-600">Días cerrados</p>
        <p className="text-[11px] text-slate-400">Festivos, vacaciones… ese día no se ofrecen huecos.</p>
        <div className="flex gap-1.5 flex-wrap">
          {cfg.cierres.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {f.split('-').reverse().join('/')}
              <button type="button" aria-label={`Quitar el cierre del ${f}`} className="cursor-pointer text-slate-400 hover:text-rose-600" onClick={() => cambiar({ cierres: cfg.cierres.filter((x) => x !== f) })}><X size={11} /></button>
            </span>
          ))}
          {cfg.cierres.length === 0 && <span className="text-xs text-slate-400">Ninguno</span>}
        </div>
        <div className="flex gap-2">
          <input type="date" value={nuevoCierre} onChange={(e) => setNuevoCierre(e.target.value)} aria-label="Añadir día cerrado" className={`${campo} py-1.5`} />
          <button type="button" className={boton} onClick={() => { if (nuevoCierre && !cfg.cierres.includes(nuevoCierre)) { cambiar({ cierres: [...cfg.cierres, nuevoCierre].sort() }); } setNuevoCierre(''); }}>Cerrar ese día</button>
        </div>
      </section>

      {/* Reglas */}
      <section className="space-y-3">
        <p className="text-xs font-bold text-slate-600">Reglas</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-slate-600">Citas a la vez
            <input type="number" min={1} max={20} value={cfg.capacidad} onChange={(e) => cambiar({ capacidad: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} aria-label="Citas a la vez" className={`${campo} w-full mt-1`} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Antelación mínima (horas)
            <input type="number" min={0} max={168} value={cfg.antelacionHoras} onChange={(e) => cambiar({ antelacionHoras: Math.max(0, Math.min(168, Number(e.target.value) || 0)) })} aria-label="Antelación mínima en horas" className={`${campo} w-full mt-1`} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Se puede reservar hasta (días)
            <input type="number" min={1} max={90} value={cfg.diasMax} onChange={(e) => cambiar({ diasMax: Math.max(1, Math.min(90, Number(e.target.value) || 1)) })} aria-label="Días máximos de antelación" className={`${campo} w-full mt-1`} />
          </label>
        </div>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-semibold text-slate-600 mb-1">Confirmación</legend>
          {([['automatica', 'Automática', 'El cliente recibe la confirmación al instante.'], ['manual', 'La confirmo yo', 'Queda pendiente hasta que la confirmes en la Agenda.']] as const).map(([v, t, d]) => (
            <label key={v} className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="radio" name="confirmacion-reservas" checked={cfg.confirmacion === v} onChange={() => cambiar({ confirmacion: v })} className="mt-0.5 cursor-pointer" />
              <span><b className="text-slate-700">{t}.</b> {d}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-[11px] text-slate-400">
          {recordatoriosActivos
            ? 'El día anterior a cada cita confirmada, el cliente recibe un recordatorio por correo.'
            : 'Los recordatorios automáticos están apagados (pestaña Recordatorios): el cliente no recibirá el aviso del día anterior.'}
        </p>
      </section>

      {error && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
      {aviso && <p role="status" className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2">{aviso}</p>}
      <button type="button" disabled={guardando || !cambiado} onClick={() => void guardar()} data-testid="guardar-reservas"
        className="w-full px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 cursor-pointer">
        {guardando ? 'Guardando…' : cambiado ? 'Guardar reservas online' : 'Sin cambios'}
      </button>
    </div>
  );
}
