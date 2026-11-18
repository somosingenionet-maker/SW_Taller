import { useMemo, useState } from 'react';
import { Check, CircleDollarSign, Eye } from 'lucide-react';
import type { Compra } from '../types';
import { marcarPagoComprasLote } from '../lib/data/compras';
import { avisarOk } from '../lib/avisos';
import { agruparPorPagar, deudaPorProveedor, diasHasta, etiquetaVencimiento, type ClaveGrupoPago } from '../utils/compras';
import { fmt2 } from '../utils/moneda';
import { formatDate } from '../utils/dateFormat';

const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const COLOR_GRUPO: Record<ClaveGrupoPago, string> = { vencidas: 'text-rose-700', semana: 'text-amber-700', proximas: 'text-slate-600', sinFecha: 'text-slate-500' };

interface Props {
  pendientes: Compra[];
  cargando: boolean;
  hoy: string;
  onAbrirDetalle: (id: string) => void;
  /** Tras marcar compras como pagadas: recargar listas y avisos. */
  onPagadas: () => void;
}

/** Lo que se debe a proveedores: pendientes por urgencia o por proveedor, y pago de varias facturas de una vez. */
export default function PorPagar({ pendientes, cargando, hoy, onAbrirDetalle, onPagadas }: Props) {
  const [modo, setModo] = useState<'vencimiento' | 'proveedor'>('vencimiento');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [fechaPago, setFechaPago] = useState(hoy);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState('');

  const grupos = useMemo(() => agruparPorPagar(pendientes, hoy), [pendientes, hoy]);
  const deudas = useMemo(() => deudaPorProveedor(pendientes, hoy), [pendientes, hoy]);
  const totalDeuda = useMemo(() => pendientes.reduce((s, c) => s + Math.round(c.total * 100), 0) / 100, [pendientes]);
  const totalVencido = useMemo(() => grupos.find((g) => g.clave === 'vencidas')?.total ?? 0, [grupos]);
  const porId = useMemo(() => new Map(pendientes.map((c) => [c.id, c])), [pendientes]);

  // Solo cuentan las elegidas que siguen pendientes (tras recargar, las ya pagadas desaparecen de la lista).
  const seleccion = useMemo(() => [...elegidas].map((id) => porId.get(id)).filter((c): c is Compra => !!c), [elegidas, porId]);
  const totalSeleccion = seleccion.reduce((s, c) => s + Math.round(c.total * 100), 0) / 100;

  const alternar = (id: string) => setElegidas((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarGrupo = (lista: Compra[]) => setElegidas((e) => {
    const n = new Set(e);
    const todas = lista.every((c) => n.has(c.id));
    for (const c of lista) { if (todas) n.delete(c.id); else n.add(c.id); }
    return n;
  });

  const pagar = async () => {
    setError('');
    const masReciente = seleccion.reduce((m, c) => (c.fecha > m ? c.fecha : m), '');
    if (!fechaPago) { setError('Indica la fecha de pago.'); return; }
    if (fechaPago < masReciente) { setError(`La fecha de pago no puede ser anterior a la de la factura más reciente (${formatDate(masReciente)}).`); return; }
    if (fechaPago > hoy && diasHasta(fechaPago, hoy) > 2) { setError('La fecha de pago no puede ser futura.'); return; }
    setPagando(true);
    try {
      const n = await marcarPagoComprasLote(seleccion.map((c) => c.id), fechaPago);
      setElegidas(new Set());
      avisarOk(n === 1 ? '1 compra marcada como pagada.' : `${n} compras marcadas como pagadas.`);
      onPagadas();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron marcar como pagadas.');
    } finally {
      setPagando(false);
    }
  };

  const Fila = ({ c }: { c: Compra }) => {
    const d = c.fechaVencimiento ? diasHasta(c.fechaVencimiento, hoy) : null;
    const color = d === null ? 'text-slate-400' : d < 0 ? 'text-rose-600 font-bold' : d <= 7 ? 'text-amber-700 font-semibold' : 'text-slate-500';
    return (
      <div className="flex items-center gap-3 px-4 py-2.5" data-testid="fila-por-pagar">
        <input type="checkbox" checked={elegidas.has(c.id)} onChange={() => alternar(c.id)} aria-label={`Elegir la compra ${c.numero} de ${c.proveedorNombre}`} className="w-4 h-4 cursor-pointer shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">{c.proveedorNombre} <span className="font-normal text-slate-500">· {c.numero}</span></p>
          <p className="text-xs text-slate-400">Factura del {formatDate(c.fecha)}</p>
        </div>
        <p className={`text-xs shrink-0 ${color}`}>{etiquetaVencimiento(c.fechaVencimiento, hoy)}{c.fechaVencimiento && <span className="block text-[10px] font-normal text-slate-400 text-right">{formatDate(c.fechaVencimiento)}</span>}</p>
        <p className="text-sm font-extrabold text-slate-800 w-24 text-right shrink-0">{fmt2(c.total)} €</p>
        <button type="button" onClick={() => onAbrirDetalle(c.id)} title="Ver detalle" aria-label={`Ver la compra ${c.numero}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer shrink-0"><Eye className="w-4 h-4" /></button>
      </div>
    );
  };

  if (cargando) return <p className="text-sm text-slate-400 py-10 text-center">Cargando…</p>;
  if (pendientes.length === 0) {
    return (
      <div className="text-center py-14 text-slate-400" data-testid="nada-por-pagar">
        <CircleDollarSign className="w-9 h-9 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold text-slate-500">No debes nada a tus proveedores</p>
        <p className="text-xs mt-1">Las facturas que registres y dejes pendientes aparecerán aquí, ordenadas por vencimiento.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="por-pagar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600" data-testid="resumen-por-pagar">
          Debes <b className="text-slate-800">{fmt2(totalDeuda)} €</b> en {pendientes.length} {pendientes.length === 1 ? 'factura' : 'facturas'}
          {totalVencido > 0 && <> · <b className="text-rose-600">{fmt2(totalVencido)} € vencidos</b></>}
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Agrupar por">
          {([['vencimiento', 'Por vencimiento'], ['proveedor', 'Por proveedor']] as const).map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={modo === id} onClick={() => setModo(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${modo === id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{texto}</button>
          ))}
        </div>
      </div>

      {modo === 'vencimiento' ? grupos.map((g) => (
        <section key={g.clave} className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid={`grupo-${g.clave}`}>
          <header className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <input type="checkbox" checked={g.compras.every((c) => elegidas.has(c.id))} onChange={() => alternarGrupo(g.compras)} aria-label={`Elegir todas: ${g.titulo}`} className="w-4 h-4 cursor-pointer" />
            <p className={`flex-1 text-xs font-extrabold uppercase tracking-wide ${COLOR_GRUPO[g.clave]}`}>{g.titulo} · {g.compras.length}</p>
            <p className="text-sm font-extrabold text-slate-700">{fmt2(g.total)} €</p>
          </header>
          <div className="divide-y divide-slate-100">{g.compras.map((c) => <Fila key={c.id} c={c} />)}</div>
        </section>
      )) : deudas.map((d) => {
        const suyas = pendientes.filter((c) => c.proveedorId === d.proveedorId).sort((a, b) => (a.fechaVencimiento ?? '9999').localeCompare(b.fechaVencimiento ?? '9999'));
        return (
          <section key={d.proveedorId} className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="grupo-proveedor">
            <header className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <input type="checkbox" checked={suyas.every((c) => elegidas.has(c.id))} onChange={() => alternarGrupo(suyas)} aria-label={`Elegir todas las de ${d.nombre}`} className="w-4 h-4 cursor-pointer" />
              <p className="flex-1 text-sm font-extrabold text-slate-800">{d.nombre} <span className="text-xs font-normal text-slate-400">· {d.facturas} {d.facturas === 1 ? 'factura' : 'facturas'}</span></p>
              {d.vencido > 0 && <p className="text-xs font-bold text-rose-600">{fmt2(d.vencido)} € vencidos</p>}
              <p className="text-sm font-extrabold text-slate-700">{fmt2(d.total)} €</p>
            </header>
            <div className="divide-y divide-slate-100">{suyas.map((c) => <Fila key={c.id} c={c} />)}</div>
          </section>
        );
      })}

      {seleccion.length > 0 && (
        <div className="sticky bottom-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 space-y-2 shadow-md" data-testid="barra-pago">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm font-bold text-emerald-900 min-w-[10rem]">{seleccion.length} {seleccion.length === 1 ? 'seleccionada' : 'seleccionadas'} · {fmt2(totalSeleccion)} €</p>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Pagadas el
              <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={campo} aria-label="Fecha de pago" />
            </label>
            <button type="button" onClick={() => void pagar()} disabled={pagando} data-testid="pagar-seleccion"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer disabled:opacity-60"><Check className="w-4 h-4" /> {pagando ? 'Marcando…' : 'Marcar como pagadas'}</button>
            <button type="button" onClick={() => { setElegidas(new Set()); setError(''); }} className="text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer">Quitar selección</button>
          </div>
          {error && <p role="alert" data-testid="error-pago" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        </div>
      )}
    </div>
  );
}
