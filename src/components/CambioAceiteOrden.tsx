import { useState } from 'react';
import { Check, Droplet } from 'lucide-react';
import type { EstadoFiltro, FiltroAceite, OrdenTrabajo, Vehiculo } from '../types';
import { anotarProximoCambio, marcarFiltro, setCambioAceite } from '../lib/data/ordenes';
import { mensajeDeError } from '../lib/errores';
import { FILTROS, FILTROS_VACIOS, sumarMeses } from '../utils/aceite';
import { formatDate } from '../utils/dateFormat';
import { formatKm } from '../utils/moneda';

interface Props {
  ot: OrdenTrabajo;
  vehiculo?: Vehiculo;
  /** La orden tal como quedó en el servidor tras cada cambio (cada dato se guarda al momento). */
  onCambio: (ot: OrdenTrabajo) => void;
}

/**
 * Bloque «Cambio de aceite» de la ficha de una orden: interruptor, check list de filtros y próximo
 * cambio. Cada cosa se guarda en el momento de marcarla, fuera del formulario de edición de la orden,
 * para que el taller y el mecánico (que marca lo mismo desde su Portal) no se pisen.
 */
export default function CambioAceiteOrden({ ot, vehiculo, onCambio }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [fecha, setFecha] = useState('');
  const [km, setKm] = useState('');
  const [editandoProximo, setEditandoProximo] = useState(false);

  const cerrada = ot.estado === 'cancelado';
  const enTaller = ot.estado !== 'presupuesto' && !cerrada;
  const filtros = ot.filtros ?? FILTROS_VACIOS;
  const anotado = !!ot.aceiteAnotadoEn && !!vehiculo?.aceiteProximaFecha;

  const ejecutar = async (accion: () => Promise<OrdenTrabajo>, queFallo: string): Promise<boolean> => {
    setError('');
    setOcupado(true);
    try {
      onCambio(await accion());
      return true;
    } catch (err) {
      setError(mensajeDeError(err, queFallo));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const alternarFiltro = (filtro: FiltroAceite, estado: Exclude<EstadoFiltro, null>) =>
    // Pulsar el que ya está marcado lo deja «sin revisar».
    void ejecutar(() => marcarFiltro(ot.id, filtro, filtros[filtro] === estado ? null : estado), 'No se pudo guardar el filtro.');

  const guardarProximo = async () => {
    if (!fecha) { setError('Indica la fecha del próximo cambio.'); return; }
    const kmNum = km.trim() === '' ? null : Number(km);
    if (kmNum !== null && (!Number.isInteger(kmNum) || kmNum <= 0)) { setError('Los kilómetros del próximo cambio no son válidos.'); return; }
    const ok = await ejecutar(() => anotarProximoCambio(ot.id, fecha, kmNum), 'No se pudo anotar el próximo cambio.');
    if (ok) { setEditandoProximo(false); setFecha(''); setKm(''); }
  };

  const abrirProximo = () => {
    setError('');
    setFecha(anotado ? vehiculo!.aceiteProximaFecha! : '');
    setKm(anotado && vehiculo!.aceiteProximoKm ? String(vehiculo!.aceiteProximoKm) : '');
    setEditandoProximo(true);
  };

  if (cerrada && !ot.esCambioAceite) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="cambio-aceite">
      <label className={`flex items-center justify-between gap-3 ${cerrada ? '' : 'cursor-pointer'}`}>
        <span className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Droplet size={11} /> Cambio de aceite</span>
        <span className="flex items-center gap-2 text-xs text-slate-600">
          {ot.esCambioAceite ? 'Sí' : 'Esta orden no es un cambio de aceite'}
          <input
            type="checkbox" className="w-4 h-4 accent-blue-600 cursor-pointer" aria-label="Es un cambio de aceite"
            checked={!!ot.esCambioAceite} disabled={ocupado || cerrada}
            onChange={(e) => void ejecutar(() => setCambioAceite(ot.id, e.target.checked), 'No se pudo cambiar la marca de cambio de aceite.')}
          />
        </span>
      </label>

      {ot.esCambioAceite && (
        <>
          <div className="space-y-1.5">
            {FILTROS.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-700">{f.nombre}</span>
                <span className="flex gap-1.5" role="group" aria-label={f.nombre}>
                  {([['cambiado', 'Cambiado'], ['no_cambiado', 'No se cambió']] as const).map(([estado, texto]) => {
                    const activo = filtros[f.id] === estado;
                    return (
                      <button
                        key={estado} type="button" disabled={ocupado || cerrada} aria-pressed={activo}
                        onClick={() => alternarFiltro(f.id, estado)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-default flex items-center gap-1 ${
                          activo
                            ? estado === 'cambiado' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {activo && <Check size={10} />}{texto}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Próximo cambio</p>
            {!enTaller ? (
              <p className="text-xs text-slate-400">Se anota cuando el vehículo ya está en el taller.</p>
            ) : editandoProximo ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor={`aceite-fecha-${ot.id}`} className="block text-[10px] font-semibold text-slate-500 mb-1">Fecha *</label>
                    <input id={`aceite-fecha-${ot.id}`} type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); setError(''); }}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label htmlFor={`aceite-km-${ot.id}`} className="block text-[10px] font-semibold text-slate-500 mb-1">O a los km (opcional)</label>
                    <input id={`aceite-km-${ot.id}`} type="number" min="1" step="1" inputMode="numeric" value={km} onChange={(e) => { setKm(e.target.value); setError(''); }}
                      placeholder={vehiculo ? `más de ${formatKm(vehiculo.kilometraje)}` : ''}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setFecha(sumarMeses(6)); setError(''); }} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Dentro de 6 meses</button>
                  <button type="button" onClick={() => { setFecha(sumarMeses(12)); setError(''); }} className="px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Dentro de 1 año</button>
                </div>
                <p className="text-[10px] text-slate-400">Al guardar, la ficha del vehículo anota el cambio de hoy con sus kilómetros y este próximo cambio.</p>
              </div>
            ) : anotado ? (
              <p className="text-xs text-slate-700">
                <span className="font-semibold">{formatDate(vehiculo!.aceiteProximaFecha!)}</span>
                {vehiculo!.aceiteProximoKm ? ` o a los ${formatKm(vehiculo!.aceiteProximoKm)} km, lo que ocurra antes` : ''}
              </p>
            ) : (
              <p className="text-xs text-slate-400">Sin anotar. Si se entrega así, la ficha registrará el cambio pero quedará sin fecha del próximo.</p>
            )}
          </div>
        </>
      )}

      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-xl">{error}</div>}

      {ot.esCambioAceite && enTaller && (
        editandoProximo ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => { setEditandoProximo(false); setError(''); }} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" onClick={() => void guardarProximo()} disabled={ocupado}
              className="flex-1 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
              {ocupado ? 'Guardando…' : 'Guardar próximo cambio'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={abrirProximo} disabled={ocupado}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer">
            {anotado ? 'Cambiar el próximo cambio' : 'Anotar próximo cambio'}
          </button>
        )
      )}
    </div>
  );
}
