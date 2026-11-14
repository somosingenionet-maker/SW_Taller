import { useCallback, useEffect, useState } from 'react';
import { Car, Bell, Receipt, ClipboardList, ClipboardCheck, Check, X } from 'lucide-react';
import { getPortalData, responderPresupuesto, responderInspeccion, PortalData, type PortalInforme, type PortalInformePunto } from '../lib/data/portal';
import { ErrorPortal } from '../lib/data/invocarPortal';
import ErrorPortalPantalla from './ErrorPortalPantalla';
import { formatDate } from '../utils/dateFormat';
import { fmt2, formatKm } from '../utils/moneda';

interface Props {
  token: string;
}

const PASOS = [
  { estado: 'recibido', label: 'Recibido' },
  { estado: 'en_reparacion', label: 'En reparación' },
  { estado: 'listo', label: 'Listo' },
] as const;

const TIPO_LABEL: Record<string, string> = { itv: 'ITV', seguro: 'Seguro', impuesto: 'Impuesto de circulación', aceite: 'Cambio de aceite' };
const TIPO_ICONO: Record<string, string> = { itv: '📋', seguro: '🛡️', impuesto: '🚗', aceite: '🛢️' };

const fmt = fmt2;

function VehiculoStatus({ v, color }: { v: PortalData['vehiculos'][number]; color: string }) {
  if (!v.estadoOt || v.estadoOt === 'presupuesto') {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <Car className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-800">{v.marca} {v.modelo}</p>
          <p className="text-xs text-slate-400">{v.matricula}</p>
        </div>
      </div>
    );
  }

  const idxActual = PASOS.findIndex(p => p.estado === v.estadoOt);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <Car className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-800">{v.marca} {v.modelo}</p>
          <p className="text-xs text-slate-400">{v.matricula}</p>
        </div>
      </div>

      <div className="flex items-center">
        {PASOS.map((paso, i) => (
          <div key={paso.estado} className="flex-1 text-center relative">
            {i > 0 && (
              <div className="absolute top-3 left-[-50%] w-full h-0.5" style={{ backgroundColor: i <= idxActual ? color : '#e2e8f0' }} />
            )}
            <div
              className="relative z-10 w-6 h-6 rounded-full mx-auto mb-1.5 flex items-center justify-center text-[10px] font-bold"
              style={
                i < idxActual ? { backgroundColor: color, color: '#fff' }
                : i === idxActual ? { backgroundColor: color, color: '#fff', boxShadow: `0 0 0 4px ${color}22` }
                : { backgroundColor: '#f8fafc', color: '#94a3b8', border: '2px solid #e2e8f0' }
              }
            >
              {i < idxActual ? '✓' : i + 1}
            </div>
            <p className={`text-[10px] font-bold ${i <= idxActual ? 'text-slate-800' : 'text-slate-400'}`}>{paso.label}</p>
          </div>
        ))}
      </div>

      {v.fechaEstimadaEntrega && (
        <div className="mt-4 rounded-xl px-3 py-2 text-xs font-bold text-center" style={{ backgroundColor: `${color}14`, color }}>
          📅 Entrega estimada: {formatDate(v.fechaEstimadaEntrega)}
        </div>
      )}
    </div>
  );
}

