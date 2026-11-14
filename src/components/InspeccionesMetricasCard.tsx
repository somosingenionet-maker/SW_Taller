import { useEffect, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import {
  getMasRechazadas, getMetricasInspecciones, getMetricasMecanicos, porcentaje,
  type MetricasInspecciones, type MetricasMecanico, type PuntoRechazado,
} from '../lib/data/inspeccionesMetricas';
import { fmt2 } from '../utils/moneda';

/** Cómo vende la inspección en el periodo elegido: informes, respuestas, importe propuesto y aprobado. */
export default function InspeccionesMetricasCard({ desde, hasta }: { desde: Date; hasta: Date }) {
  const [m, setM] = useState<MetricasInspecciones | null>(null);
  const [mecanicos, setMecanicos] = useState<MetricasMecanico[]>([]);
  const [rechazadas, setRechazadas] = useState<PuntoRechazado[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    setError(false);
    Promise.all([getMetricasInspecciones(desde, hasta), getMetricasMecanicos(desde, hasta), getMasRechazadas(desde, hasta)])
      .then(([a, b, c]) => { if (vivo) { setM(a); setMecanicos(b); setRechazadas(c); } })
      .catch(() => { if (vivo) { setError(true); setM(null); } });
    return () => { vivo = false; };
  }, [desde, hasta]);

  const respuesta = m ? porcentaje(m.respondidas, m.enviadas) : null;
  const aprobacion = m ? porcentaje(m.aprobado, m.propuesto) : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4" data-testid="metricas-inspecciones">
      <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-blue-500" /> Inspecciones</h3>
      {error && <p className="text-xs text-slate-400 italic">No se pudieron cargar las métricas de inspecciones.</p>}
      {m && m.enviadas === 0 && <p className="text-xs text-slate-400 italic text-center py-4">Sin informes enviados en este periodo.</p>}
      {m && m.enviadas > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">Informes enviados</p><p className="text-xl font-bold text-slate-800" data-testid="m-enviadas">{m.enviadas}</p></div>
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">Respondidos</p><p className="text-xl font-bold text-slate-800" data-testid="m-respondidas">{m.respondidas}{respuesta !== null ? ` · ${respuesta} %` : ''}</p></div>
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">Propuesto</p><p className="text-xl font-bold text-slate-800" data-testid="m-propuesto">{fmt2(m.propuesto)} €</p></div>
            <div className="bg-slate-50 rounded-xl p-3"><p className="text-[11px] text-slate-500">Aprobado</p><p className="text-xl font-bold text-slate-800" data-testid="m-aprobado">{fmt2(m.aprobado)} €{aprobacion !== null ? ` · ${aprobacion} %` : ''}</p></div>
          </div>
          <p className="text-[11px] text-slate-400">Sin IVA. Informes enviados en el periodo; lo propuesto son las reparaciones con precio de los puntos urgentes y en atención.</p>

          {mecanicos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Por mecánico</p>
              <ul className="divide-y divide-slate-100">
                {mecanicos.map((x) => (
                  <li key={x.mecanico} className="py-1.5 flex justify-between gap-3 text-xs">
                    <span className="text-slate-700 truncate">{x.mecanico}</span>
                    <span className="text-slate-500 shrink-0">{x.informes} informe{x.informes === 1 ? '' : 's'} · propuesto {fmt2(x.propuesto)} € · aprobado {fmt2(x.aprobado)} €</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rechazadas.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Lo que más se rechaza</p>
              <ul className="divide-y divide-slate-100">
                {rechazadas.map((x) => (
                  <li key={x.punto} className="py-1.5 flex justify-between text-xs"><span className="text-slate-700">{x.punto}</span><span className="text-slate-500">{x.rechazados} de {x.total}</span></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
