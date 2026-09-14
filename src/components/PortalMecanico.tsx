import { useEffect, useState } from 'react';
import { Wrench, Car, ShieldAlert, ClipboardCheck, Check } from 'lucide-react';
import { getPortalMecanicoData, marcarTareaMecanico, PortalMecanicoData, PortalMecanicoTarea } from '../lib/data/portalMecanico';

interface Props {
  token: string;
}

const ESTADO_LABEL: Record<string, string> = { recibido: 'Recibido', en_reparacion: 'En reparación' };

function OrdenCard({ orden, color, token }: { orden: PortalMecanicoData['ordenes'][number]; color: string; token: string }) {
  const [tareas, setTareas] = useState<PortalMecanicoTarea[]>(orden.tareas);
  const [pendienteId, setPendienteId] = useState<string | null>(null);

  const toggle = async (t: PortalMecanicoTarea) => {
    const nuevo = !t.completado;
    setTareas(prev => prev.map(x => (x.id === t.id ? { ...x, completado: nuevo } : x)));
    setPendienteId(t.id);
    try {
      await marcarTareaMecanico(token, t.id, nuevo);
    } catch {
      // si falla el guardado, se revierte el check para no mentirle al mecánico sobre lo que quedó guardado
      setTareas(prev => prev.map(x => (x.id === t.id ? { ...x, completado: !nuevo } : x)));
    } finally {
      setPendienteId(null);
    }
  };

  const hechas = tareas.filter(t => t.completado).length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
          <Car className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-extrabold text-slate-800 truncate">
            {orden.vehiculo ? `${orden.vehiculo.marca} ${orden.vehiculo.modelo}` : orden.numero}
          </p>
          <p className="text-xs text-slate-400">{orden.vehiculo?.matricula ? `${orden.vehiculo.matricula} · ` : ''}{orden.numero}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">
          {ESTADO_LABEL[orden.estado] ?? orden.estado}
        </span>
      </div>

      {orden.descripcionProblema && (
        <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2 mt-3">{orden.descripcionProblema}</p>
      )}

      {tareas.length === 0 ? (
        <p className="text-xs text-slate-400 italic mt-3">Sin tareas de mano de obra registradas todavía.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {tareas.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggle(t)}
              disabled={pendienteId === t.id}
              className={`w-full flex items-center gap-3 text-left px-3.5 py-3 rounded-2xl border transition disabled:opacity-60 cursor-pointer ${
                t.completado ? 'bg-teal-50 border-teal-200' : 'bg-white border-slate-200 hover:border-slate-300 active:scale-[0.99]'
              }`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 text-white"
                style={t.completado ? { backgroundColor: color, borderColor: color } : { borderColor: '#cbd5e1' }}
              >
                {t.completado && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className={`flex-1 text-sm ${t.completado ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                {t.descripcion}
              </span>
              <span className="text-[10px] font-bold shrink-0" style={{ color: t.completado ? color : '#94a3b8' }}>
                {pendienteId === t.id ? '…' : t.completado ? 'Hecho' : 'Marcar hecho'}
              </span>
            </button>
          ))}
          <p className="text-[10px] text-slate-400 pt-1">{hechas}/{tareas.length} completadas</p>
        </div>
      )}
    </div>
  );
}

export default function PortalMecanico({ token }: Props) {
  const [data, setData] = useState<PortalMecanicoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPortalMecanicoData(token)
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
              <Wrench className="w-4 h-4 text-white" />
            )}
          </div>
          <span className="text-white font-bold text-sm">{data.empresa?.nombre}</span>
        </div>
        <h1 className="text-xl font-black text-white mb-1">Hola, {data.tecnico.nombre} 🔧</h1>
        <p className="text-xs text-white/70">Tus vehículos asignados y tareas pendientes</p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-6 space-y-4">
        {data.ordenes.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
            <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">No tienes vehículos asignados ahora mismo</p>
          </div>
        ) : (
          data.ordenes.map(o => <OrdenCard key={o.id} orden={o} color={color} token={token} />)
        )}

        <p className="text-center text-[11px] text-slate-400 pt-2">
          Enlace personal de {data.tecnico.nombre} · Doonty Motor
        </p>
      </div>
    </div>
  );
}
