import { useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { abrirPortal, avisoSuscripcion, diasRestantes, iniciarCheckout, type Suscripcion } from '../lib/data/suscripcion';

interface Props {
  suscripcion: Suscripcion;
  /** Solo el administrador de la empresa puede pagar o gestionar la suscripción. */
  esAdmin: boolean;
  onClose: () => void;
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

const ETIQUETA: Record<Suscripcion['estado'], string> = {
  sin_limite: 'Cuenta sin límite', prueba: 'Prueba gratuita', activa: 'Suscripción activa',
  impago: 'Pago pendiente', cancelada: 'Suscripción cancelada', vencida: 'Acceso de solo lectura',
};

/** Estado de la suscripción y botones para pagar o gestionar el método de pago en Stripe. */
export default function SuscripcionPanel({ suscripcion: s, esAdmin, onClose }: Props) {
  const [plan, setPlan] = useState<'mensual' | 'anual'>('anual');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const aviso = avisoSuscripcion(s);
  const puedePagar = s.estado !== 'sin_limite' && !(s.estadoStripe === 'activa' && s.tieneCliente && s.estado !== 'vencida');

  const ir = async (fn: () => Promise<string>) => {
    setError(''); setOcupado(true);
    try {
      window.location.href = await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el pago.');
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Suscripción" className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-600" /> Suscripción</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="border border-slate-200 rounded-2xl p-4 space-y-1">
          <p className="text-sm font-bold text-slate-800">{ETIQUETA[s.estado]}</p>
          {s.estado === 'prueba' && <p className="text-xs text-slate-500">Te quedan {diasRestantes(s.accesoHasta)} días (hasta el {fecha(s.accesoHasta)}).</p>}
          {s.estado === 'activa' && s.accesoHasta && <p className="text-xs text-slate-500">{s.plan ? `Plan ${s.plan}. ` : ''}Pagado hasta el {fecha(s.accesoHasta)}.</p>}
          {aviso && <p className={`text-xs ${aviso.nivel === 'error' ? 'text-rose-600' : aviso.nivel === 'aviso' ? 'text-amber-700' : 'text-slate-500'}`}>{aviso.texto}</p>}
        </div>

        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

        {!esAdmin ? (
          <p className="text-xs text-slate-500">Solo el administrador de tu empresa puede pagar o gestionar la suscripción. Pídeselo si tu acceso está limitado.</p>
        ) : s.estado === 'sin_limite' ? null : (
          <>
            {puedePagar && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'mensual', titulo: 'Mensual', precio: '89 €', nota: 'al mes + IVA' },
                    { id: 'anual', titulo: 'Anual', precio: '961,20 €', nota: 'al año + IVA · 10 % de ahorro' },
                  ] as const).map((o) => (
                    <button key={o.id} onClick={() => setPlan(o.id)} aria-pressed={plan === o.id}
                      className={`text-left rounded-2xl border p-3 transition cursor-pointer ${plan === o.id ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <p className="text-xs font-bold text-slate-500">{o.titulo}</p>
                      <p className="text-lg font-black text-slate-800">{o.precio}</p>
                      <p className="text-[11px] text-slate-500">{o.nota}</p>
                    </button>
                  ))}
                </div>
                <button onClick={() => void ir(() => iniciarCheckout(plan))} disabled={ocupado}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                  <ShieldCheck className="w-4 h-4" /> {ocupado ? 'Abriendo el pago…' : 'Suscribirme'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">Pago seguro con tarjeta a través de Stripe. Puedes cancelar cuando quieras.</p>
              </div>
            )}
            {s.tieneCliente && (
              <button onClick={() => void ir(abrirPortal)} disabled={ocupado}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                <ExternalLink className="w-4 h-4" /> Gestionar suscripción y facturas
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
