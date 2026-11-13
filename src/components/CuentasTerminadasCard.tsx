import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { getBorradoAutomaticoActivo, listCuentasTerminadas, setBorradoAutomaticoActivo, type CuentaTerminada } from '../lib/data/cuentasTerminadas';
import { situacionCuenta } from '../utils/cuentasTerminadas';
import { mensajeDeError } from '../lib/errores';

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }) : '—');

/**
 * Cuentas cuyo acceso ya terminó y qué pasará con ellas: el borrado automático elimina las que llevan
 * 90 días sin acceso, tras avisar por correo. Aquí se ve cada cuenta (y por qué no se borra, si está
 * retenida) y se puede apagar el borrado automático de toda la plataforma.
 */
export default function CuentasTerminadasCard() {
  const [cuentas, setCuentas] = useState<CuentaTerminada[] | null>(null);
  const [activo, setActivo] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    Promise.all([listCuentasTerminadas(), getBorradoAutomaticoActivo()])
      .then(([c, a]) => { setCuentas(c); setActivo(a); })
      .catch((e) => setError(mensajeDeError(e, 'No se pudieron cargar las cuentas terminadas.')));
  }, []);

  const alternar = async () => {
    if (activo === null) return;
    setCambiando(true);
    setError('');
    try {
      await setBorradoAutomaticoActivo(!activo);
      setActivo(!activo);
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo cambiar el interruptor.'));
    } finally {
      setCambiando(false);
    }
  };

  if (cuentas === null && !error) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-testid="cuentas-terminadas">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Cuentas terminadas</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Las cuentas sin acceso desde hace 90 días se eliminan solas, después de avisar por correo a sus administradores (primer aviso con 14 días como mínimo, último aviso 7 días antes). No se tocan las que tienen facturas emitidas.
          </p>
        </div>
        {activo !== null && (
          <button
            type="button" role="switch" aria-checked={activo} aria-label="Borrado automático" disabled={cambiando} onClick={() => void alternar()}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors relative cursor-pointer disabled:opacity-60 ${activo ? 'bg-green-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        )}
      </div>
      {activo === false && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Borrado automático APAGADO: no se avisa ni se borra ninguna cuenta.</p>}
      {error && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
      {cuentas && cuentas.length === 0 && <p className="text-xs text-slate-400">No hay cuentas con el acceso terminado.</p>}
      {cuentas && cuentas.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {cuentas.map((c) => {
            const s = situacionCuenta(c);
            return (
              <li key={c.empresaId} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 truncate">{c.nombre}</p>
                  <p className="text-slate-500">
                    Acceso terminado el {fecha(c.accesoHasta)} · {c.usuarios} usuarios, {c.clientes} clientes, {c.vehiculos} vehículos, {c.ordenes} órdenes{c.facturasEmitidas > 0 ? `, ${c.facturasEmitidas} facturas emitidas` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold ${s.tono === 'retenida' ? 'text-sky-700' : s.tono === 'avisada' ? 'text-amber-700' : 'text-slate-600'}`}>{s.texto}</p>
                  {!c.retencion && <p className="text-slate-400">Se borra el {fecha(c.borradoPrevistoEn ?? c.finConservacion)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
