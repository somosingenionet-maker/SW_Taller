import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { Vehiculo } from '../types';
import { listOrdenesDeCliente, type OrdenDeCliente } from '../lib/data/ordenes';
import { ESTADO_META } from './orden/constantes';
import { formatDateShort } from '../utils/dateFormat';
import { fmt2 } from '../utils/moneda';

/** Ficha del cliente: sus órdenes de trabajo (la más reciente primero); al pulsar una se abre en el taller. */
export default function OrdenesDelCliente({ clienteId, vehiculos, onAbrir }: {
  clienteId: string;
  vehiculos: Vehiculo[];
  onAbrir?: (numero: string) => void;
}) {
  const [ordenes, setOrdenes] = useState<OrdenDeCliente[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setOrdenes(null);
    listOrdenesDeCliente(clienteId).then((o) => { if (vivo) setOrdenes(o); }).catch(() => { if (vivo) setOrdenes([]); });
    return () => { vivo = false; };
  }, [clienteId]);

  return (
    <div className="pt-4 border-t border-slate-50" data-testid="ordenes-cliente">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
        <ClipboardList className="w-4 h-4 text-blue-600" />
        Órdenes de trabajo{ordenes && ordenes.length > 0 ? ` · ${ordenes.length}` : ''}
      </h4>
      {ordenes === null ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : ordenes.length === 0 ? (
        <p className="text-xs text-slate-400">Todavía no tiene órdenes.</p>
      ) : (
        <div className="space-y-1.5">
          {ordenes.map((o) => {
            const v = vehiculos.find((x) => x.id === o.vehiculoId);
            const m = ESTADO_META[o.estado];
            return (
              <button key={o.id} type="button" onClick={() => onAbrir?.(o.numero)} disabled={!onAbrir}
                className="w-full flex items-center gap-3 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-left hover:bg-white transition disabled:cursor-default">
                <span className="font-mono font-bold text-slate-700">{o.numero}</span>
                <span className="text-slate-500 truncate">{formatDateShort(o.fechaRecepcion)}{v ? ` · ${v.marca} ${v.modelo} ${v.matricula}` : ''}</span>
                <span className={`ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.label}</span>
                <span className="shrink-0 font-semibold text-slate-700">{fmt2(o.total)} €</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
