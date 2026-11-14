import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, ChevronDown, ClipboardCheck, Trash2 } from 'lucide-react';
import type { PortalInspeccion, PortalInspeccionPunto } from '../lib/data/portalMecanico';
import {
  borrarFotoInspeccionMecanico, crearInspeccionMecanico, marcarPuntoMecanico, reabrirInspeccionMecanico,
  subirFotoInspeccionMecanico, terminarInspeccionMecanico,
} from '../lib/data/portalMecanico';
import {
  agruparPorCategoria, ESTADOS_PUNTO, ETIQUETA_ESTADO, MAX_FOTOS_INSPECCION, MAX_FOTOS_PUNTO, necesitaDetalle, resumenPuntos,
  type EstadoPunto,
} from '../utils/inspeccion';

interface Props {
  token: string;
  ordenId: string;
  inspeccion: PortalInspeccion | undefined;
  /** El coche sigue en el taller (recibido o en reparación): solo entonces se puede abrir o cambiar la inspección. */
  editable: boolean;
  /** Ejecuta una acción contra el servidor y vuelve a leer la lista (devuelve si salió bien). */
  ejecutar: (accion: () => Promise<void>) => Promise<boolean>;
  ocupado: boolean;
}

const TONO: Record<EstadoPunto, { activo: string; punto: string }> = {
  bien: { activo: 'bg-teal-50 border-teal-400 text-teal-800', punto: 'bg-teal-500' },
  atencion: { activo: 'bg-amber-50 border-amber-400 text-amber-800', punto: 'bg-amber-500' },
  urgente: { activo: 'bg-rose-50 border-rose-400 text-rose-800', punto: 'bg-rose-500' },
  no_aplica: { activo: 'bg-slate-100 border-slate-400 text-slate-700', punto: 'bg-slate-400' },
};

