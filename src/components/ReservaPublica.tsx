import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Check, Clock, Phone } from 'lucide-react';
import {
  getDisponibilidad, getInfoReservas, reservarCita, type DisponibilidadReservas, type InfoReservas, type ResultadoReserva, type TipoReserva,
} from '../lib/data/reservas';
import { ErrorPortal } from '../lib/data/invocarPortal';
import ErrorPortalPantalla from './ErrorPortalPantalla';
import Turnstile, { CLAVE_TURNSTILE } from './Turnstile';
import { cuadriculaMes, etiquetaDia, mesesConHueco, NOMBRES_DIA_CORTO, NOMBRES_MES, partirHoras, textoDuracionCita } from '../utils/reservas';

const campo = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';


/** Bloque numerado de la página. Fuera del componente principal: si se definiera dentro, se volvería a crear en cada
 *  pulsación de tecla y los campos de texto perderían el foco. */
function Seccion({ n, titulo, color, children }: { n: number; titulo: string; color: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3">
      <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500"><span className="inline-flex w-5 h-5 mr-1.5 rounded-full items-center justify-center text-white text-[10px]" style={{ backgroundColor: color }}>{n}</span>{titulo}</p>
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
  const [mesIdx, setMesIdx] = useState(0);
  const [nombre, setNombre] = useState('');
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
      .then((d) => { setDisp(d); setMesIdx(0); })
      .catch((e) => { setDisp({ dias: {}, duracionMin: t.duracionMin }); setError(e instanceof Error ? e.message : 'No se pudo cargar la disponibilidad.'); })
      .finally(() => setCargandoDisp(false));
  }, [slug]);
  useEffect(() => { setDisp(null); setFecha(null); setHora(null); if (tipo) cargarDisp(tipo); }, [tipo, cargarDisp]);

  const meses = useMemo(() => mesesConHueco(Object.keys(disp?.dias ?? {})), [disp]);
  const color = info?.empresa.brandColor && /^#[0-9a-fA-F]{6}$/.test(info.empresa.brandColor) ? info.empresa.brandColor : '#2563eb';

  if (errorCarga) return <ErrorPortalPantalla tipo={errorCarga.tipo} mensaje={errorCarga.message} onReintentar={cargarInfo} />;
  if (!info) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full" /></div>;

  const sinCaptcha = !CLAVE_TURNSTILE;
  const listo = !!tipo && !!fecha && !!hora && nombre.trim().length >= 2 && telefono.replace(/\D/g, '').length >= 9 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo.trim())
    && consentimiento && !!captcha && !enviando;

  const reservar = async () => {
    if (!tipo || !fecha || !hora) return;
    setEnviando(true); setError('');
    try {
      const r = await reservarCita({ slug, tipoId: tipo.id, fecha, hora, nombre, telefono, correo, vehiculo, matricula, motivo, consentimiento, captchaToken: captcha, web });
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
    <div className="px-5 pt-7 pb-9 rounded-b-[28px] text-white" style={{ backgroundColor: color }}>
      <div className="max-w-xl mx-auto flex items-center gap-3">
        {info.empresa.logoUrl && <img src={info.empresa.logoUrl} alt="" className="w-11 h-11 rounded-xl object-contain bg-white/20" />}
        <div>
          <h1 className="text-xl font-black leading-tight">{info.empresa.nombre}</h1>
          <p className="text-xs text-white/80">{info.empresa.ciudad ? `${info.empresa.ciudad} · ` : ''}Reserva tu cita</p>
        </div>
      </div>
    </div>
  );

  if (hecho) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans pb-10">
        {Cabecera}
        <div className="max-w-xl mx-auto px-4 -mt-5" data-testid="reserva-hecha">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-3 text-center">
            <span className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-green-50 text-green-600"><Check className="w-6 h-6" /></span>
            <h2 className="text-lg font-extrabold text-slate-800">{hecho.estado === 'confirmada' ? '¡Cita confirmada!' : 'Solicitud recibida'}</h2>
            <p className="text-sm text-slate-600 capitalize-first">{hecho.cuando}</p>
            {hecho.tipo && <p className="text-xs text-slate-500">{hecho.tipo}</p>}
            <p className="text-xs text-slate-500">
              {hecho.estado === 'confirmada'
                ? 'Te hemos enviado la confirmación por correo, con un enlace por si necesitas cancelarla.'
                : 'El taller la revisará y te confirmará por correo en cuanto pueda.'}
            </p>
            <a href={hecho.enlace} className="inline-block text-xs font-bold underline" style={{ color }}>Ver o cancelar mi cita</a>
          </div>
        </div>
      </div>
    );
  }

  const mes = meses[mesIdx];
  const celdas = mes && disp ? cuadriculaMes(mes.año, mes.mes, disp.dias) : [];
  const horas = fecha && disp ? partirHoras(disp.dias[fecha] ?? []) : { manana: [], tarde: [] };
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {Cabecera}
      <div className="max-w-xl mx-auto px-4 -mt-5 space-y-4">
        {/* Fuera de los pasos: si falla la reserva se deselecciona la hora y el formulario desaparece; el mensaje debe seguir a la vista. */}
        {error && <p className="text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3" role="alert" data-testid="error-reserva">{error}</p>}
        {info.tipos.length === 0 ? (
          <p className="bg-white rounded-3xl border border-slate-200 p-5 text-sm text-slate-600">Este taller todavía no tiene servicios para reservar online.{info.empresa.telefono ? ` Llama al ${info.empresa.telefono}.` : ''}</p>
        ) : (
          <>
            <Seccion n={1} color={color} titulo="¿Qué necesitas?">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Servicio">
                {info.tipos.map((t) => (
                  <button key={t.id} type="button" aria-pressed={tipo?.id === t.id} onClick={() => { setError(''); setTipo(t); }}
                    className={`px-3.5 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${tipo?.id === t.id ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-700'}`}
                    style={tipo?.id === t.id ? { backgroundColor: color } : undefined}>
                    {t.nombre} <span className="font-normal opacity-80">· {textoDuracionCita(t.duracionMin)}</span>
                  </button>
                ))}
              </div>
            </Seccion>

            {tipo && (
              <Seccion n={2} color={color} titulo="Elige día">
                {cargandoDisp && <p className="text-xs text-slate-400">Buscando huecos…</p>}
                {!cargandoDisp && disp && meses.length === 0 && (
                  <p className="text-sm text-slate-600" data-testid="sin-huecos">No hay huecos disponibles en los próximos días.{info.empresa.telefono ? ` Llama al ${info.empresa.telefono} y buscamos uno.` : ''}</p>
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
                          onClick={() => { setError(''); setFecha(c.fecha); setHora(null); }}
                          className={`py-2 rounded-lg text-sm font-semibold ${c.disponible ? 'cursor-pointer' : 'text-slate-300 cursor-default'} ${fecha === c.fecha ? 'text-white' : c.disponible ? 'bg-slate-50 text-slate-800 hover:bg-slate-100' : ''}`}
                          style={fecha === c.fecha ? { backgroundColor: color } : undefined}>
                          {c.dia}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Seccion>
            )}

            {tipo && fecha && (
              <Seccion n={3} color={color} titulo={`Elige hora · ${etiquetaDia(fecha)}`}>
                {([['Mañana', horas.manana], ['Tarde', horas.tarde]] as const).filter(([, h]) => h.length > 0).map(([titulo, hs]) => (
                  <div key={titulo}>
                    <p className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" />{titulo}</p>
                    <div className="flex flex-wrap gap-2" role="group" aria-label={titulo}>
                      {hs.map((h) => (
                        <button key={h} type="button" aria-pressed={hora === h} onClick={() => { setError(''); setHora(h); }}
                          className={`px-3.5 py-2 rounded-xl border text-sm font-semibold cursor-pointer ${hora === h ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-700'}`}
                          style={hora === h ? { backgroundColor: color } : undefined}>{h}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </Seccion>
            )}

            {tipo && fecha && hora && (
              <Seccion n={4} color={color} titulo="Tus datos">
                <div className="space-y-2.5">
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre y apellidos" aria-label="Nombre" maxLength={80} autoComplete="name" className={campo} />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono" aria-label="Teléfono" inputMode="tel" autoComplete="tel" maxLength={20} className={campo} />
                    <input value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Correo" aria-label="Correo" inputMode="email" autoComplete="email" maxLength={254} className={campo} />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
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
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-50 cursor-pointer" style={{ backgroundColor: color }}>
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
      </div>
    </div>
  );
}
