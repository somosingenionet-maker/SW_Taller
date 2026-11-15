import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, CalendarX, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import {
  cancelarCitaPublica, getCitaPublica, getDisponibilidadCita, reprogramarCita, type CitaPublicaDatos, type DisponibilidadReservas,
} from '../lib/data/reservas';
import { ErrorPortal } from '../lib/data/invocarPortal';
import ErrorPortalPantalla from './ErrorPortalPantalla';
import { etiquetaDia, textoDuracionCita } from '../utils/reservas';
import { descargarIcs } from '../utils/calendario';
import { mensajeCitaAlTaller, waHref } from '../utils/whatsapp';
import { CalendarioHuecos, HorasHuecos } from './externo/Huecos';
import { aclarar, CabeceraTarjeta, CLASE_TARJETA, ColumnaExterna, HeroExterno, oscurecer, PaginaExterna, PieExterno, CargandoExterno } from './externo/ui';

const ESTADO: Record<string, { texto: string; clase: string }> = {
  confirmada: { texto: 'Confirmada', clase: 'bg-green-100 text-green-700' },
  pendiente: { texto: 'Pendiente de confirmar por el taller', clase: 'bg-amber-100 text-amber-700' },
  cancelada: { texto: 'Cancelada', clase: 'bg-slate-100 text-slate-500' },
  convertida: { texto: 'Atendida', clase: 'bg-blue-100 text-blue-700' },
};

const BOTON_SECUNDARIO = 'w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50 transition cursor-pointer';

