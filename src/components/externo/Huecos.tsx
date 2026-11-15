import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { DisponibilidadReservas } from '../../lib/data/reservas';
import { cuadriculaMes, etiquetaDia, mesesConHueco, NOMBRES_DIA_CORTO, NOMBRES_MES, partirHoras } from '../../utils/reservas';
import { aclarar } from './ui';

/** Calendario con los días que tienen hueco. Lo usan la reserva nueva y el cambio de día u hora de una cita. */
export function CalendarioHuecos({ disp, cargando, fecha, color, telefono, onFecha }: {
  disp: DisponibilidadReservas | null; cargando: boolean; fecha: string | null; color: string; telefono?: string | null; onFecha: (f: string) => void;
}) {
  const meses = useMemo(() => mesesConHueco(Object.keys(disp?.dias ?? {})), [disp]);
  const [mesIdx, setMesIdx] = useState(0);
  useEffect(() => { setMesIdx(0); }, [disp]);
  const mes = meses[mesIdx];
  const celdas = mes && disp ? cuadriculaMes(mes.año, mes.mes, disp.dias) : [];
  return (
    <>
      {cargando && <p className="text-xs text-slate-400">Buscando huecos…</p>}
      {!cargando && disp && meses.length === 0 && (
        <p className="text-sm text-slate-600" data-testid="sin-huecos">No hay huecos disponibles en los próximos días.{telefono ? ` Llama al ${telefono} y buscamos uno.` : ''}</p>
      )}
      {mes && (
        <div data-testid="calendario">
          <div className="flex items-center justify-between mb-2">
            <button type="button" aria-label="Mes anterior" disabled={mesIdx === 0} onClick={() => setMesIdx((i) => i - 1)} className="p-1.5 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronLeft className="w-4 h-4" /></button>
            <p className="text-sm font-bold text-slate-800 capitalize">{NOMBRES_MES[mes.mes]} {mes.año}</p>
            <button type="button" aria-label="Mes siguiente" disabled={mesIdx >= meses.length - 1} onClick={() => setMesIdx((i) => i + 1)} className="p-1.5 rounded-lg disabled:opacity-30 cursor-pointer"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {NOMBRES_DIA_CORTO.map((d) => <span key={d} className="text-[10px] font-bold text-slate-400">{d}</span>)}
            {celdas.map((c, i) => c.fecha === null ? <span key={i} /> : (
              <button key={c.fecha} type="button" disabled={!c.disponible} aria-pressed={fecha === c.fecha} aria-label={c.disponible ? etiquetaDia(c.fecha) : undefined}
                onClick={() => onFecha(c.fecha as string)}
                className={`py-2.5 rounded-xl text-sm font-bold transition ${c.disponible ? 'cursor-pointer' : 'text-slate-300 cursor-default font-medium'} ${fecha === c.fecha ? 'text-white shadow-md' : c.disponible ? 'text-slate-800' : ''}`}
                style={fecha === c.fecha ? { backgroundColor: color } : c.disponible ? { backgroundColor: aclarar(color, 90) } : undefined}>
                {c.dia}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/** Horas libres del día elegido, separadas en mañana y tarde. */
export function HorasHuecos({ horas, hora, color, onHora }: { horas: string[]; hora: string | null; color: string; onHora: (h: string) => void }) {
  const partes = partirHoras(horas);
  return (
    <>
      {([['Mañana', partes.manana], ['Tarde', partes.tarde]] as const).filter(([, h]) => h.length > 0).map(([titulo, hs]) => (
        <div key={titulo}>
          <p className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />{titulo}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label={titulo}>
            {hs.map((h) => (
              <button key={h} type="button" aria-pressed={hora === h} onClick={() => onHora(h)}
                className={`px-4 py-2.5 rounded-2xl border text-sm font-bold cursor-pointer transition ${hora === h ? 'text-white border-transparent shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                style={hora === h ? { backgroundColor: color } : undefined}>{h}</button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