/** Un punto con problema: nota, reparación propuesta y fotos. */
function DetallePunto({ punto, inspeccionId, token, ocupado, ejecutar, bloqueado }: {
  punto: PortalInspeccionPunto; inspeccionId: string; token: string; ocupado: boolean; bloqueado: boolean;
  ejecutar: Props['ejecutar'];
}) {
  const [nota, setNota] = useState(punto.nota ?? '');
  const [reparacion, setReparacion] = useState(punto.reparacion ?? '');
  const entrada = useRef<HTMLInputElement>(null);

  // Si el servidor trae otro valor (otro dispositivo, o se acaba de guardar) se refleja, salvo que el campo
  // tenga cambios sin guardar: escribir en uno mientras se guarda el otro no debe borrar lo escrito.
  const notaServidor = useRef(punto.nota ?? '');
  const reparacionServidor = useRef(punto.reparacion ?? '');
  useEffect(() => {
    const nuevo = punto.nota ?? '';
    setNota((actual) => (actual === notaServidor.current ? nuevo : actual));
    notaServidor.current = nuevo;
  }, [punto.nota]);
  useEffect(() => {
    const nuevo = punto.reparacion ?? '';
    setReparacion((actual) => (actual === reparacionServidor.current ? nuevo : actual));
    reparacionServidor.current = nuevo;
  }, [punto.reparacion]);

  const guardarTextos = () => {
    if ((punto.nota ?? '') === nota.trim() && (punto.reparacion ?? '') === reparacion.trim()) return;
    void ejecutar(() => marcarPuntoMecanico(token, inspeccionId, punto.id, punto.estado, nota, reparacion));
  };

  const subir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivos = [...(e.target.files ?? [])].slice(0, MAX_FOTOS_PUNTO - punto.fotos.length);
    e.target.value = '';
    if (!archivos.length) return;
    void ejecutar(async () => { for (const a of archivos) await subirFotoInspeccionMecanico(token, inspeccionId, punto.id, a); });
  };

  return (
    <div className="mt-2 space-y-2" data-testid="detalle-punto">
      <textarea
        value={nota} onChange={(e) => setNota(e.target.value)} onBlur={guardarTextos} disabled={bloqueado}
        rows={2} maxLength={500} placeholder="Nota para el cliente (qué has visto)"
        aria-label={`Nota de ${punto.nombre}`}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50"
      />
      <input
        value={reparacion} onChange={(e) => setReparacion(e.target.value)} onBlur={guardarTextos} disabled={bloqueado}
        maxLength={300} placeholder="Reparación propuesta (opcional)" aria-label={`Reparación propuesta de ${punto.nombre}`}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-slate-50"
      />
      <div className="flex gap-2 flex-wrap">
        {punto.fotos.map((f) => (
          <div key={f.ruta} className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
            {f.url ? <img src={f.url} alt={`Foto de ${punto.nombre}`} className="w-full h-full object-cover" /> : <Camera className="w-5 h-5 text-slate-300 m-auto mt-5" />}
            {!bloqueado && (
              <button type="button" disabled={ocupado} aria-label="Quitar foto"
                onClick={() => void ejecutar(() => borrarFotoInspeccionMecanico(token, inspeccionId, punto.id, f.ruta))}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer">
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {!bloqueado && punto.fotos.length < MAX_FOTOS_PUNTO && (
          <>
            <button type="button" disabled={ocupado} onClick={() => entrada.current?.click()}
              className="w-16 h-16 rounded-xl border border-dashed border-slate-300 text-slate-500 flex flex-col items-center justify-center text-[10px] font-semibold gap-0.5 disabled:opacity-50 cursor-pointer">
              <Camera className="w-5 h-5" />Foto
            </button>
            <input ref={entrada} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={subir} aria-label={`Añadir foto a ${punto.nombre}`} />
          </>
        )}
      </div>
    </div>
  );
}

export default function InspeccionMecanico({ token, ordenId, inspeccion, editable, ejecutar, ocupado }: Props) {
  const [abierta, setAbierta] = useState(false);
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);
  const [notaGeneral, setNotaGeneral] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  // Marcas pendientes de confirmar por el servidor: el toque se ve al instante y se corrige solo si falla.
  const [locales, setLocales] = useState<Record<string, EstadoPunto | null>>({});

  useEffect(() => { setLocales({}); }, [inspeccion]);
  useEffect(() => { setNotaGeneral(inspeccion?.notaGeneral ?? ''); }, [inspeccion?.notaGeneral]);

  if (!inspeccion) {
    if (!editable) return null;
    return (
      <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => crearInspeccionMecanico(token, ordenId)).then((ok) => ok && setAbierta(true))}
        data-testid="abrir-inspeccion"
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm font-semibold disabled:opacity-50 cursor-pointer">
        <ClipboardCheck className="w-4 h-4" /> Hacer inspección del vehículo
      </button>
    );
  }

  const puntos = inspeccion.puntos.map((p) => (p.id in locales ? { ...p, estado: locales[p.id] } : p));
  const r = resumenPuntos(puntos);
  const bloqueado = inspeccion.estado !== 'borrador' || !editable;
  const totalFotos = puntos.reduce((n, p) => n + p.fotos.length, 0);

  const marcar = (p: PortalInspeccionPunto, estado: EstadoPunto) => {
    const nuevo = p.estado === estado ? null : estado;
    setLocales((l) => ({ ...l, [p.id]: nuevo }));
    void ejecutar(() => marcarPuntoMecanico(token, inspeccion.id, p.id, nuevo, p.nota, p.reparacion));
  };

  const terminar = async () => {
    if (r.sinMarcar > 0 && !confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    await ejecutar(() => terminarInspeccionMecanico(token, inspeccion.id, notaGeneral));
  };

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 p-3" data-testid="inspeccion-mecanico">
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="w-full flex items-center justify-between gap-2 cursor-pointer">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Inspección</span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold">
          {inspeccion.estado !== 'borrador' && <span className="text-teal-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Terminada</span>}
          {r.urgente > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">{r.urgente} urg.</span>}
          {r.atencion > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{r.atencion} atenc.</span>}
          <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.total - r.sinMarcar}/{r.total}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierta ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {abierta && (
        <div className="mt-3 space-y-2">
          {inspeccion.estado === 'terminada' && (
            <p className="text-xs bg-teal-50 border border-teal-200 text-teal-800 rounded-xl px-3 py-2">
              Terminada. El taller la revisará y se la enviará al cliente. Si quieres corregir algo, reábrela.
            </p>
          )}

          {agruparPorCategoria(puntos).map((g) => {
            const hechos = g.puntos.filter((p) => p.estado).length;
            const desplegada = categoriaAbierta === g.categoria;
            return (
              <div key={g.categoria} className="rounded-xl border border-slate-100">
                <button type="button" onClick={() => setCategoriaAbierta(desplegada ? null : g.categoria)} aria-expanded={desplegada}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-bold text-slate-700 cursor-pointer">
                  <span>{g.categoria}</span>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                    {hechos}/{g.puntos.length}
                    <ChevronDown className={`w-4 h-4 transition-transform ${desplegada ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {desplegada && (
                  <div className="px-3 pb-3 space-y-3">
                    {g.puntos.map((p) => (
                      <div key={p.id} data-testid="punto">
                        <p className="text-sm text-slate-700 mb-1.5 flex items-center gap-1.5">
                          {p.estado && <span className={`w-2 h-2 rounded-full ${TONO[p.estado].punto}`} />}{p.nombre}
                        </p>
                        <div className="grid grid-cols-4 gap-1" role="group" aria-label={p.nombre}>
                          {ESTADOS_PUNTO.map((e) => (
                            <button key={e} type="button" disabled={bloqueado || ocupado} aria-pressed={p.estado === e} onClick={() => marcar(p, e)}
                              className={`py-1.5 rounded-lg border text-[11px] font-bold disabled:opacity-60 cursor-pointer ${p.estado === e ? TONO[e].activo : 'bg-white border-slate-200 text-slate-500'}`}>
                              {ETIQUETA_ESTADO[e]}
                            </button>
                          ))}
                        </div>
                        {necesitaDetalle(p.estado) && (
                          <DetallePunto punto={p} inspeccionId={inspeccion.id} token={token} ocupado={ocupado} bloqueado={bloqueado} ejecutar={ejecutar} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {inspeccion.estado === 'borrador' && editable && (
            <div className="space-y-2 pt-1">
              <textarea value={notaGeneral} onChange={(e) => setNotaGeneral(e.target.value)} rows={2} maxLength={500} aria-label="Nota general de la inspección"
                placeholder="Nota general (opcional)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {confirmar && (
                <p role="alert" className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
                  Quedan {r.sinMarcar} punto{r.sinMarcar === 1 ? '' : 's'} sin marcar. Si terminas ahora, esos puntos no aparecerán en el informe.
                </p>
              )}
              <button type="button" disabled={ocupado || r.total - r.sinMarcar === 0} onClick={() => void terminar()}
                data-testid="terminar-inspeccion"
                className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold disabled:opacity-50 cursor-pointer">
                {confirmar ? 'Terminar igualmente' : 'Terminar inspección'}
              </button>
              {confirmar && <button type="button" onClick={() => setConfirmar(false)} className="w-full text-xs font-semibold text-slate-500 underline cursor-pointer">Seguir revisando</button>}
              <p className="text-[11px] text-slate-400 text-center">{totalFotos} de {MAX_FOTOS_INSPECCION} fotos usadas</p>
            </div>
          )}

          {inspeccion.estado === 'terminada' && editable && (
            <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => reabrirInspeccionMecanico(token, inspeccion.id))}
              className="w-full py-2.5 rounded-2xl border border-slate-300 text-slate-600 text-sm font-semibold disabled:opacity-50 cursor-pointer">
              Reabrir para corregir
            </button>
          )}
        </div>
      )}
    </div>
  );
}
