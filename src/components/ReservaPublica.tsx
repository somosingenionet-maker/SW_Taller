import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarPlus, Check, MessageCircle, Phone } from 'lucide-react';
import {
  getDisponibilidad, getInfoReservas, reservarCita, type DisponibilidadReservas, type InfoReservas, type ResultadoReserva, type TipoReserva,
} from '../lib/data/reservas';
import { ErrorPortal } from '../lib/data/invocarPortal';
import ErrorPortalPantalla from './ErrorPortalPantalla';
import Turnstile, { CLAVE_TURNSTILE } from './Turnstile';
import { aclarar, CLASE_TARJETA, ColumnaExterna, HeroExterno, PaginaExterna, PieExterno, CargandoExterno } from './externo/ui';
import { etiquetaDia, textoDuracionCita } from '../utils/reservas';
import { descargarIcs } from '../utils/calendario';
import { mensajeCitaAlTaller, waHref } from '../utils/whatsapp';
import { CalendarioHuecos, HorasHuecos } from './externo/Huecos';

const campo = 'w-full px-3.5 py-3 border border-slate-200 rounded-2xl text-sm bg-slate-50/60 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--marca)] focus:border-transparent transition';


/** Bloque numerado de la página. Fuera del componente principal: si se definiera dentro, se volvería a crear en cada
 *  pulsación de tecla y los campos de texto perderían el foco. */
function Seccion({ n, titulo, color, children }: { n: number; titulo: string; color: string; children: React.ReactNode }) {
  return (
    <section className={`${CLASE_TARJETA} p-5 space-y-4`}>
      <p className="flex items-center gap-2.5 text-[15px] font-extrabold text-slate-800">
        <span className="inline-flex w-7 h-7 rounded-full items-center justify-center text-white text-xs font-black shadow-sm" style={{ backgroundColor: color }}>{n}</span>{titulo}
      </p>
      {children}
    </section>
  );
}