function PresupuestoCard({ p, color, token, nombreCliente, onRespondido }: {
  p: PortalData['presupuestosPendientes'][number]; color: string; token: string; nombreCliente: string; onRespondido: () => void;
}) {
  const [nombre, setNombre] = useState(nombreCliente);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [respondido, setRespondido] = useState<'aprobado' | 'rechazado' | null>(null);
  const [error, setError] = useState('');

  const responder = async (aprobado: boolean) => {
    setEnviando(aprobado ? 'aprobar' : 'rechazar');
    setError('');
    try {
      await responderPresupuesto(token, p.otId, aprobado, aprobado ? { nombre, totalVisto: p.total } : undefined);
      // Deliberadamente no se quita de la lista del padre: así la tarjeta se
      // queda mostrando la confirmación en vez de desaparecer sin que el
      // cliente llegue a verla.
      setRespondido(aprobado ? 'aprobado' : 'rechazado');
    } catch (err) {
      // Si el importe cambió mientras decidía, se vuelve a leer para que vea el vigente.
      if (err instanceof Error && /importe .* ha cambiado/.test(err.message)) onRespondido();
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu respuesta.');
    } finally {
      setEnviando(null);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 text-amber-600">
          <ClipboardList className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-800">Presupuesto pendiente</p>
          <p className="text-xs text-slate-400">{p.vehiculo}</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {p.lineas.map((l, i) => (
          <div key={i} className="flex justify-between text-xs py-1.5 text-slate-600">
            <span>{l.descripcion} {l.cantidad !== 1 ? `× ${l.cantidad}` : ''}</span>
            <span className="font-semibold text-slate-700">{fmt(l.subtotal)} €</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2.5 mt-2">
        <span>Total (IVA incl.)</span>
        <span>{fmt(p.total)} €</span>
      </div>

      {respondido ? (
        <div className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-bold text-center ${respondido === 'aprobado' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {respondido === 'aprobado' ? '✓ Presupuesto aceptado — gracias' : 'Presupuesto rechazado. Contacta con el taller si tienes dudas.'}
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2.5">
            <p className="text-[11px] text-slate-500 leading-relaxed" data-testid="texto-aceptacion">{p.textoAceptacion}</p>
            <div>
              <label htmlFor={`acepta-nombre-${p.otId}`} className="block text-[11px] font-semibold text-slate-600 mb-1">Tu nombre</label>
              <input
                id={`acepta-nombre-${p.otId}`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-0.5 w-4 h-4 cursor-pointer" data-testid="acepta-casilla" />
              <span>He leído el presupuesto y lo acepto.</span>
            </label>
          </div>
          <div className="flex gap-2.5 mt-3">
            <button
              onClick={() => responder(false)}
              disabled={enviando !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> {enviando === 'rechazar' ? 'Enviando…' : 'Rechazar'}
            </button>
            <button
              onClick={() => responder(true)}
              disabled={enviando !== null || !acepta || nombre.trim().length < 2}
              data-testid="aceptar-presupuesto"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: color }}
            >
              <Check className="w-3.5 h-3.5" /> {enviando === 'aprobar' ? 'Enviando…' : 'Aceptar presupuesto'}
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-500 font-semibold mt-2 text-center">{error}</p>}
        </>
      )}
    </div>
  );
}

function PuntoInforme({ p, tono, elegible, marcado, onMarcar }: {
  p: PortalInformePunto; tono: 'urgente' | 'atencion'; elegible: boolean; marcado: boolean; onMarcar: (marcar: boolean) => void;
}) {
  const colores = tono === 'urgente' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50';
  const texto = tono === 'urgente' ? 'text-rose-800' : 'text-amber-800';
  return (
    <div className={`rounded-2xl border p-3 ${colores}`} data-testid="informe-punto">
      <div className="flex items-start gap-2.5">
        {elegible && (
          <input type="checkbox" checked={marcado} onChange={(e) => onMarcar(e.target.checked)} aria-label={`Aprobar: ${p.nombre}`}
            className="mt-0.5 w-4 h-4 shrink-0 cursor-pointer" data-testid="marcar-punto" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-bold ${texto}`}>{p.nombre} <span className="font-normal opacity-70">· {p.categoria}</span></p>
            {p.precio != null && p.precio > 0 && <span className={`text-sm font-black whitespace-nowrap ${texto}`}>{fmt(p.precio)} €</span>}
          </div>
          {p.nota && <p className={`text-xs mt-1 ${texto}`}>{p.nota}</p>}
          {p.reparacion && <p className="text-xs mt-1 text-slate-600">Propuesta: {p.reparacion}</p>}
          {p.fotos.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {p.fotos.map((u, i) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" aria-label={`Ver foto ${i + 1} de ${p.nombre}`}>
                  <img src={u} alt={`Foto ${i + 1} de ${p.nombre}`} className="w-20 h-20 rounded-xl object-cover border border-white" />
                </a>
              ))}
            </div>
          )}
          {p.decision && (
            <p className={`text-[11px] font-bold mt-2 ${p.decision === 'aprobado' ? 'text-green-700' : 'text-slate-500'}`}>
              {p.decision === 'aprobado' ? '✓ Aprobado' : 'No aprobado'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function InformeCard({ inf, color, token, nombreCliente, onRespondido }: { inf: PortalInforme; color: string; token: string; nombreCliente: string; onRespondido: () => void }) {
  const elegibles = [...inf.urgentes, ...inf.atencion].filter((p) => p.precio != null && p.precio > 0);
  // Por defecto vienen marcadas las urgentes; las que solo requieren atención las elige el cliente.
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(inf.urgentes.filter((p) => p.precio != null && p.precio > 0).map((p) => p.id)));
  const [nombre, setNombre] = useState(nombreCliente);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const aprobados = elegibles.filter((p) => marcados.has(p.id));
  const total = Math.round(aprobados.reduce((s, p) => s + (p.precio ?? 0), 0) * 100) / 100;

  const marcar = (id: string, marcar: boolean) => setMarcados((m) => { const n = new Set(m); if (marcar) n.add(id); else n.delete(id); return n; });

  const responder = async () => {
    setEnviando(true);
    setError('');
    try {
      await responderInspeccion(token, inf.id, aprobados.map((p) => p.id), aprobados.length ? { nombre, totalVisto: total } : undefined);
      onRespondido();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar tu respuesta.');
      if (err instanceof Error && /importe .* ha cambiado/.test(err.message)) onRespondido();
    } finally {
      setEnviando(false);
    }
  };

  const hayProblemas = inf.urgentes.length + inf.atencion.length > 0;
  const aprobada = [...inf.urgentes, ...inf.atencion].some((p) => p.decision === 'aprobado');
  const puedeEnviar = !enviando && (aprobados.length === 0 || (acepta && nombre.trim().length >= 2));
  const respondible = inf.estado === 'enviada' && elegibles.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-3" data-testid="informe-inspeccion">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600"><ClipboardCheck className="w-4 h-4" /></span>
        <div>
          <p className="text-sm font-extrabold text-slate-800">Informe de inspección</p>
          <p className="text-xs text-slate-400">{inf.vehiculo}{inf.enviadaEn ? ` · ${formatDate(inf.enviadaEn.slice(0, 10))}` : ''}</p>
        </div>
      </div>

      {inf.notaGeneral && <p className="text-sm text-slate-600">{inf.notaGeneral}</p>}
      {!hayProblemas && <p className="text-sm font-semibold text-green-700">Todo lo revisado está en buen estado.</p>}

      {inf.urgentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-rose-600">Urgente ({inf.urgentes.length})</p>
          {inf.urgentes.map((p) => <PuntoInforme key={p.id} p={p} tono="urgente" elegible={respondible && p.precio != null && p.precio > 0} marcado={marcados.has(p.id)} onMarcar={(v) => marcar(p.id, v)} />)}
        </div>
      )}
      {inf.atencion.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-amber-600">Requiere atención ({inf.atencion.length})</p>
          {inf.atencion.map((p) => <PuntoInforme key={p.id} p={p} tono="atencion" elegible={respondible && p.precio != null && p.precio > 0} marcado={marcados.has(p.id)} onMarcar={(v) => marcar(p.id, v)} />)}
        </div>
      )}
      {inf.bien > 0 && <p className="text-xs text-slate-500">El resto está bien ({inf.bien} punto{inf.bien === 1 ? '' : 's'}).</p>}
      {inf.fotosEliminadas && <p className="text-[11px] text-slate-400">Las fotos de este informe ya se eliminaron por el plazo de conservación.</p>}

      {respondible && (
        <>
          <div className="flex justify-between text-sm font-black text-slate-900 border-t border-slate-200 pt-2.5" data-testid="total-marcado">
            <span>{aprobados.length === 0 ? 'No apruebas ninguna reparación' : (aprobados.length === 1 ? 'Apruebas 1 reparación' : `Apruebas ${aprobados.length} reparaciones`)}</span>
            <span>{fmt(total)} € + IVA</span>
          </div>
          {aprobados.length > 0 && (
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-3 space-y-2.5">
              <div>
                <label htmlFor={`insp-nombre-${inf.id}`} className="block text-[11px] font-semibold text-slate-600 mb-1">Tu nombre</label>
                <input id={`insp-nombre-${inf.id}`} value={nombre} onChange={e => setNombre(e.target.value)} maxLength={120}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={acepta} onChange={e => setAcepta(e.target.checked)} className="mt-0.5 w-4 h-4 cursor-pointer" data-testid="acepta-informe" />
                <span>He leído el informe y acepto las reparaciones marcadas por {fmt(total)} € + IVA.</span>
              </label>
            </div>
          )}
          <button onClick={responder} disabled={!puedeEnviar} data-testid="enviar-respuesta-informe"
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: aprobados.length ? color : '#64748b' }}>
            {aprobados.length ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {enviando ? 'Enviando…' : aprobados.length ? 'Aceptar lo marcado' : 'Enviar sin aprobar nada'}
          </button>
          {error && <p className="text-[11px] text-rose-500 font-semibold text-center">{error}</p>}
        </>
      )}
      {inf.estado === 'respondida' && hayProblemas && (
        <div className={`rounded-xl px-3 py-2.5 text-xs font-bold text-center ${aprobada ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {aprobada ? '✓ Reparaciones aprobadas — el taller se pone con ello' : 'No aprobaste ninguna reparación. Contacta con el taller si cambias de idea.'}
        </div>
      )}
    </div>
  );
}

export default function PortalCliente({ token }: Props) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorPortal | null>(null);

  const cargar = useCallback(() => {
    setLoading(true);
    setError(null);
    getPortalData(token)
      .then(setData)
      .catch(err => setError(err instanceof ErrorPortal ? err : new ErrorPortal('No se pudo cargar tu información.', 'temporal')))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { cargar(); }, [cargar]);
  // Tras responder se relee sin tapar la pantalla con el indicador de carga.
  const cargarSinParpadeo = useCallback(() => { getPortalData(token).then(setData).catch(() => undefined); }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorPortalPantalla tipo={error?.tipo ?? 'enlace'} mensaje={error?.message ?? 'Este enlace ha caducado o no existe.'} onReintentar={cargar} />;
  }

  const color = data.empresa?.brandColor || '#2563eb';

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-10">
      <div className="rounded-b-[28px] px-5 pt-6 pb-11" style={{ backgroundColor: color }}>
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden" style={{ backgroundColor: '#ffffff22' }}>
            {data.empresa?.logoUrl ? (
              <img src={data.empresa.logoUrl} alt={data.empresa.nombre} className="w-full h-full object-contain" />
            ) : (
              <span className="text-white font-black text-xs">{data.empresa?.nombre?.[0]?.toUpperCase() ?? 'D'}</span>
            )}
          </div>
          <span className="text-white font-bold text-sm">{data.empresa?.nombre}</span>
        </div>
        <h1 className="text-xl font-black text-white mb-1">Hola, {data.cliente.nombre} 👋</h1>
        <p className="text-xs text-white/70">Aquí puedes ver el estado de tu vehículo</p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-6 space-y-4">
        {data.vehiculos.map(v => <VehiculoStatus key={v.id} v={v} color={color} />)}

        {(data.informes ?? []).map(inf => (
          <InformeCard key={inf.id} inf={inf} color={color} token={token} nombreCliente={`${data.cliente.nombre} ${data.cliente.apellidos}`.trim()} onRespondido={cargarSinParpadeo} />
        ))}

        {data.presupuestosPendientes.map(p => (
          <PresupuestoCard key={p.otId} p={p} color={color} token={token} nombreCliente={`${data.cliente.nombre} ${data.cliente.apellidos}`.trim()} onRespondido={cargarSinParpadeo} />
        ))}

        {data.alertas.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                <Bell className="w-4 h-4" />
              </span>
              <p className="text-sm font-extrabold text-slate-800">Próximos vencimientos</p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.alertas.map((a, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2 text-xs">
                  <span>{TIPO_ICONO[a.tipo]}</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-700">{TIPO_LABEL[a.tipo]}</p>
                    <p className="text-slate-400">
                      {a.tipo === 'aceite'
                        ? [a.fechaLimite ? `Te toca el ${formatDate(a.fechaLimite)}` : '', a.kilometrajeLimite ? `${a.fechaLimite ? 'o a' : 'A'} los ${formatKm(a.kilometrajeLimite)} km` : ''].filter(Boolean).join(' ')
                        : a.fechaLimite ? `Vence ${formatDate(a.fechaLimite)}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.facturas.length > 0 && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-green-50 text-green-600">
                <Receipt className="w-4 h-4" />
              </span>
              <p className="text-sm font-extrabold text-slate-800">Tus facturas</p>
            </div>
            <div className="divide-y divide-slate-100">
              {data.facturas.map(f => (
                <div key={f.numero} className="flex items-center gap-2.5 py-2 text-xs">
                  <div className="flex-1">
                    <p className="font-bold text-slate-700">{f.numero}</p>
                    <p className="text-slate-400">{formatDate(f.fecha)}</p>
                  </div>
                  <span className="font-extrabold text-slate-700">{fmt(f.total)} €</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.estado === 'pagada' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {f.estado === 'pagada' ? 'Pagada' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Enlace personal de {data.cliente.nombre} {data.cliente.apellidos} · Doonty Motor
        </p>
      </div>
    </div>
  );
}
