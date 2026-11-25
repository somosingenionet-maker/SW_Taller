import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { OrdenTrabajo, Vehiculo } from '../../types';
import { proximaItvTrasPasarla } from '../../utils/renovacion';
import { hoyLocal } from '../../utils/avisos';
import { formatDate } from '../../utils/dateFormat';
import { mensajeDeError } from '../../lib/errores';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Al entregar una orden pre-ITV: si el coche ya pasó la ITV, se anota el nuevo vencimiento en la ficha del vehículo
 * (así el aviso automático del año siguiente sale con la fecha buena). Si aún no la ha pasado, se entrega sin anotar.
 */
export default function EntregaPreItvModal({ ot, vehiculo, onAnotarYEntregar, onEntregarSinAnotar, onCerrar }: {
  ot: OrdenTrabajo;
  vehiculo?: Vehiculo;
  onAnotarYEntregar: (nuevoVencimiento: string) => Promise<void>;
  onEntregarSinAnotar: () => Promise<void>;
  onCerrar: () => void;
}) {
  const hoy = hoyLocal();
  const propuesta = (dia: string) => proximaItvTrasPasarla(dia, vehiculo?.itvVencimiento, vehiculo?.anio);
  const [pasadaEl, setPasadaEl] = useState(hoy);
  const [vencimiento, setVencimiento] = useState(() => propuesta(hoy));
  const [tocada, setTocada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cambiarPasadaEl = (dia: string) => {
    setPasadaEl(dia); setError('');
    // Mientras no se haya escrito a mano el vencimiento, la propuesta sigue al día en que se pasó.
    if (!tocada && FECHA.test(dia)) setVencimiento(propuesta(dia));
  };

  const ejecutar = async (accion: () => Promise<void>) => {
    setGuardando(true); setError('');
    try { await accion(); } catch (err) { setError(mensajeDeError(err, 'No se pudo anotar la fecha de la ITV.')); setGuardando(false); }
  };

  const anotar = () => {
    if (!FECHA.test(vencimiento)) { setError('Indica la nueva fecha de vencimiento de la ITV.'); return; }
    if (vencimiento <= hoy) { setError('La nueva fecha de vencimiento tiene que ser posterior a hoy.'); return; }
    void ejecutar(() => onAnotarYEntregar(vencimiento));
  };

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={() => !guardando && onCerrar()} />
      <div role="dialog" aria-modal="true" aria-labelledby="entrega-pre-itv-titulo" data-testid="entrega-pre-itv"
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-5 dlg-b">
        <div>
          <h3 id="entrega-pre-itv-titulo" className="font-bold text-slate-800 text-base flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600" /> Entregar · ¿ha pasado la ITV?
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {ot.numero}{vehiculo ? ` · ${vehiculo.marca} ${vehiculo.modelo}${vehiculo.matricula ? ` (${vehiculo.matricula})` : ''}` : ''}.
            {' '}Ahora vence: <strong>{vehiculo?.itvVencimiento ? formatDate(vehiculo.itvVencimiento) : 'sin fecha en la ficha'}</strong>.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Si ya la ha pasado, anota el nuevo vencimiento en la ficha del coche: así se le avisará solo cuando le toque la próxima.
          </p>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Pasó la ITV el</span>
            <input type="date" value={pasadaEl} max={hoy} onChange={(e) => cambiarPasadaEl(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">Nueva fecha de vencimiento de la ITV</span>
            <input type="date" value={vencimiento} onChange={(e) => { setVencimiento(e.target.value); setTocada(true); setError(''); }} className={inputCls} />
            <span className="block text-[11px] text-slate-400 mt-1">
              Propuesta para un turismo particular según su edad; si se pasa en los 30 días antes del vencimiento, cuenta desde ese vencimiento.
              Cámbiala si la tarjeta ITV dice otra cosa.
            </span>
          </label>
          {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 dlg-pie">
          <button type="button" onClick={onCerrar} disabled={guardando}
            className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition disabled:opacity-40">
            Cancelar
          </button>
          <button type="button" onClick={() => void ejecutar(onEntregarSinAnotar)} disabled={guardando}
            className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-700 hover:bg-slate-50 transition disabled:opacity-40">
            Aún no · entregar sin anotar
          </button>
          <button type="button" onClick={anotar} disabled={guardando}
            className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition shadow-sm flex items-center gap-2">
            <Check size={14} /> {guardando ? 'Guardando…' : 'Anotar y entregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
