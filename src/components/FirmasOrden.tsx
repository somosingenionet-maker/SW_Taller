import { useEffect, useState } from 'react';
import { AlertTriangle, Check, PenTool } from 'lucide-react';
import type { OrdenTrabajo } from '../types';
import { getAceptacion, getFirmas, tipoDispositivo, type AceptacionDetalle, type FirmasOrden as Firmas } from '../lib/data/firmas';
import { aprobadoEnInspeccionConIva, fechaHoraFirma, importeCambiadoTrasFirma } from '../utils/firma';
import { fmt2 } from '../utils/moneda';

interface Props {
  ot: OrdenTrabajo;
  onFirmar: (tipo: 'presupuesto' | 'entrega') => void;
}

/** Bloque «Firmas» de la ficha de la orden: ver lo firmado o pedir la firma al cliente en pantalla. */
export default function FirmasOrden({ ot, onFirmar }: Props) {
  const [firmas, setFirmas] = useState<Firmas>({});
  const [error, setError] = useState(false);
  const [aceptacion, setAceptacion] = useState<AceptacionDetalle | null>(null);

  // El dibujo no viaja con la orden: se pide solo si hay algo firmado, y se repite si cambia la firma.
  const hayFirma = !!ot.firmaPresupuesto || !!ot.firmaEntrega;
  const clave = `${ot.id}|${ot.firmaPresupuesto?.en ?? ''}|${ot.firmaEntrega?.en ?? ''}`;
  useEffect(() => {
    if (!hayFirma) { setFirmas({}); setError(false); return; }
    let vivo = true;
    getFirmas(ot.id).then((f) => { if (vivo) { setFirmas(f); setError(false); } }).catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  // La prueba de la aceptación desde el portal (IP, dispositivo) se pide solo si existe.
  const hayAceptacion = !!ot.aceptacionPresupuesto;
  useEffect(() => {
    if (!hayAceptacion) { setAceptacion(null); return; }
    let vivo = true;
    getAceptacion(ot.id).then((a) => { if (vivo) setAceptacion(a); }).catch(() => { if (vivo) setAceptacion(null); });
    return () => { vivo = false; };
  }, [ot.id, ot.aceptacionPresupuesto?.en, hayAceptacion]);

  if (ot.estado === 'cancelado' && !hayFirma && !hayAceptacion) return null;

  const fp = ot.firmaPresupuesto;
  const fe = ot.firmaEntrega;
  const importeCambiado = importeCambiadoTrasFirma(fp?.total, ot.total);
  const ap = ot.aceptacionPresupuesto;
  const extraInspeccion = aprobadoEnInspeccionConIva(ot.lineas, ot.ivaPct);
  const importeCambiadoAceptacion = !!ap && importeCambiadoTrasFirma(ap.total + extraInspeccion, ot.total);
  // Si el cliente ya aceptó desde su móvil, no hace falta pedirle además la firma dibujada.
  const puedeFirmarPresupuesto = !fp && !ap && ot.estado !== 'cancelado' && ot.total > 0;
  const puedeFirmarEntrega = !fe && (ot.estado === 'listo' || ot.estado === 'entregado');

  const fila = (titulo: string, firmada: { nombre: string; en: string } | undefined, png: string | undefined, extra?: React.ReactNode) => (
    <div className="flex items-start gap-3">
      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${firmada ? 'bg-teal-500 border-teal-500 text-white' : 'border-slate-300'}`} aria-hidden="true">
        {firmada && <Check className="w-3 h-3" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-700">{titulo}</p>
        {firmada ? (
          <>
            <p className="text-xs text-slate-500">Firmado por <span className="font-semibold text-slate-700">{firmada.nombre}</span> · {fechaHoraFirma(firmada.en)}</p>
            {png ? <img src={png} alt={`Firma de ${firmada.nombre}`} className="mt-1.5 h-14 w-auto max-w-full border border-slate-200 rounded-lg bg-white p-1" /> : error ? <p className="text-[11px] text-slate-400 mt-1">No se pudo cargar el dibujo de la firma.</p> : <div className="mt-1.5 h-14 w-40 rounded-lg bg-slate-100 animate-pulse" />}
          </>
        ) : null}
        {extra}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="firmas-orden">
      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><PenTool size={11} /> Firmas del cliente</p>

      {ap && (
        <div className="flex items-start gap-3" data-testid="aceptacion-portal">
          <span className="w-5 h-5 rounded-full border-2 bg-teal-500 border-teal-500 text-white flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true"><Check className="w-3 h-3" /></span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-700">Presupuesto aceptado desde el portal</p>
            <p className="text-xs text-slate-500">Por <span className="font-semibold text-slate-700">{ap.nombre}</span> · {fechaHoraFirma(ap.en)}</p>
            <p className="text-[11px] text-slate-400">
              Importe aceptado: {fmt2(ap.total)} €{extraInspeccion > 0 ? ` + ${fmt2(extraInspeccion)} € en la inspección` : ''}
              {aceptacion ? ` · ${tipoDispositivo(aceptacion.dispositivo)}${aceptacion.ip ? ` · IP ${aceptacion.ip}` : ''}` : ''}
            </p>
            {importeCambiadoAceptacion && (
              <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" /> El importe ha cambiado desde la aceptación ({fmt2(ap.total)} € aceptados{extraInspeccion > 0 ? ` + ${fmt2(extraInspeccion)} € aprobados en la inspección` : ''}, {fmt2(ot.total)} € ahora). La aceptación no cubre la diferencia.
              </p>
            )}
          </div>
        </div>
      )}

      {fila('Presupuesto', fp, firmas.presupuesto?.png,
        <>
          {fp && <p className="text-[11px] text-slate-400">Importe firmado: {fmt2(fp.total)} €</p>}
          {importeCambiado && (
            <p role="alert" className="mt-1 flex items-start gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" /> El importe ha cambiado desde la firma ({fmt2(fp!.total)} € firmados, {fmt2(ot.total)} € ahora). La firma no cubre la diferencia.
            </p>
          )}
          {puedeFirmarPresupuesto && <p className="text-[11px] text-slate-400">Sin firmar.</p>}
          {ap && !fp && <p className="text-[11px] text-slate-400">Sin firma dibujada (no hace falta: ya aceptó desde su móvil).</p>}
          {puedeFirmarPresupuesto && (
            <button type="button" onClick={() => onFirmar('presupuesto')} className="mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Firmar presupuesto en pantalla</button>
          )}
          {!fp && !ap && !puedeFirmarPresupuesto && <p className="text-[11px] text-slate-400">{ot.total > 0 ? 'Sin firmar.' : 'Añade líneas con importe para poder firmarlo.'}</p>}
        </>)}

      {fila('Entrega del vehículo', fe, firmas.entrega?.png,
        <>
          {puedeFirmarEntrega && <p className="text-[11px] text-slate-400">Sin firmar.</p>}
          {puedeFirmarEntrega && (
            <button type="button" onClick={() => onFirmar('entrega')} className="mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">Firmar entrega en pantalla</button>
          )}
          {!fe && !puedeFirmarEntrega && <p className="text-[11px] text-slate-400">Se firma cuando el vehículo está listo.</p>}
        </>)}
    </div>
  );
}

/** Firma tal como sale en el documento impreso: dibujo, línea, nombre y fecha. */
export function FirmaImpresa({ titulo, firma, nota }: { titulo: string; firma: { png: string; nombre: string; en: string }; nota?: string }) {
  return (
    <div className="break-inside-avoid">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{titulo}</p>
      <img src={firma.png} alt={`Firma de ${firma.nombre}`} className="h-16 w-auto max-w-full" />
      <div className="border-t border-slate-300 pt-1">
        <p className="text-xs font-semibold text-slate-700">{firma.nombre}</p>
        <p className="text-[10px] text-slate-400">{fechaHoraFirma(firma.en)}{nota ? ` · ${nota}` : ''}</p>
      </div>
    </div>
  );
}
