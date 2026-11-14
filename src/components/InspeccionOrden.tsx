import { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, Copy, Mail, Send, Trash2 } from 'lucide-react';
import type { OrdenTrabajo } from '../types';
import { supabase } from '../lib/supabase';
import { getOrden } from '../lib/data/ordenes';
import {
  anadirAprobadasAOrden, borrarFotoPunto, crearInspeccion, devolverAlMecanico, enviarInspeccion, getConservarFotos,
  getInspeccionDeOrden, guardarNotaGeneral, guardarPunto, reabrirInspeccion, setConservarFotos, urlsFotos,
  type Inspeccion, type InspeccionPunto,
} from '../lib/data/inspecciones';
import { mensajeDeError } from '../lib/errores';
import {
  agruparPorCategoria, ESTADOS_PUNTO, ETIQUETA_ESTADO, ETIQUETA_ESTADO_INSPECCION, necesitaDetalle, parsearPrecio,
  puntosPendientesDeAnadir, resumenPuntos, totalPuntos, urgentesSinPrecio, type EstadoPunto,
} from '../utils/inspeccion';
import { fmt2 } from '../utils/moneda';
import { formatDate } from '../utils/dateFormat';

interface Props {
  ot: OrdenTrabajo;
  /** Meses que el taller conserva las fotos (Ajustes de empresa). */
  retencionMeses: number;
  /** La orden tal como quedó en el servidor tras añadir reparaciones (cambian líneas y totales). */
  onCambioOrden: (ot: OrdenTrabajo) => void;
}

const TONO: Record<EstadoPunto, string> = {
  bien: 'bg-teal-50 border-teal-300 text-teal-800',
  atencion: 'bg-amber-50 border-amber-300 text-amber-800',
  urgente: 'bg-rose-50 border-rose-300 text-rose-800',
  no_aplica: 'bg-slate-100 border-slate-300 text-slate-700',
};
const CHIP_INSPECCION: Record<Inspeccion['estado'], string> = {
  borrador: 'bg-slate-100 text-slate-600', terminada: 'bg-amber-100 text-amber-700',
  enviada: 'bg-blue-100 text-blue-700', respondida: 'bg-teal-100 text-teal-700',
};

