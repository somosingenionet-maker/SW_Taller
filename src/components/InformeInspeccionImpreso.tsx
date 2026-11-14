import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { Empresa, OrdenTrabajo } from '../types';
import type { Inspeccion, InspeccionPunto } from '../lib/data/inspecciones';
import { ETIQUETA_ESTADO_INSPECCION, resumenPuntos, totalPuntos } from '../utils/inspeccion';
import { fechaHoraFirma } from '../utils/firma';
import { fmt2, formatKm } from '../utils/moneda';

interface Props {
  insp: Inspeccion;
  ot: OrdenTrabajo;
  empresa: Pick<Empresa, 'nombre' | 'logoBase64' | 'ciudad' | 'correo' | 'telefono' | 'web'>;
  clienteNombre: string;
  vehiculoDescripcion: string;
  km: number | null;
  urls: Record<string, string>;
  onCerrar: () => void;
}

function Problema({ p, urls, tono }: { p: InspeccionPunto; urls: Record<string, string>; tono: 'urgente' | 'atencion' }) {
  const borde = tono === 'urgente' ? 'border-rose-300' : 'border-amber-300';
  return (
    <div className={`break-inside-avoid border-l-4 ${borde} pl-3 py-1`}>
      <div className="flex justify-between gap-4">
        <p className="text-sm font-bold text-slate-800">{p.nombre} <span className="font-normal text-slate-400 text-xs">· {p.categoria}</span></p>
        {p.precio != null && p.precio > 0 && <p className="text-sm font-black text-slate-800 whitespace-nowrap">{fmt2(p.precio)} € + IVA</p>}
      </div>
      {p.nota && <p className="text-xs text-slate-600 mt-0.5">{p.nota}</p>}
      {p.reparacion && <p className="text-xs text-slate-500 mt-0.5">Reparación propuesta: {p.reparacion}</p>}
      {p.decision && <p className="text-[11px] font-semibold mt-0.5 text-slate-500">{p.decision === 'aprobado' ? '✓ Aprobado por el cliente' : 'Rechazado por el cliente'}</p>}
      {p.fotos.some((f) => urls[f]) && (
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {p.fotos.filter((f) => urls[f]).map((f) => <img key={f} src={urls[f]} alt={`Foto de ${p.nombre}`} className="h-28 w-auto rounded-md border border-slate-200 object-cover" />)}
        </div>
      )}
    </div>
  );
}

/**
 * Informe de inspección listo para imprimir o guardar como PDF (para dárselo al cliente en el mostrador).
 * Se pinta fuera de la aplicación (portal) y, al imprimir, se oculta todo lo demás.
 */
export default function InformeInspeccionImpreso({ insp, ot, empresa, clienteNombre, vehiculoDescripcion, km, urls, onCerrar }: Props) {
  const r = resumenPuntos(insp.puntos);
  const urgentes = insp.puntos.filter((p) => p.estado === 'urgente');
  const atencion = insp.puntos.filter((p) => p.estado === 'atencion');
  const bien = insp.puntos.filter((p) => p.estado === 'bien');
  const conPrecio = [...urgentes, ...atencion].filter((p) => p.precio != null && p.precio > 0);
  const fecha = insp.enviadaEn ?? insp.terminadaEn;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-100 overflow-y-auto print:static print:bg-white print:overflow-visible" data-testid="informe-impreso">
      {/* Mientras está abierto, al imprimir solo sale el informe: se oculta la aplicación. */}
      <style>{'@media print { #root { display: none !important; } body { background: #fff !important; } }'}</style>
      <div className="flex items-center justify-between px-6 py-3 bg-slate-800 text-white print:hidden sticky top-0 z-10">
        <span className="font-semibold text-sm">Informe de inspección — {ot.numero}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-xl text-xs font-semibold cursor-pointer"><Printer size={13} /> Imprimir / Guardar PDF</button>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1.5 rounded-xl hover:bg-slate-700 cursor-pointer"><X size={15} /></button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto my-8 bg-white shadow-xl rounded-2xl print:shadow-none print:rounded-none print:my-0 print:max-w-none">
        <div className="p-10 space-y-5 text-slate-800 font-sans">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
            <div className="flex items-center gap-4">
              {empresa.logoBase64 && <img src={empresa.logoBase64} alt="Logo" className="h-14 object-contain" />}
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">{empresa.nombre}</h1>
                {[empresa.ciudad, empresa.correo, empresa.telefono, empresa.web].filter(Boolean).map((t) => <p key={t} className="text-xs text-slate-500">{t}</p>)}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Informe de inspección</p>
              <p className="text-2xl font-black font-mono text-blue-600">{ot.numero}</p>
              {fecha && <p className="text-xs text-slate-500 mt-1">Fecha: {fechaHoraFirma(fecha).split(' · ')[0]}</p>}
              <p className="text-[10px] text-slate-400">{ETIQUETA_ESTADO_INSPECCION[insp.estado]}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 text-sm">
            <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cliente</p><p className="font-semibold">{clienteNombre || '—'}</p></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Vehículo</p>
              <p className="font-semibold">{vehiculoDescripcion}</p>
              {km ? <p className="text-xs text-slate-500">{formatKm(km)} km</p> : null}
              {insp.realizadaPor && <p className="text-xs text-slate-500">Revisado por {insp.realizadaPor}</p>}
            </div>
          </div>

          <div className="flex gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700">{r.urgente} urgente{r.urgente === 1 ? '' : 's'}</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{r.atencion} en atención</span>
            <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-700">{r.bien} bien</span>
          </div>

          {insp.notaGeneral && <p className="text-sm text-slate-600">{insp.notaGeneral}</p>}

          {urgentes.length > 0 && <div className="space-y-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-600">Urgente</p>{urgentes.map((p) => <Problema key={p.id} p={p} urls={urls} tono="urgente" />)}</div>}
          {atencion.length > 0 && <div className="space-y-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-600">Requiere atención</p>{atencion.map((p) => <Problema key={p.id} p={p} urls={urls} tono="atencion" />)}</div>}
          {urgentes.length + atencion.length === 0 && <p className="text-sm font-semibold text-teal-700">Todo lo revisado está en buen estado.</p>}

          {bien.length > 0 && (
            <div className="break-inside-avoid">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-teal-600 mb-1">Revisado y en buen estado</p>
              <p className="text-xs text-slate-500">{bien.map((p) => p.nombre).join(' · ')}</p>
            </div>
          )}

          {conPrecio.length > 0 && (
            <div className="flex justify-between border-t-2 border-slate-900 pt-3 text-sm font-black break-inside-avoid">
              <span>Reparaciones propuestas ({conPrecio.length})</span><span>{fmt2(totalPuntos(conPrecio))} € + IVA</span>
            </div>
          )}

          {insp.aceptacion && (
            <div className="break-inside-avoid border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
              <p className="font-bold text-slate-700">Aceptación del cliente</p>
              <p>{insp.aceptacion.texto}</p>
              <p className="mt-1 text-slate-500">{insp.aceptacion.nombre} · {fechaHoraFirma(insp.aceptacion.en)} · importe aceptado {fmt2(insp.aceptacion.total)} € + IVA</p>
            </div>
          )}
          {insp.fotosBorradasEn && <p className="text-[11px] text-slate-400">Las fotos de este informe ya se eliminaron por el plazo de conservación.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
