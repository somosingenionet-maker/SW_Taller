import { useState } from 'react';
import { Droplet, Pencil } from 'lucide-react';
import type { Vehiculo } from '../types';
import type { AceiteVehiculo } from '../lib/data/vehiculos';
import { mensajeDeError } from '../lib/errores';
import { diasHasta, urgenciaAceite } from '../utils/aceite';
import { formatDate } from '../utils/dateFormat';
import { formatKm } from '../utils/moneda';

interface Props {
  vehiculo: Vehiculo;
  onGuardar: (vehiculoId: string, datos: AceiteVehiculo) => Promise<void>;
}

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CAMPO = 'w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-400';

/**
 * Cambio de aceite en la ficha del vehículo: último cambio y próximo. Normalmente lo rellenan las
 * órdenes de «cambio de aceite» (el mecánico o el taller al anotar el próximo); aquí se puede
 * corregir a mano, con su propio guardado para no pisar lo que anote el mecánico.
 */
export default function AceiteVehiculoCard({ vehiculo, onGuardar }: Props) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ ultimaFecha: '', ultimoKm: '', proximaFecha: '', proximoKm: '' });
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const hoy = hoyLocal();
  const urgencia = urgenciaAceite(vehiculo.aceiteProximaFecha, hoy, vehiculo.aceiteProximoKm, vehiculo.kilometraje);
  const dias = vehiculo.aceiteProximaFecha ? diasHasta(vehiculo.aceiteProximaFecha, hoy) : null;
  const sinNada = !vehiculo.aceiteUltimaFecha && !vehiculo.aceiteProximaFecha && vehiculo.aceiteProximoKm == null;

  const abrir = () => {
    setForm({
      ultimaFecha: vehiculo.aceiteUltimaFecha ?? '',
      ultimoKm: vehiculo.aceiteUltimoKm != null ? String(vehiculo.aceiteUltimoKm) : '',
      proximaFecha: vehiculo.aceiteProximaFecha ?? '',
      proximoKm: vehiculo.aceiteProximoKm != null ? String(vehiculo.aceiteProximoKm) : '',
    });
    setError('');
    setEditando(true);
  };

  const km = (texto: string): number | undefined | 'mal' => {
    if (texto.trim() === '') return undefined;
    const n = Number(texto);
    return Number.isInteger(n) && n >= 0 ? n : 'mal';
  };

  const guardar = async () => {
    const ultimoKm = km(form.ultimoKm), proximoKm = km(form.proximoKm);
    if (ultimoKm === 'mal' || proximoKm === 'mal') { setError('Los kilómetros deben ser un número entero.'); return; }
    if (form.ultimaFecha && form.ultimaFecha > hoy) { setError('El último cambio no puede ser una fecha futura.'); return; }
    if (form.ultimaFecha && form.proximaFecha && form.proximaFecha <= form.ultimaFecha) { setError('El próximo cambio debe ser posterior al último.'); return; }
    if (ultimoKm != null && proximoKm != null && proximoKm <= ultimoKm) { setError('Los kilómetros del próximo cambio deben ser mayores que los del último.'); return; }
    setGuardando(true);
    try {
      await onGuardar(vehiculo.id, {
        aceiteUltimaFecha: form.ultimaFecha || undefined, aceiteUltimoKm: ultimoKm,
        aceiteProximaFecha: form.proximaFecha || undefined, aceiteProximoKm: proximoKm,
      });
      setEditando(false);
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el cambio de aceite.'));
    } finally {
      setGuardando(false);
    }
  };

  const estilo = urgencia === 'vencido' ? 'bg-rose-50 border-rose-200' : urgencia === 'proximo' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-100';

  return (
    <div className={`col-span-2 p-3 rounded-2xl border ${estilo}`} data-testid="aceite-vehiculo">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
          <Droplet className="w-3 h-3 text-blue-500" /> Cambio de aceite
        </div>
        {!editando && (
          <button type="button" onClick={abrir} className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer">
            <Pencil className="w-3 h-3" /> {sinNada ? 'Anotar' : 'Corregir'}
          </button>
        )}
      </div>

      {!editando ? (
        sinNada ? (
          <p className="text-xs text-slate-400 mt-1">Sin datos. Se rellena solo con las órdenes marcadas como «cambio de aceite».</p>
        ) : (
          <div className="mt-1 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-slate-400">Último cambio</p>
              <p className="text-xs font-semibold text-slate-700">
                {vehiculo.aceiteUltimaFecha ? formatDate(vehiculo.aceiteUltimaFecha) : '—'}
                {vehiculo.aceiteUltimoKm != null && <span className="font-normal text-slate-500"> · {formatKm(vehiculo.aceiteUltimoKm)} km</span>}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400">Próximo cambio</p>
              <p className="text-xs font-semibold text-slate-700">
                {vehiculo.aceiteProximaFecha ? formatDate(vehiculo.aceiteProximaFecha) : 'Sin fecha'}
                {vehiculo.aceiteProximoKm != null && <span className="font-normal text-slate-500"> · o a los {formatKm(vehiculo.aceiteProximoKm)} km</span>}
              </p>
              {urgencia === 'vencido' && (
                <p className="text-[11px] font-bold text-rose-600">
                  {dias != null && dias < 0 ? `Vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}` : 'Ya ha superado los kilómetros'}
                </p>
              )}
              {urgencia === 'proximo' && dias != null && (
                <p className="text-[11px] font-bold text-amber-700">{dias === 0 ? 'Le toca hoy' : `Le toca en ${dias} ${dias === 1 ? 'día' : 'días'}`}</p>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="aceite-ultima-fecha" className="block text-[10px] font-semibold text-slate-500 mb-1">Último cambio</label>
              <input id="aceite-ultima-fecha" type="date" max={hoy} value={form.ultimaFecha} onChange={(e) => setForm({ ...form, ultimaFecha: e.target.value })} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="aceite-ultimo-km" className="block text-[10px] font-semibold text-slate-500 mb-1">Km a los que se hizo</label>
              <input id="aceite-ultimo-km" type="number" min="0" step="1" inputMode="numeric" value={form.ultimoKm} onChange={(e) => setForm({ ...form, ultimoKm: e.target.value })} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="aceite-proxima-fecha" className="block text-[10px] font-semibold text-slate-500 mb-1">Próximo cambio</label>
              <input id="aceite-proxima-fecha" type="date" value={form.proximaFecha} onChange={(e) => setForm({ ...form, proximaFecha: e.target.value })} className={CAMPO} />
            </div>
            <div>
              <label htmlFor="aceite-proximo-km" className="block text-[10px] font-semibold text-slate-500 mb-1">O a los km</label>
              <input id="aceite-proximo-km" type="number" min="0" step="1" inputMode="numeric" value={form.proximoKm} onChange={(e) => setForm({ ...form, proximoKm: e.target.value })} className={CAMPO} />
            </div>
          </div>
          {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-xl">{error}</div>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditando(false)} className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button type="button" onClick={() => void guardar()} disabled={guardando}
              className="flex-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
