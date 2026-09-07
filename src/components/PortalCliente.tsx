import { useEffect, useState } from 'react';
import { Car, Bell, Receipt, ClipboardList, Check, X, ShieldAlert } from 'lucide-react';
import { getPortalData, responderPresupuesto, PortalData } from '../lib/data/portal';
import { formatDate } from '../utils/dateFormat';

interface Props {
  token: string;
}

const PASOS = [
  { estado: 'recibido', label: 'Recibido' },
  { estado: 'en_reparacion', label: 'En reparación' },
  { estado: 'listo', label: 'Listo' },
] as const;

const TIPO_LABEL: Record<string, string> = { itv: 'ITV', seguro: 'Seguro', impuesto: 'Impuesto de circulación', mantenimiento: 'Mantenimiento' };
const TIPO_ICONO: Record<string, string> = { itv: '📋', seguro: '🛡️', impuesto: '🚗', mantenimiento: '🔧' };

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function PresupuestoCard({ p, color, token }: { p: PortalData['presupuestosPendientes'][number]; color: string; token: string }) {
  const [enviando, setEnviando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [respondido, setRespondido] = useState<'aprobado' | 'rechazado' | null>(null);
  const [error, setError] = useState('');

  const responder = async (aprobado: boolean) => {
    setEnviando(aprobado ? 'aprobar' : 'rechazar');
    setError('');
    try {
      await responderPresupuesto(token, p.otId, aprobado);
      // Deliberadamente no se quita de la lista del padre: así la tarjeta se
      // queda mostrando la confirmación en vez de desaparecer sin que el
      // cliente llegue a verla.
      setRespondido(aprobado ? 'aprobado' : 'rechazado');
    } catch (err) {
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
          {respondido === 'aprobado' ? '✓ Presupuesto aprobado — gracias' : 'Presupuesto rechazado. Contacta con el taller si tienes dudas.'}
        </div>
      ) : (
        <>
          <div className="flex gap-2.5 mt-4">
            <button
              onClick={() => responder(false)}
              disabled={enviando !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition cursor-pointer disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> {enviando === 'rechazar' ? 'Enviando…' : 'Rechazar'}
            </button>
            <button
              onClick={() => responder(true)}
              disabled={enviando !== null}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: color }}
            >
              <Check className="w-3.5 h-3.5" /> {enviando === 'aprobar' ? 'Enviando…' : 'Aprobar presupuesto'}
            </button>
          </div>
          {error && <p className="text-[11px] text-rose-500 font-semibold mt-2 text-center">{error}</p>}
        </>
      )}
    </div>
  );
}

export default function PortalCliente({ token }: Props) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPortalData(token)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'No se pudo cargar tu información.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-slate-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 max-w-sm text-center">
          <ShieldAlert className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h1 className="text-base font-extrabold text-slate-800 mb-1.5">Enlace no válido</h1>
          <p className="text-sm text-slate-500">{error || 'Este enlace ha caducado o no existe. Pide al taller que te envíe uno nuevo.'}</p>
        </div>
      </div>
    );
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

        {data.presupuestosPendientes.map(p => (
          <PresupuestoCard key={p.otId} p={p} color={color} token={token} />
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
                      {a.fechaLimite ? `Vence ${formatDate(a.fechaLimite)}` : a.kilometrajeLimite ? `A los ${a.kilometrajeLimite.toLocaleString('es-ES')} km` : ''}
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