/** Página donde el cliente ve su cita, la añade a su calendario, cambia el día u hora o la cancela, desde el enlace del correo. */
export default function CitaPublica({ token }: { token: string }) {
  const [datos, setDatos] = useState<CitaPublicaDatos | null>(null);
  const [errorCarga, setErrorCarga] = useState<ErrorPortal | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [error, setError] = useState('');
  // Cambio de día u hora
  const [cambiando, setCambiando] = useState(false);
  const [disp, setDisp] = useState<DisponibilidadReservas | null>(null);
  const [cargandoDisp, setCargandoDisp] = useState(false);
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => {
    setErrorCarga(null);
    getCitaPublica(token).then(setDatos).catch((e) => setErrorCarga(e instanceof ErrorPortal ? e : new ErrorPortal('No se pudo cargar tu cita.', 'temporal')));
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);

  if (errorCarga) return <ErrorPortalPantalla tipo={errorCarga.tipo} mensaje={errorCarga.message} onReintentar={cargar} />;
  if (!datos) return <CargandoExterno />;

  const color = datos.empresa.brandColor && /^#[0-9a-fA-F]{6}$/.test(datos.empresa.brandColor) ? datos.empresa.brandColor : '#2563eb';
  const e = ESTADO[datos.cita.estado] ?? ESTADO.pendiente;

  const cancelar = async () => {
    setCancelando(true); setError('');
    try { await cancelarCitaPublica(token); setConfirmando(false); setCambiando(false); setAviso(''); cargar(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cancelar.'); }
    finally { setCancelando(false); }
  };

  const abrirCambio = () => {
    setCambiando(true); setConfirmando(false); setError(''); setAviso(''); setFecha(null); setHora(null); setDisp(null); setCargandoDisp(true);
    getDisponibilidadCita(token)
      .then(setDisp)
      .catch((err) => { setDisp({ dias: {}, duracionMin: datos.cita.duracionMin }); setError(err instanceof Error ? err.message : 'No se pudo cargar la disponibilidad.'); })
      .finally(() => setCargandoDisp(false));
  };

  const guardarCambio = async () => {
    if (!fecha || !hora) return;
    setGuardando(true); setError('');
    try {
      const r = await reprogramarCita(token, fecha, hora);
      setCambiando(false);
      setAviso(r.estado === 'pendiente' ? 'Hemos cambiado tu cita. El taller la confirmará de nuevo por correo.' : 'Hemos cambiado tu cita y te hemos enviado el correo con los datos nuevos.');
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la cita.');
      // Si el hueco se ocupó o cambió, se piden otra vez los huecos para no dejar uno que ya no existe.
      setHora(null);
      getDisponibilidadCita(token).then(setDisp).catch(() => undefined);
    } finally {
      setGuardando(false);
    }
  };

  const abierta = datos.cita.estado === 'pendiente' || datos.cita.estado === 'confirmada';
  const wa = waHref(datos.empresa.telefono, mensajeCitaAlTaller(null, datos.empresa.nombre, datos.cita.cuando));

  return (
    <PaginaExterna color={color}>
      <HeroExterno color={color} logoUrl={datos.empresa.logoUrl} empresa={datos.empresa.nombre} iniciales={datos.empresa.nombre?.[0]}
        titulo="Tu cita" subtitulo={datos.empresa.ciudad ? `${datos.empresa.ciudad}` : undefined} testId="cabecera-cita" />
      <ColumnaExterna ancho="xl">
        <div className={`${CLASE_TARJETA} p-6 space-y-4`} data-testid="cita-publica">
          <CabeceraTarjeta
            color={color}
            tono={datos.cita.estado === 'cancelada' ? 'gris' : datos.cita.estado === 'pendiente' ? 'ambar' : 'marca'}
            icono={datos.cita.estado === 'cancelada' ? <CalendarX className="w-[18px] h-[18px]" /> : <CalendarCheck className="w-[18px] h-[18px]" />}
            titulo="Estado de tu cita"
            derecha={<span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${e.clase}`} data-testid="estado-cita">{e.texto}</span>} />
          <p className="rounded-2xl px-4 py-3 text-base font-extrabold first-letter:uppercase" style={{ backgroundColor: aclarar(color, 91), color: oscurecer(color, 25) }}>{datos.cita.cuando}</p>
          <dl className="text-sm text-slate-600 divide-y divide-slate-100">
            {datos.cita.tipo && <div className="flex gap-3 py-2"><dt className="text-slate-400 w-20 shrink-0">Servicio</dt><dd className="font-semibold text-slate-700">{datos.cita.tipo} · {textoDuracionCita(datos.cita.duracionMin)}</dd></div>}
            {datos.cita.vehiculo && <div className="flex gap-3 py-2"><dt className="text-slate-400 w-20 shrink-0">Vehículo</dt><dd className="font-semibold text-slate-700">{datos.cita.vehiculo}</dd></div>}
            {datos.cita.motivo && <div className="flex gap-3 py-2"><dt className="text-slate-400 w-20 shrink-0">Motivo</dt><dd>{datos.cita.motivo}</dd></div>}
          </dl>

          {aviso && <p role="status" data-testid="aviso-cambio" className="rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold px-4 py-3">{aviso}</p>}

          {datos.cita.ics && !cambiando && (
            <button type="button" onClick={() => descargarIcs(datos.cita.ics as string)} data-testid="añadir-calendario" className={BOTON_SECUNDARIO}>
              <CalendarPlus className="w-4 h-4" /> Añadir a mi calendario
            </button>
          )}
          {datos.cita.reprogramable && !cambiando && !confirmando && (
            <button type="button" onClick={abrirCambio} data-testid="cambiar-cita" className={BOTON_SECUNDARIO}>
              <RefreshCw className="w-4 h-4" /> Cambiar día u hora
            </button>
          )}

          {cambiando && (
            <div className="rounded-2xl border border-slate-200 p-4 space-y-4" data-testid="cambiar-panel">
              <p className="text-sm font-extrabold text-slate-800">Elige el nuevo día y hora</p>
              <CalendarioHuecos disp={disp} cargando={cargandoDisp} fecha={fecha} color={color} telefono={datos.empresa.telefono} onFecha={(f) => { setError(''); setFecha(f); setHora(null); }} />
              {fecha && disp && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-slate-500 first-letter:uppercase">{etiquetaDia(fecha)}</p>
                  <HorasHuecos horas={disp.dias[fecha] ?? []} hora={hora} color={color} onHora={(h) => { setError(''); setHora(h); }} />
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" disabled={!fecha || !hora || guardando} onClick={() => void guardarCambio()} data-testid="guardar-cambio"
                  className="flex-1 py-3 rounded-2xl text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:shadow-none cursor-pointer transition" style={{ backgroundColor: color }}>
                  {guardando ? 'Cambiando…' : fecha && hora ? `Cambiar a ${etiquetaDia(fecha)} a las ${hora}` : 'Elige día y hora'}
                </button>
                <button type="button" onClick={() => { setCambiando(false); setError(''); }} className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer">Volver</button>
              </div>
            </div>
          )}

          {datos.cita.cancelable && !confirmando && !cambiando && (
            <button type="button" onClick={() => setConfirmando(true)} data-testid="cancelar-cita" className="w-full py-3 rounded-2xl border border-rose-200 text-rose-600 text-sm font-bold hover:bg-rose-50 transition cursor-pointer">Cancelar esta cita</button>
          )}
          {confirmando && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-3" role="alertdialog" aria-label="Confirmar cancelación">
              <p className="text-sm text-rose-800 font-semibold">¿Seguro que quieres cancelar la cita? El hueco quedará libre para otra persona.</p>
              <div className="flex gap-2">
                <button type="button" disabled={cancelando} onClick={() => void cancelar()} data-testid="confirmar-cancelacion" className="flex-1 px-3 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-60 cursor-pointer">{cancelando ? 'Cancelando…' : 'Sí, cancelar'}</button>
                <button type="button" onClick={() => setConfirmando(false)} className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer">No, mantenerla</button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
          {!datos.cita.cancelable && abierta && (
            <p className="text-xs text-slate-400">Esta cita ya no se puede cancelar desde aquí.{datos.empresa.telefono ? ` Llama al ${datos.empresa.telefono}.` : ''}</p>
          )}
          {abierta && datos.cita.cancelable && datos.cita.reprogramable === false && !cambiando && (
            <p className="text-xs text-slate-400">Ya has cambiado esta cita el máximo de veces.{datos.empresa.telefono ? ` Si necesitas otro cambio, llama al ${datos.empresa.telefono}.` : ''}</p>
          )}
        </div>
        {(datos.empresa.telefono || wa) && (
          <div className="flex items-center justify-center gap-5 text-sm font-semibold text-slate-500">
            {datos.empresa.telefono && <a href={`tel:${datos.empresa.telefono.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 hover:text-slate-700"><Phone className="w-4 h-4" /> {datos.empresa.telefono}</a>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-taller" className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700"><MessageCircle className="w-4 h-4" /> WhatsApp</a>}
          </div>
        )}
        <PieExterno />
      </ColumnaExterna>
    </PaginaExterna>
  );
}
