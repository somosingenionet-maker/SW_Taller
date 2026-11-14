import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { getConfigFotos, listUsoAlmacenamiento, setBorradoFotosActivo, type UsoEmpresa } from '../lib/data/fotosPlataforma';
import { mensajeDeError } from '../lib/errores';
import { formatearBytes } from '../utils/imagen';

/**
 * Almacenamiento de fotos: interruptor del borrado automático (por plazo de cada taller) y espacio que ocupa
 * cada taller. Hasta la fecha mínima no se borra ninguna foto: es el margen para avisar a los talleres.
 */
export default function FotosPlataformaCard({ nombres }: { nombres: Record<string, string> }) {
  const [activo, setActivo] = useState<boolean | null>(null);
  const [noAntesDe, setNoAntesDe] = useState<string | null>(null);
  const [uso, setUso] = useState<UsoEmpresa[] | null>(null);
  const [error, setError] = useState('');
  const [cambiando, setCambiando] = useState(false);

  useEffect(() => {
    Promise.all([getConfigFotos(), listUsoAlmacenamiento()])
      .then(([c, u]) => { setActivo(c.activo); setNoAntesDe(c.noAntesDe); setUso(u); })
      .catch((e) => setError(mensajeDeError(e, 'No se pudo cargar el almacenamiento.')));
  }, []);

  const alternar = async () => {
    if (activo === null) return;
    setCambiando(true); setError('');
    try { await setBorradoFotosActivo(!activo); setActivo(!activo); }
    catch (e) { setError(mensajeDeError(e, 'No se pudo cambiar el interruptor.')); }
    finally { setCambiando(false); }
  };

  if (uso === null && !error) return null;
  const total = (uso ?? []).reduce((s, u) => s + u.bytes, 0);
  const margen = noAntesDe && new Date(noAntesDe).getTime() > Date.now();

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3" data-testid="fotos-plataforma">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Fotos y almacenamiento</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Las fotos de recepción y de inspección se borran solas pasado el plazo de cada taller desde la entrega (por defecto 6 meses), con aviso por correo antes.
            {margen && <> Hasta el {new Date(noAntesDe!).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })} no se borra nada.</>}
          </p>
        </div>
        {activo !== null && (
          <button type="button" role="switch" aria-checked={activo} aria-label="Borrado automático de fotos" disabled={cambiando} onClick={() => void alternar()}
            className={`shrink-0 w-10 h-6 rounded-full transition-colors relative cursor-pointer disabled:opacity-60 ${activo ? 'bg-green-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activo ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        )}
      </div>
      {activo === false && <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Borrado automático de fotos APAGADO: no se avisa ni se borra ninguna foto.</p>}
      {error && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
      {uso && (
        <>
          <p className="text-xs text-slate-600">Total ocupado (fotos y logos): <span className="font-bold text-slate-800">{formatearBytes(total)}</span></p>
          {uso.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {uso.slice(0, 8).map((u) => (
                <li key={u.empresaId} className="py-1.5 flex justify-between text-xs">
                  <span className="text-slate-700 truncate">{nombres[u.empresaId] ?? u.empresaId}</span>
                  <span className="text-slate-500 shrink-0">{formatearBytes(u.bytes)} · {u.archivos} archivo{u.archivos === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