/** Página pública de reserva de cita de un taller: servicio, día, hora y datos. Sin cuenta ni contraseña. */
export default function ReservaPublica({ slug }: { slug: string }) {
  const [info, setInfo] = useState<InfoReservas | null>(null);
  const [errorCarga, setErrorCarga] = useState<ErrorPortal | null>(null);
  const [tipo, setTipo] = useState<TipoReserva | null>(null);
  const [disp, setDisp] = useState<DisponibilidadReservas | null>(null);
  const [cargandoDisp, setCargandoDisp] = useState(false);
  const [fecha, setFecha] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [vehiculo, setVehiculo] = useState('');
  const [matricula, setMatricula] = useState('');
  const [motivo, setMotivo] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [web, setWeb] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<ResultadoReserva | null>(null);

  const cargarInfo = useCallback(() => {
    setErrorCarga(null);
    getInfoReservas(slug)
      .then((i) => { setInfo(i); if (i.tipos.length === 1) setTipo(i.tipos[0]); })
      .catch((e) => setErrorCarga(e instanceof ErrorPortal ? e : new ErrorPortal('No se pudo cargar la página de reservas.', 'temporal')));
  }, [slug]);
  useEffect(() => { cargarInfo(); }, [cargarInfo]);

  const cargarDisp = useCallback((t: TipoReserva) => {
    setCargandoDisp(true);
    getDisponibilidad(slug, t.id)
      .then((d) => { setDisp(d); })
      .catch((e) => { setDisp({ dias: {}, duracionMin: t.duracionMin }); setError(e instanceof Error ? e.message : 'No se pudo cargar la disponibilidad.'); })
      .finally(() => setCargandoDisp(false));
  }, [slug]);
  useEffect(() => { setDisp(null); setFecha(null); setHora(null); if (tipo) cargarDisp(tipo); }, [tipo, cargarDisp]);

  const color = info?.empresa.brandColor && /^#[0-9a-fA-F]{6}$/.test(info.empresa.brandColor) ? info.empresa.brandColor : '#2563eb';

  if (errorCarga) return <ErrorPortalPantalla tipo={errorCarga.tipo} mensaje={errorCarga.message} onReintentar={cargarInfo} />;
  if (!info) return <CargandoExterno />;

  const sinCaptcha = !CLAVE_TURNSTILE;
  const listo = !!tipo && !!fecha && !!hora && nombre.trim().length >= 2 && apellidos.trim().length >= 2 && telefono.replace(/\D/g, '').length >= 9 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim())
    && consentimiento && !!captcha && !enviando;

  const reservar = async () => {
    if (!tipo || !fecha || !hora) return;
    setEnviando(true); setError('');
    try {
      const r = await reservarCita({ slug, tipoId: tipo.id, fecha, hora, nombre, apellidos, telefono, correo, vehiculo, matricula, motivo, consentimiento, captchaToken: captcha, web });
      setHecho(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la reserva.');
      // Si el hueco se ocupó o cambió, se vuelve a pedir la disponibilidad para que no quede un hueco que ya no existe.
      setHora(null);
      cargarDisp(tipo);
    } finally {
      setEnviando(false);
    }
  };

  const Cabecera = (
    <HeroExterno color={color} logoUrl={info.empresa.logoUrl} empresa={info.empresa.nombre} iniciales={info.empresa.nombre?.[0]}
      titulo="Reserva tu cita" subtitulo={info.empresa.ciudad ? `${info.empresa.ciudad} · Servicio, día y hora en un minuto` : 'Servicio, día y hora en un minuto'} testId="cabecera-reserva" />
  );

  if (hecho) {
    const waTaller = waHref(info.empresa.telefono, mensajeCitaAlTaller(nombre.trim() || null, info.empresa.nombre, hecho.cuando));
    return (
      <PaginaExterna color={color}>
        {Cabecera}
        <ColumnaExterna ancho="xl">
          <div className={`${CLASE_TARJETA} p-7 space-y-3 text-center`} data-testid="reserva-hecha">
            <span className="mx-auto w-16 h-16 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-500 ring-8 ring-emerald-50/60"><Check className="w-8 h-8" strokeWidth={3} /></span>
            <h2 className="text-xl font-black text-slate-800">{hecho.estado === 'confirmada' ? '¡Cita confirmada!' : 'Solicitud recibida'}</h2>
            <p className="inline-block rounded-2xl px-4 py-2 text-sm font-bold capitalize-first" style={{ backgroundColor: aclarar(color, 90), color }}>{hecho.cuando}</p>
            {hecho.tipo && <p className="text-sm text-slate-500">{hecho.tipo}</p>}
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              {hecho.estado === 'confirmada'
                ? 'Te hemos enviado la confirmación por correo, con un enlace por si necesitas cancelarla.'
                : 'El taller la revisará y te confirmará por correo en cuanto pueda.'}
            </p>
            <div className="flex flex-col gap-2 pt-1 max-w-xs mx-auto">
              {hecho.ics && (
                <button type="button" onClick={() => descargarIcs(hecho.ics as string)} data-testid="añadir-calendario"
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-sm cursor-pointer" style={{ backgroundColor: color }}>
                  <CalendarPlus className="w-4 h-4" /> Añadir a mi calendario
                </button>
              )}
              <a href={hecho.enlace} className="flex items-center justify-center px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 text-sm font-bold hover:bg-slate-50">Ver, cambiar o cancelar mi cita</a>
              {waTaller && (
                <a href={waTaller} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-taller"
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-emerald-700 text-sm font-bold hover:bg-emerald-50"><MessageCircle className="w-4 h-4" /> Escribir al taller por WhatsApp</a>
              )}
            </div>
          </div>
          <PieExterno />
        </ColumnaExterna>
      </PaginaExterna>
    );
  }

  return (
    <PaginaExterna color={color} style={{ '--marca': color } as React.CSSProperties}>
      {Cabecera}
      <ColumnaExterna ancho="xl">
        {/* Fuera de los pasos: si falla la reserva se deselecciona la hora y el formulario desaparece; el mensaje debe seguir a la vista. */}
        {error && <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3" role="alert" data-testid="error-reserva">{error}</p>}
        {info.tipos.length === 0 ? (
          <p className={`${CLASE_TARJETA} p-5 text-sm text-slate-600`}>Este taller todavía no tiene servicios para reservar online.{info.empresa.telefono ? ` Llama al ${info.empresa.telefono}.` : ''}</p>
        ) : (
          <>
            <Seccion n={1} color={color} titulo="¿Qué necesitas?">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Servicio">
                {info.tipos.map((t) => (
                  <button key={t.id} type="button" aria-pressed={tipo?.id === t.id} onClick={() => { setError(''); setTipo(t); }}
                    className={`px-4 py-2.5 rounded-2xl border text-sm font-semibold cursor-pointer transition ${tipo?.id === t.id ? 'text-white border-transparent shadow-md' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    style={tipo?.id === t.id ? { backgroundColor: color } : undefined}>
                    {t.nombre} <span className="font-normal opacity-80">· {textoDuracionCita(t.duracionMin)}</span>
                  </button>
                ))}
              </div>
            </Seccion>

            {tipo && (
              <Seccion n={2} color={color} titulo="Elige día">
                <CalendarioHuecos disp={disp} cargando={cargandoDisp} fecha={fecha} color={color} telefono={info.empresa.telefono} onFecha={(f) => { setError(''); setFecha(f); setHora(null); }} />
              </Seccion>
            )}

            {tipo && fecha && (
              <Seccion n={3} color={color} titulo={`Elige hora · ${etiquetaDia(fecha)}`}>
                <HorasHuecos horas={fecha && disp ? (disp.dias[fecha] ?? []) : []} hora={hora} color={color} onHora={(h) => { setError(''); setHora(h); }} />
              </Seccion>
            )}

            {tipo && fecha && hora && (
              <Seccion n={4} color={color} titulo="Tus datos">
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre" maxLength={80} autoComplete="given-name" className={campo} />
                    <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} placeholder="Apellidos" aria-label="Apellidos" maxLength={80} autoComplete="family-name" className={campo} />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" aria-label="Teléfono" inputMode="tel" autoComplete="tel" maxLength={20} className={campo} />
                    <input value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" aria-label="Correo" inputMode="email" autoComplete="email" maxLength={254} className={campo} />
                  </div>
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
                    <input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} placeholder="Vehículo (opcional)" aria-label="Vehículo" maxLength={80} className={campo} />
                    <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Matrícula (opcional)" aria-label="Matrícula" maxLength={12} className={campo} />
                  </div>
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="¿Algo que debamos saber? (opcional)" aria-label="Motivo" rows={2} maxLength={300} className={campo} />
                  {/* Señuelo para robots: una persona no lo ve ni lo rellena. */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
                    <label>Web <input tabIndex={-1} autoComplete="off" value={web} onChange={(e) => setWeb(e.target.value)} /></label>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={consentimiento} onChange={(e) => setConsentimiento(e.target.checked)} className="mt-0.5 w-4 h-4 cursor-pointer" data-testid="consentimiento" />
                    <span>Acepto que <strong>{info.empresa.nombre}</strong> use mis datos para gestionar esta cita y avisarme de ella (<a href="/privacidad" target="_blank" rel="noopener noreferrer" className="underline">más información</a>).</span>
                  </label>
                  <Turnstile onToken={setCaptcha} />
                  {sinCaptcha && <p className="text-xs text-rose-600" role="alert">Las reservas online no están disponibles en este momento.{info.empresa.telefono ? ` Llama al ${info.empresa.telefono}.` : ''}</p>}
                  <button type="button" disabled={!listo || sinCaptcha} onClick={() => void reservar()} data-testid="reservar"
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-bold shadow-md disabled:opacity-50 disabled:shadow-none cursor-pointer transition" style={{ backgroundColor: color }}>
                    <CalendarCheck className="w-4 h-4" />{enviando ? 'Reservando…' : `Reservar ${etiquetaDia(fecha)} a las ${hora}`}
                  </button>
                  {info.confirmacion === 'manual' && <p className="text-[11px] text-slate-400 text-center">El taller confirmará tu cita por correo.</p>}
                </div>
              </Seccion>
            )}

            {info.empresa.telefono && (
              <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1.5"><Phone className="w-3 h-3" /> ¿Prefieres llamar? {info.empresa.telefono}</p>
            )}
          </>
        )}
        <PieExterno />
      </ColumnaExterna>
    </PaginaExterna>
  );
}
