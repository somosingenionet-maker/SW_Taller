import { useState } from 'react';
import { Eraser, PenTool, X } from 'lucide-react';
import type { OrdenTrabajo } from '../types';
import { firmarOrden, type TipoFirma } from '../lib/data/firmas';
import { mensajeDeError } from '../lib/errores';
import { firmaSuficiente, type Punto } from '../utils/firma';
import { fmt2 } from '../utils/moneda';
import FirmaLienzo, { exportarPng } from './FirmaLienzo';

interface Props {
  tipo: TipoFirma;
  ot: OrdenTrabajo;
  /** Nombre del cliente: se propone como nombre de quien firma (puede ser otra persona). */
  clienteNombre: string;
  vehiculoDescripcion: string;
  onCancelar: () => void;
  /** La firma ya está guardada en el servidor. */
  onFirmada: () => void;
}

/** Texto que el cliente lee y acepta al firmar. Lo que firma es exactamente esto. */
export function textoFirma(tipo: TipoFirma, numero: string, vehiculo: string, total: number): string {
  return tipo === 'presupuesto'
    ? `Acepto el presupuesto ${numero} para ${vehiculo} por un importe de ${fmt2(total)} € (IVA incluido) y autorizo la realización de los trabajos descritos.`
    : `Recibo el vehículo ${vehiculo} y doy mi conformidad con los trabajos de la orden ${numero}.`;
}

/** Pantalla en la que el cliente lee el texto y firma con el dedo (tablet o móvil del mostrador). */
export default function FirmaOrdenModal({ tipo, ot, clienteNombre, vehiculoDescripcion, onCancelar, onFirmada }: Props) {
  const [nombre, setNombre] = useState(clienteNombre);
  const [aceptado, setAceptado] = useState(false);
  const [trazos, setTrazos] = useState<Punto[][]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const titulo = tipo === 'presupuesto' ? 'Firma del presupuesto' : 'Firma de la entrega';
  const texto = textoFirma(tipo, ot.numero, vehiculoDescripcion, ot.total);
  const hayFirma = firmaSuficiente(trazos);
  const puedeConfirmar = aceptado && nombre.trim().length >= 2 && hayFirma && !guardando;

  const confirmar = async () => {
    if (!puedeConfirmar) return;
    setGuardando(true);
    setError('');
    try {
      await firmarOrden(ot.id, tipo, exportarPng(trazos), nombre);
      onFirmada();
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar la firma.'));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="absolute inset-0 bg-black/60" onClick={guardando ? undefined : onCancelar} />
      <div className="relative bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-slate-800 flex items-center gap-2"><PenTool className="w-4 h-4 text-blue-600" /> {titulo}</p>
            <p className="text-xs text-slate-400">{ot.numero} · {vehiculoDescripcion}</p>
          </div>
          <button type="button" onClick={onCancelar} disabled={guardando} aria-label="Cerrar" className="p-2 -m-2 text-slate-400 cursor-pointer disabled:opacity-40"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 leading-relaxed" data-testid="texto-firma">{texto}</div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input type="checkbox" className="w-5 h-5 mt-0.5 accent-blue-600" checked={aceptado} onChange={(e) => { setAceptado(e.target.checked); setError(''); }} />
          <span className="text-sm text-slate-700 font-medium">He leído el texto y estoy de acuerdo.</span>
        </label>

        <div>
          <label htmlFor="firma-nombre" className="block text-xs font-semibold text-slate-600 mb-1">Nombre de quien firma</label>
          <input id="firma-nombre" type="text" autoComplete="off" maxLength={120} value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">Firma aquí</p>
            <button type="button" onClick={() => { setTrazos([]); setError(''); }} disabled={trazos.length === 0 || guardando}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-40 cursor-pointer">
              <Eraser className="w-3.5 h-3.5" /> Borrar y repetir
            </button>
          </div>
          <FirmaLienzo trazos={trazos} onTrazos={(t) => { setTrazos(t); setError(''); }} etiqueta="Firma con el dedo o el ratón" />
        </div>

        <p className="text-[11px] text-slate-400 leading-snug">
          Firma electrónica simple: queda guardada con tu nombre, la fecha y la hora, y ya no se puede modificar.
        </p>

        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2.5 rounded-xl">{error}</div>}

        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} disabled={guardando} className="px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 text-sm font-bold cursor-pointer disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => void confirmar()} disabled={!puedeConfirmar}
            className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 cursor-pointer">
            {guardando ? 'Guardando…' : 'Confirmar firma'}
          </button>
        </div>
      </div>
    </div>
  );
}
