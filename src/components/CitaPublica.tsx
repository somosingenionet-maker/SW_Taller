import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Phone } from 'lucide-react';
import { cancelarCitaPublica, getCitaPublica, type CitaPublicaDatos } from '../lib/data/reservas';
import { ErrorPortal } from '../lib/data/invocarPortal';
import ErrorPortalPantalla from './ErrorPortalPantalla';
import { textoDuracionCita } from '../utils/reservas';

const ESTADO: Record<string, { texto: string; clase: string }> = {
  confirmada: { texto: 'Confirmada', clase: 'bg-green-100 text-green-700' },
  pendiente: { texto: 'Pendiente de confirmar por el taller', clase: 'bg-amber-100 text-amber-700' },
  cancelada: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-500' },
  convertida: { texto: 'Atendida', clase: 'bg-blue-100 text-blue-700' },
};

/** Página donde el cliente ve su cita y puede cancelarla desde el enlace del correo. */
export default function CitaPublica({ token }: { token: string }) {
  const [datos, setDatos] = useState<CitaPublicaDatos | null>(null);
  const [errorCarga, setErrorCarga] = useState<ErrorPortal | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setErrorCarga(null);
    getCitaPublica(token).then(setDatos).catch((e) => setErrorCarga(e instanceof ErrorPortal ? e : new ErrorPortal('No se pudo cargar tu cita.', 'temporal')));
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  if (errorCarga) return <ErrorPortalPantalla tipo={errorCarga.tipo} mensaje={errorCarga.message} onReintentar={cargar} />;
  if (!datos) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full" /></div>;

  const color = datos.empresa.brandColor && /^#[0-9a-fA-F]{6}$/.test(datos.empresa.brandColor) ? datos.empresa.brandColor : '#2563eb';
  const e = ESTADO[datos.cita.estado] ?? ESTADO.pendiente;

  const cancelar = async () => {
    setCancelando(true); setError('');
    try { await cancelarCitaPublica(token); setConfirmando(false); cargar(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.'); }
    finally { setCancelando(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      <div className="px-5 pt-7 pb-9 rounded-b-[28px] text-white" style={{ backgroundColor: color }}>
        <div className="max-w-xl mx-auto flex items-center gap-3">
          {datos.empresa.logoUrl && <img src={datos.empresa.logoUrl} alt="" className="w-11 h-11 rounded-xl object-contain bg-white/20" />}
          <div><h1 className="text-xl font-black leading-tight">{datos.empresa.nombre}</h1><p className="text-xs text-white/80">Tu cita</p></div>
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 -mt-5 space-y-4" data-testid="cita-publica">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            {datos.cita.estado === 'cancelada' ? <CalendarX className="w-5 h-5 text-slate-400" /> : <CalendarCheck className="w-5 h-5" style={{ color }} />}
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${e.clase}`} data-testid="estado-cita">{e.texto}</span>
          </div>
          <p className="text-base font-extrabold text-slate-800 first-letter:uppercase">{datos.cita.cuando}</p>
          <dl className="text-sm text-slate-600 space-y-1">
            {datos.cita.tipo && <div className="flex gap-2"><dt className="text-slate-400 w-20">Servicio</dt><dd>{datos.cita.tipo} · {textoDuracionCita(datos.cita.duracionMin)}</dd></div>}
            {datos.cita.vehiculo && <div className="flex gap-2"><dt className="text-slate-400 w-20">Vehículo</dt><dd>{datos.cita.vehiculo}</dd></div>}
            {datos.cita.motivo && <div className="flex gap-2"><dt className="text-slate-400 w-20">Motivo</dt><dd>{datos.cita.motivo}</dd></div>}
          </dl>

          {datos.cita.cancelable && !confirmando && (
            <button type="button" onClick={() => setConfirmando(true)} data-testid="cancelar-cita" className="text-xs font-bold text-rose-600 underline cursor-pointer">Cancelar esta cita</button>
          )}
          {confirmando && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 space-y-2" role="alertdialog" aria-label="Confirmar cancelación">
              <p className="text-xs text-rose-800 font-semibold">¿Seguro que quieres cancelar la cita? El hueco quedará libre para otra persona.</p>
              <div className="flex gap-2">
                <button type="button" disabled={cancelando} onClick={() => void cancelar()} data-testid="confirmar-cancelacion" className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">{cancelando ? 'Cancelando…' : 'Sí, cancelar'}</button>
                <button type="button" onClick={() => setConfirmando(false)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-bold cursor-pointer">No, mantenerla</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
          {!datos.cita.cancelable && datos.cita.estado !== 'cancelada' && datos.cita.estado !== 'convertida' && (
            <p className="text-xs text-slate-400">Esta cita ya no se puede cancelar desde aquí.{datos.empresa.telefono ? ` Llama al ${datos.empresa.telefono}.` : ''}</p>
          )}
        </div>
        {datos.empresa.telefono && <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5"><Phone className="w-3 h-3" /> {datos.empresa.telefono}</p>}
      </div>
    </div>
  );
}
