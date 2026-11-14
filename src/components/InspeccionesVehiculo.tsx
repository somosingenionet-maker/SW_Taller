import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { listInspeccionesDeVehiculo, type InspeccionResumen } from '../lib/data/inspecciones';
import { ETIQUETA_ESTADO_INSPECCION } from '../utils/inspeccion';
import { formatDate } from '../utils/dateFormat';

/** Historial de inspecciones digitales del vehículo en su ficha (solo si tiene alguna). */
export default function InspeccionesVehiculo({ vehiculoId }: { vehiculoId: string }) {
  const [lista, setLista] = useState<InspeccionResumen[]>([]);

  useEffect(() => {
    let vivo = true;
    listInspeccionesDeVehiculo(vehiculoId).then((l) => { if (vivo) setLista(l); }).catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [vehiculoId]);

  if (lista.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2" data-testid="inspecciones-vehiculo">
      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><ClipboardCheck className="w-3 h-3" /> Inspecciones ({lista.length})</p>
      <ul className="divide-y divide-slate-100">
        {lista.map((i) => (
          <li key={i.id} className="py-2 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-700 font-semibold">{formatDate((i.enviadaEn ?? i.terminadaEn ?? i.createdAt).slice(0, 10))}</span>
            <span className="flex items-center gap-1.5 flex-wrap justify-end">
              {i.urgentes > 0 && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-semibold">{i.urgentes} urg.</span>}
              {i.atencion > 0 && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{i.atencion} atenc.</span>}
              <span className="text-slate-400">{ETIQUETA_ESTADO_INSPECCION[i.estado]}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