/** Un punto con problema, para revisar: estado, nota, reparación, precio y fotos. */
function PuntoRevision({ punto, urls, editable, onGuardar, onBorrarFoto }: {
  punto: InspeccionPunto; urls: Record<string, string>; editable: boolean;
  onGuardar: (cambios: Partial<Pick<InspeccionPunto, 'estado' | 'nota' | 'reparacion' | 'precio'>>) => Promise<void>;
  onBorrarFoto: (ruta: string) => Promise<void>;
}) {
  const [nota, setNota] = useState(punto.nota ?? '');
  const [reparacion, setReparacion] = useState(punto.reparacion ?? '');
  const [precio, setPrecio] = useState(punto.precio != null ? String(punto.precio).replace('.', ',') : '');
  const [errorPrecio, setErrorPrecio] = useState(false);

  const guardarTextos = () => {
    const n = nota.trim() || null; const r = reparacion.trim() || null;
    if (n !== punto.nota || r !== punto.reparacion) void onGuardar({ nota: n, reparacion: r });
  };
  const guardarPrecio = () => {
    const v = parsearPrecio(precio);
    if (v === undefined) { setErrorPrecio(true); return; }
    setErrorPrecio(false);
    if (v !== punto.precio) void onGuardar({ precio: v });
  };

  const decision = punto.decision === 'aprobado' ? { t: 'Aprobado por el cliente', c: 'bg-teal-100 text-teal-700' }
    : punto.decision === 'rechazado' ? { t: 'Rechazado por el cliente', c: 'bg-rose-100 text-rose-700' } : null;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2" data-testid="punto-revision">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-slate-800">{punto.nombre} <span className="font-normal text-slate-400">· {punto.categoria}</span></p>
        <span className="flex items-center gap-1.5">
          {decision && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${decision.c}`}>{decision.t}</span>}
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${TONO[punto.estado!]}`}>{ETIQUETA_ESTADO[punto.estado!]}</span>
        </span>
      </div>

      {editable && (
        <div className="grid grid-cols-3 gap-1" role="group" aria-label={`Estado de ${punto.nombre}`}>
          {ESTADOS_PUNTO.filter((e) => e !== 'no_aplica').map((e) => (
            <button key={e} type="button" aria-pressed={punto.estado === e} onClick={() => punto.estado !== e && void onGuardar({ estado: e })}
              className={`py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${punto.estado === e ? TONO[e] : 'bg-white border-slate-200 text-slate-500'}`}>
              {ETIQUETA_ESTADO[e]}
            </button>
          ))}
        </div>
      )}

      {punto.fotos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {punto.fotos.map((ruta) => (
            <div key={ruta} className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
              {urls[ruta]
                ? <a href={urls[ruta]} target="_blank" rel="noopener noreferrer"><img src={urls[ruta]} alt={`Foto de ${punto.nombre}`} className="w-full h-full object-cover" /></a>
                : <Camera className="w-5 h-5 text-slate-300 m-auto mt-6" />}
              {editable && (
                <button type="button" aria-label="Quitar foto" onClick={() => void onBorrarFoto(ruta)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable ? (
        <>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} onBlur={guardarTextos} rows={2} maxLength={500}
            aria-label={`Nota de ${punto.nombre}`} placeholder="Nota para el cliente"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <input value={reparacion} onChange={(e) => setReparacion(e.target.value)} onBlur={guardarTextos} maxLength={300}
            aria-label={`Reparación propuesta de ${punto.nombre}`} placeholder="Reparación propuesta"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor={`precio-${punto.id}`}>Precio (sin IVA)</label>
            <input id={`precio-${punto.id}`} value={precio} onChange={(e) => { setPrecio(e.target.value); setErrorPrecio(false); }} onBlur={guardarPrecio}
              inputMode="decimal" placeholder={punto.estado === 'urgente' ? 'Obligatorio' : 'Opcional'} aria-label={`Precio de ${punto.nombre}`}
              className={`w-28 px-3 py-1.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${errorPrecio ? 'border-rose-400' : 'border-slate-200'}`} />
            <span className="text-xs text-slate-400">€</span>
            {errorPrecio && <span className="text-xs text-rose-600">Importe no válido</span>}
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-700 space-y-0.5">
          {punto.nota && <p>{punto.nota}</p>}
          {punto.reparacion && <p className="text-slate-500">Propuesta: {punto.reparacion}</p>}
          {punto.precio != null && <p className="font-semibold">{fmt2(punto.precio)} € + IVA</p>}
        </div>
      )}
    </div>
  );
}

export default function InspeccionOrden({ ot, retencionMeses, onCambioOrden }: Props) {
  const [insp, setInsp] = useState<Inspeccion | null | undefined>(undefined);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [conservar, setConservar] = useState(false);
  const [fotosBorradas, setFotosBorradas] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [notaGeneral, setNotaGeneral] = useState('');

  const cerrada = ot.estado === 'cancelado';

  const cargar = useCallback(async () => {
    const i = await getInspeccionDeOrden(ot.id);
    setInsp(i);
    setNotaGeneral(i?.notaGeneral ?? '');
    const rutas = i ? i.puntos.flatMap((p) => p.fotos) : [];
    setUrls(rutas.length ? await urlsFotos(rutas).catch(() => ({})) : {});
    const c = await getConservarFotos(ot.id).catch(() => null);
    if (c) { setConservar(c.conservar); setFotosBorradas(c.borradasEn); }
  }, [ot.id]);

  useEffect(() => {
    setInsp(undefined); setError(''); setAviso('');
    cargar().catch((e) => { setInsp(null); setError(mensajeDeError(e, 'No se pudo cargar la inspección.')); });
  }, [cargar]);

  // El mecánico trabaja desde su móvil: mientras está en curso, la pantalla del taller se refresca sola.
  useEffect(() => {
    if (insp?.estado !== 'borrador') return;
    const id = setInterval(() => { void cargar().catch(() => undefined); }, 20_000);
    return () => clearInterval(id);
  }, [insp?.estado, cargar]);

  const ejecutar = async (accion: () => Promise<void>, queFallo: string, recargar = true): Promise<boolean> => {
    setError(''); setAviso(''); setOcupado(true);
    try {
      await accion();
      if (recargar) await cargar();
      return true;
    } catch (e) {
      setError(mensajeDeError(e, queFallo));
      await cargar().catch(() => undefined);
      return false;
    } finally {
      setOcupado(false);
    }
  };

  if (insp === undefined) return null;

  // Conservación de fotos: vale para las de recepción y para las de inspección, con o sin inspección abierta.
  const hayFotos = (ot.fotosRecepcion?.length ?? 0) > 0 || !!insp?.puntos.some((p) => p.fotos.length > 0);
  const bloqueConservar = hayFotos || conservar ? (
    <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-blue-600" checked={conservar} disabled={ocupado} data-testid="conservar-fotos"
        onChange={(e) => void ejecutar(async () => { await setConservarFotos(ot.id, e.target.checked); setConservar(e.target.checked); }, 'No se pudo cambiar la conservación de fotos.', false)} />
      <span><span className="font-semibold">Conservar las fotos de esta orden</span> (reclamación abierta, por ejemplo). Si no, se borran {retencionMeses} meses después de la entrega.</span>
    </label>
  ) : null;

  if (cerrada && !insp) return bloqueConservar ? <div className="rounded-2xl border border-slate-200 bg-white p-4">{bloqueConservar}</div> : null;

  // ---- Sin inspección todavía ----
  if (!insp) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="inspeccion-orden">
        <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><ClipboardCheck size={11} /> Inspección digital</p>
        <p className="text-xs text-slate-500">Lista de comprobaciones con semáforo y fotos. El mecánico la rellena desde su móvil y tú la revisas, pones precio y se la envías al cliente.</p>
        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-xl">{error}</div>}
        <button type="button" disabled={ocupado} data-testid="iniciar-inspeccion"
          onClick={() => void ejecutar(async () => { setInsp(await crearInspeccion(ot.id)); }, 'No se pudo iniciar la inspección.', false)}
          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
          {ocupado ? 'Abriendo…' : 'Iniciar inspección'}
        </button>
        {bloqueConservar && <div className="border-t border-slate-100 pt-3">{bloqueConservar}</div>}
      </div>
    );
  }

  // ---- Con inspección ----
  const r = resumenPuntos(insp.puntos);
  const revisable = insp.estado === 'terminada';
  const sinPrecio = urgentesSinPrecio(insp.puntos);
  const conProblema = insp.puntos.filter((p) => necesitaDetalle(p.estado));
  const pendientesAnadir = puntosPendientesDeAnadir(insp.puntos, new Set(ot.lineas.map((l) => l.inspeccionPuntoId).filter((x): x is string => !!x)));
  const puedeAnadir = pendientesAnadir.length > 0 && (ot.estado === 'recibido' || ot.estado === 'en_reparacion');
  const aprobables = conProblema.filter((p) => p.precio != null && p.precio > 0);

  const enlaceCliente = async (): Promise<string> => {
    const { data, error: e } = await supabase.from('clientes').select('portal_token').eq('id', insp.clienteId).single();
    if (e || !data?.portal_token) throw new Error('El cliente aún no tiene enlace a su portal.');
    return `${window.location.origin}/portal/${data.portal_token}`;
  };

  const enviar = (porCorreo: boolean) => void ejecutar(async () => {
    const { enlace } = await enviarInspeccion(insp.id, porCorreo);
    if (!porCorreo) { try { await navigator.clipboard.writeText(enlace); setAviso('Marcada como enviada. Enlace copiado: pégalo en el mensaje al cliente.'); } catch { setAviso(`Marcada como enviada. Enlace: ${enlace}`); } }
    else setAviso('Informe enviado al cliente por correo.');
  }, 'No se pudo enviar la inspección.');

  const copiarEnlace = () => void ejecutar(async () => {
    const enlace = await enlaceCliente();
    await navigator.clipboard.writeText(enlace);
    setAviso('Enlace copiado.');
  }, 'No se pudo copiar el enlace.', false);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="inspeccion-orden">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><ClipboardCheck size={11} /> Inspección digital</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${CHIP_INSPECCION[insp.estado]}`}>{ETIQUETA_ESTADO_INSPECCION[insp.estado]}</span>
      </div>

      <div className="flex gap-1.5 flex-wrap text-[11px] font-semibold">
        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{r.urgente} urgente{r.urgente === 1 ? '' : 's'}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">{r.atencion} en atención</span>
        <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">{r.bien} bien</span>
        {r.sinMarcar > 0 && insp.estado === 'borrador' && <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{r.sinMarcar} sin marcar</span>}
      </div>

      {insp.estado === 'borrador' && (
        <p className="text-xs text-slate-500">
          {insp.realizadaPor ? `${insp.realizadaPor} la está rellenando` : 'El mecánico la está rellenando'} desde su móvil. Se actualiza sola.
        </p>
      )}
      {fotosBorradas && <p className="text-xs bg-slate-50 border border-slate-200 text-slate-600 rounded-xl px-3 py-2">Las fotos se eliminaron el {formatDate(fotosBorradas.slice(0, 10))} al cumplirse el plazo de conservación.</p>}

      {/* Puntos con problema: revisión (editable solo cuando está terminada) */}
      {conProblema.length > 0 && (
        <div className="space-y-2">
          {agruparPorCategoria(conProblema).map((g) => g.puntos.map((p) => (
            <PuntoRevision key={p.id} punto={p} urls={urls} editable={revisable}
              onGuardar={(c) => ejecutar(() => guardarPunto(p.id, c), 'No se pudo guardar el cambio.').then(() => undefined)}
              onBorrarFoto={(ruta) => ejecutar(() => borrarFotoPunto(p, ruta), 'No se pudo quitar la foto.').then(() => undefined)} />
          )))}
        </div>
      )}
      {conProblema.length === 0 && r.bien > 0 && <p className="text-xs text-slate-500">Todo lo revisado está bien.</p>}

      {insp.estado !== 'borrador' && insp.notaGeneral && !revisable && <p className="text-sm text-slate-600">{insp.notaGeneral}</p>}
      {revisable && (
        <textarea value={notaGeneral} onChange={(e) => setNotaGeneral(e.target.value)} rows={2} maxLength={500} aria-label="Nota general de la inspección"
          onBlur={() => { const n = notaGeneral.trim() || null; if (n !== insp.notaGeneral) void ejecutar(() => guardarNotaGeneral(insp.id, n), 'No se pudo guardar la nota.'); }}
          placeholder="Nota general para el cliente (opcional)" className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      )}

      {aprobables.length > 0 && <p className="text-xs text-slate-600">Reparaciones propuestas: <span className="font-bold text-slate-800">{fmt2(totalPuntos(aprobables))} € + IVA</span> ({aprobables.length})</p>}

      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-xl">{error}</div>}
      {aviso && <div role="status" className="bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-1.5"><CheckCircle2 size={12} />{aviso}</div>}

      {/* Acciones por estado */}
      {insp.estado === 'borrador' && (
        <button type="button" disabled={ocupado || r.total - r.sinMarcar === 0}
          onClick={() => void ejecutar(async () => {
            const { error: e } = await supabase.from('inspecciones').update({ estado: 'terminada', terminada_en: new Date().toISOString() }).eq('id', insp.id);
            if (e) throw new Error(e.message);
          }, 'No se pudo dar por terminada.')}
          className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
          Darla por terminada yo
        </button>
      )}

      {revisable && (
        <div className="space-y-2">
          {sinPrecio > 0 && <p role="alert" className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">Falta el precio de {sinPrecio} punto{sinPrecio === 1 ? '' : 's'} urgente{sinPrecio === 1 ? '' : 's'}: ponlo antes de enviar.</p>}
          <div className="flex gap-2 flex-wrap">
            <button type="button" disabled={ocupado || sinPrecio > 0} onClick={() => enviar(true)} data-testid="enviar-correo"
              className="flex-1 min-w-[10rem] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
              <Mail size={13} /> Enviar por correo
            </button>
            <button type="button" disabled={ocupado || sinPrecio > 0} onClick={() => enviar(false)}
              className="flex-1 min-w-[10rem] flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer">
              <Copy size={13} /> Copiar enlace y marcar enviada
            </button>
          </div>
          <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => devolverAlMecanico(insp), 'No se pudo devolver al mecánico.')}
            className="text-xs font-semibold text-slate-500 underline cursor-pointer disabled:opacity-50">Devolver al mecánico para que la corrija</button>
        </div>
      )}

      {insp.estado === 'enviada' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500 flex items-center gap-1"><Send size={11} /> Enviada el {formatDate((insp.enviadaEn ?? '').slice(0, 10))}. Esperando la respuesta del cliente.</p>
          <div className="flex gap-3 flex-wrap">
            <button type="button" disabled={ocupado} onClick={copiarEnlace} className="text-xs font-semibold text-blue-600 underline cursor-pointer disabled:opacity-50">Copiar enlace del cliente</button>
            <button type="button" disabled={ocupado} onClick={() => void ejecutar(() => reabrirInspeccion(insp), 'No se pudo reabrir.')} className="text-xs font-semibold text-slate-500 underline cursor-pointer disabled:opacity-50">Reabrir para corregir</button>
          </div>
        </div>
      )}

      {insp.estado === 'respondida' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">El cliente respondió el {formatDate((insp.respondidaEn ?? '').slice(0, 10))}.</p>
          {puedeAnadir && (
            <button type="button" disabled={ocupado} data-testid="anadir-aprobadas"
              onClick={() => void ejecutar(async () => {
                const { anadidas, total } = await anadirAprobadasAOrden(ot.id, insp.puntos);
                onCambioOrden(await getOrden(ot.id));
                setAviso(`Añadidas ${anadidas} reparación(es) a la orden (${fmt2(total)} € + IVA).`);
              }, 'No se pudieron añadir las reparaciones.')}
              className="px-3 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
              Añadir lo aprobado a la orden ({pendientesAnadir.length})
            </button>
          )}
          {!puedeAnadir && pendientesAnadir.length > 0 && <p className="text-xs text-amber-700">Hay reparaciones aprobadas sin añadir, pero la orden ya no está en el taller.</p>}
        </div>
      )}

      {bloqueConservar && <div className="border-t border-slate-100 pt-3">{bloqueConservar}</div>}
    </div>
  );
}
