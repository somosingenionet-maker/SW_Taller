import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, Check, CircleDollarSign, Eye, FileSpreadsheet, FileText, Image as ImagenIcono, Paperclip, Plus, Search, ShoppingCart, Trash2, Undo2, X } from 'lucide-react';
import type { Cliente, Compra, CompraAdjunto, Empresa, Producto, Proveedor } from '../types';
import { anularCompra, editarDatosCompra, getCompra, listCompras, marcarPagoCompra } from '../lib/data/compras';
import { listProveedores } from '../lib/data/proveedores';
import { avisar, avisarError, avisarOk } from '../lib/avisos';
import { borrarAdjunto, listAdjuntos, subirAdjunto, urlAdjunto } from '../lib/data/comprasAdjuntos';
import { abrirEnPestana } from '../utils/whatsapp';
import { cabenArchivos, esImagen, formatoTamano, MAX_ADJUNTOS, validarArchivoFactura } from '../utils/adjuntos';
import { estadoVisible, hoyIso, resumenPagos, type EstadoVisible } from '../utils/compras';
import { periodoAño, periodoMes, periodoTrimestre } from '../utils/gestoria';
import { fmt2 } from '../utils/moneda';
import { formatDate } from '../utils/dateFormat';
import ConfirmDialog from './ConfirmDialog';
import CompraForm from './CompraForm';
import ProveedoresPanel from './ProveedoresPanel';
import PorPagar from './PorPagar';

const ExportarGestoria = lazy(() => import('./ExportarGestoria'));

const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';

type Periodo = 'mes' | 'trimestre' | 'año' | 'añoPasado' | 'todo';
const PERIODOS: { id: Periodo; texto: string }[] = [
  { id: 'mes', texto: 'Este mes' }, { id: 'trimestre', texto: 'Este trimestre' }, { id: 'año', texto: 'Este año' }, { id: 'añoPasado', texto: 'Año pasado' }, { id: 'todo', texto: 'Todo' },
];
function rangoDe(p: Periodo, hoy: Date): { desde?: string; hastaExcluido?: string } {
  const a = hoy.getFullYear();
  if (p === 'mes') { const r = periodoMes(a, hoy.getMonth() + 1); return { desde: r.desde, hastaExcluido: r.hasta }; }
  if (p === 'trimestre') { const r = periodoTrimestre(a, (Math.floor(hoy.getMonth() / 3) + 1) as 1 | 2 | 3 | 4); return { desde: r.desde, hastaExcluido: r.hasta }; }
  if (p === 'año') { const r = periodoAño(a); return { desde: r.desde, hastaExcluido: r.hasta }; }
  if (p === 'añoPasado') { const r = periodoAño(a - 1); return { desde: r.desde, hastaExcluido: r.hasta }; }
  return {};
}

const ESTADO_UI: Record<EstadoVisible, { texto: string; clase: string }> = {
  pendiente: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-700' },
  vencida: { texto: 'Vencida', clase: 'bg-rose-50 text-rose-700' },
  pagada: { texto: 'Pagada', clase: 'bg-emerald-50 text-emerald-700' },
  anulada: { texto: 'Anulada', clase: 'bg-slate-200 text-slate-500' },
};

interface Props {
  productos: Producto[];
  /** Tras guardar o anular una compra con productos, el inventario ha cambiado: recargarlo. */
  onStockCambiado: () => void | Promise<void>;
  /** Para la exportación a la gestoría (nombre y NIF del taller, y nombres de clientes de facturas antiguas). */
  empresa: Empresa;
  clientes: Cliente[];
  puedeFacturas: boolean;
  /** Vista con la que se abre (Inicio enlaza directo a «Por pagar»). */
  vistaInicial?: 'compras' | 'porpagar';
  /** Cambió algo que afecta a lo que se debe (guardar, pagar, anular…): refrescar los avisos de fuera. */
  onPagosCambiados?: () => void;
}

export default function ComprasTab({ productos, onStockCambiado, empresa, clientes, puedeFacturas, vistaInicial = 'compras', onPagosCambiados }: Props) {
  const [vista, setVista] = useState<'compras' | 'porpagar' | 'proveedores'>(vistaInicial);
  const [periodo, setPeriodo] = useState<Periodo>('trimestre');
  const [estado, setEstado] = useState<'todas' | EstadoVisible>('todas');
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [buscar, setBuscar] = useState('');
  const [compras, setCompras] = useState<Compra[]>([]);
  const [pendientes, setPendientes] = useState<Compra[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargandoProv, setCargandoProv] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const hoy = hoyIso();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, deuda] = await Promise.all([
        listCompras(rangoDe(periodo, new Date())),
        // Lo que se debe no depende del periodo que estés mirando: todas las pendientes.
        listCompras({ estado: 'pendiente', limite: 1000 }).then((r) => r.compras),
      ]);
      setCompras(lista.compras); setHayMas(lista.hayMas); setPendientes(deuda);
    } catch (e) {
      avisarError(e, 'No se pudieron cargar las compras.');
    } finally {
      setCargando(false);
    }
  }, [periodo]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => {
    listProveedores().then(setProveedores).catch((e) => avisarError(e, 'No se pudieron cargar los proveedores.')).finally(() => setCargandoProv(false));
  }, []);

  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return compras.filter((c) =>
      (estado === 'todas' || estadoVisible(c, hoy) === estado) && (!proveedorFiltro || c.proveedorId === proveedorFiltro)
      && (!t || c.numero.toLowerCase().includes(t) || c.proveedorNombre.toLowerCase().includes(t)));
  }, [compras, estado, proveedorFiltro, buscar, hoy]);

  const deuda = useMemo(() => resumenPagos(pendientes, hoy), [pendientes, hoy]);
  const totalPeriodo = useMemo(() => visibles.filter((c) => c.estado !== 'anulada').reduce((s, c) => s + Math.round(c.total * 100), 0) / 100, [visibles]);

  return (
    <div className="space-y-5" data-testid="compras-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-blue-600" /> Compras y proveedores</h2>
          <p className="text-xs text-slate-500">Las facturas que te mandan tus proveedores: lo que se debe, el IVA soportado y el stock que entra.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setExportando(true)} data-testid="compras-exportar-gestoria"
            className="flex items-center gap-1.5 px-3 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-bold rounded-xl cursor-pointer"><FileSpreadsheet className="w-4 h-4" /> Para la gestoría</button>
          <button onClick={() => setNueva(true)} data-testid="nueva-compra"
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl cursor-pointer"><Plus className="w-4 h-4" /> Nueva compra</button>
        </div>
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Compras o proveedores">
        {([['compras', 'Compras'], ['porpagar', `Por pagar${pendientes.length > 0 ? ` (${pendientes.length})` : ''}`], ['proveedores', 'Proveedores']] as const).map(([id, texto]) => (
          <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border cursor-pointer ${vista === id ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{texto}</button>
        ))}
      </div>

      {vista === 'proveedores' ? (
        <ProveedoresPanel proveedores={proveedores} cargando={cargandoProv} onCambio={setProveedores} />
      ) : vista === 'porpagar' ? (
        <PorPagar pendientes={pendientes} cargando={cargando} hoy={hoy} onAbrirDetalle={setDetalle} onPagadas={() => { void cargar(); onPagosCambiados?.(); }} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="resumen-compras">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pendiente de pagar</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1" data-testid="total-pendiente">{fmt2(deuda.pendiente)} €</p>
              <p className="text-xs text-slate-400">{deuda.cuantasPendientes} {deuda.cuantasPendientes === 1 ? 'factura' : 'facturas'}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${deuda.cuantasVencidas > 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${deuda.cuantasVencidas > 0 ? 'text-rose-500' : 'text-slate-400'}`}>Vencido</p>
              <p className={`text-xl font-extrabold mt-1 ${deuda.cuantasVencidas > 0 ? 'text-rose-700' : 'text-slate-800'}`} data-testid="total-vencido">{fmt2(deuda.vencido)} €</p>
              <p className={`text-xs ${deuda.cuantasVencidas > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{deuda.cuantasVencidas} {deuda.cuantasVencidas === 1 ? 'factura' : 'facturas'} fuera de plazo</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Comprado (lo que ves abajo)</p>
              <p className="text-xl font-extrabold text-slate-800 mt-1">{fmt2(totalPeriodo)} €</p>
              <p className="text-xs text-slate-400">Con IVA, sin las anuladas</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por proveedor o nº de factura…" aria-label="Buscar compra" className={`${campo} w-full pl-9`} />
            </div>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={campo} aria-label="Periodo">{PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}</select>
            <select value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} className={campo} aria-label="Estado">
              <option value="todas">Todos los estados</option><option value="pendiente">Pendientes</option><option value="vencida">Vencidas</option><option value="pagada">Pagadas</option><option value="anulada">Anuladas</option>
            </select>
            <select value={proveedorFiltro} onChange={(e) => setProveedorFiltro(e.target.value)} className={campo} aria-label="Proveedor">
              <option value="">Todos los proveedores</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {cargando ? <p className="text-sm text-slate-400 py-10 text-center">Cargando compras…</p>
            : visibles.length === 0 ? (
              <div className="text-center py-14 text-slate-400">
                <CircleDollarSign className="w-9 h-9 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-500">{compras.length === 0 ? 'No hay compras en este periodo' : 'Ninguna compra coincide con los filtros'}</p>
                {compras.length === 0 && <p className="text-xs mt-1">Registra la factura de un proveedor con «Nueva compra».</p>}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2.5 font-bold">Fecha</th><th className="px-3 py-2.5 font-bold">Proveedor</th><th className="px-3 py-2.5 font-bold">Nº factura</th>
                    <th className="px-3 py-2.5 font-bold text-right">Total</th><th className="px-3 py-2.5 font-bold">Estado</th><th className="px-3 py-2.5" />
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibles.map((c) => {
                      const ev = estadoVisible(c, hoy);
                      return (
                        <tr key={c.id} className={c.estado === 'anulada' ? 'opacity-60' : ''} data-testid="fila-compra">
                          <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{formatDate(c.fecha)}</td>
                          <td className="px-3 py-2.5 font-bold text-slate-800">{c.proveedorNombre}</td>
                          <td className="px-3 py-2.5 text-slate-600">{c.numero}{(c.numAdjuntos ?? 0) > 0 && <Paperclip className="inline w-3.5 h-3.5 ml-1.5 text-slate-400" aria-label="Tiene factura adjunta" data-testid="compra-con-adjunto" />}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-800 whitespace-nowrap">{fmt2(c.total)} €</td>
                          <td className="px-3 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_UI[ev].clase}`}>{ESTADO_UI[ev].texto}</span>
                            {ev === 'vencida' && c.fechaVencimiento && <span className="block text-[10px] text-rose-500 mt-0.5">desde el {formatDate(c.fechaVencimiento)}</span>}</td>
                          <td className="px-3 py-2.5 text-right"><button onClick={() => setDetalle(c.id)} title="Ver detalle" aria-label={`Ver la compra ${c.numero}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer"><Eye className="w-4 h-4" /></button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          {hayMas && <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Hay más compras de las que se muestran: elige un periodo más corto.</p>}
        </>
      )}

      {exportando && (
        <Suspense fallback={null}>
          <ExportarGestoria empresa={empresa} clientes={clientes} puedeFacturas={puedeFacturas} puedeCompras onClose={() => setExportando(false)} />
        </Suspense>
      )}
      {nueva && (
        <CompraForm proveedores={proveedores} productos={productos} empresaId={empresa.id} onProveedorCreado={(p) => setProveedores((ps) => [...ps, p].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))} onClose={() => setNueva(false)}
          onGuardada={(tocaStock, fallidos) => {
            setNueva(false); void cargar(); onPagosCambiados?.(); if (tocaStock) void onStockCambiado();
            if (fallidos.length === 0) avisarOk('Compra registrada.');
            else avisar({ tipo: 'error', mensaje: `La compra se guardó, pero ${fallidos.join(' ')} Ábrela y adjunta el archivo de nuevo.` });
          }} />
      )}
      {detalle && (
        <CompraDetalle id={detalle} hoy={hoy} empresaId={empresa.id} onClose={() => setDetalle(null)}
          onCambio={(tocaStock) => { void cargar(); onPagosCambiados?.(); if (tocaStock) void onStockCambiado(); }} />
      )}
    </div>
  );
}

function CompraDetalle({ id, hoy, empresaId, onClose, onCambio }: { id: string; hoy: string; empresaId: string; onClose: () => void; onCambio: (tocaStock: boolean) => void }) {
  const [c, setC] = useState<Compra | null>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({ numero: '', fecha: '', fechaVencimiento: '', notas: '' });
  const [fechaPago, setFechaPago] = useState(hoy);
  const [anular, setAnular] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    try { setC(await getCompra(id)); } catch (e) { avisarError(e, 'No se pudo abrir la compra.'); onClose(); }
  }, [id, onClose]);
  useEffect(() => { void recargar(); }, [recargar]);

  const ejecutar = async (accion: () => Promise<void>, ok: string, tocaStock = false) => {
    setOcupado(true); setError('');
    try { await accion(); avisarOk(ok); await recargar(); onCambio(tocaStock); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción.'); return false; }
    finally { setOcupado(false); }
  };

  if (!c) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"><div className="animate-spin w-8 h-8 border-[3px] border-slate-200 border-t-slate-500 rounded-full" /></div>;
  const ev = estadoVisible(c, hoy);
  const abierta = c.estado !== 'anulada';
  const tieneProductos = (c.lineas ?? []).some((l) => l.productoId);
  const porIva = new Map<number, number>();
  for (const l of c.lineas ?? []) porIva.set(l.ivaPct, (porIva.get(l.ivaPct) ?? 0) + Math.round(l.subtotal * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label={`Compra ${c.numero}`}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto animate-modal-pop p-6 space-y-4" data-testid="compra-detalle">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-slate-800">{c.proveedorNombre} · {c.numero}</p>
            <p className="text-xs text-slate-500 mt-0.5">Factura del {formatDate(c.fecha)}{c.fechaVencimiento ? ` · vence el ${formatDate(c.fechaVencimiento)}` : ''}{c.estado === 'pagada' && c.fechaPago ? ` · pagada el ${formatDate(c.fechaPago)}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_UI[ev].clase}`} data-testid="detalle-estado">{ESTADO_UI[ev].texto}</span>
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
              <th className="px-3 py-2 font-bold">Descripción</th><th className="px-2 py-2 font-bold text-right">Cant.</th><th className="px-2 py-2 font-bold text-right">Precio</th><th className="px-2 py-2 font-bold text-right">IVA</th><th className="px-3 py-2 font-bold text-right">Importe</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {(c.lineas ?? []).map((l) => (
                <tr key={l.id}><td className="px-3 py-2 text-slate-700">{l.descripcion}{l.productoId && <span className="ml-1.5 text-[10px] font-bold text-blue-600">Inventario</span>}</td>
                  <td className="px-2 py-2 text-right text-slate-600">{fmt2(l.cantidad)}</td><td className="px-2 py-2 text-right text-slate-600">{fmt2(l.precioUnitario)} €</td>
                  <td className="px-2 py-2 text-right text-slate-600">{String(l.ivaPct).replace('.', ',')} %</td><td className="px-3 py-2 text-right font-bold text-slate-800">{fmt2(l.subtotal)} €</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1 text-sm">
          <div className="flex justify-between text-slate-600"><span>Base imponible</span><span>{fmt2(c.base)} €</span></div>
          <div className="flex justify-between text-slate-600"><span>IVA{porIva.size > 1 ? ` (${[...porIva.keys()].sort((a, b) => b - a).join(' % · ')} %)` : ''}</span><span>{fmt2(c.iva)} €</span></div>
          <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-200 pt-1"><span>Total</span><span>{fmt2(c.total)} €</span></div>
        </div>
        {c.notas && <p className="text-xs text-slate-500 whitespace-pre-wrap"><span className="font-bold">Notas: </span>{c.notas}</p>}

        <AdjuntosCompra compraId={c.id} empresaId={empresaId} puedeCambiar={abierta} onCambio={() => onCambio(false)} />

        {editando && (
          <div className="rounded-2xl border border-slate-200 p-4 space-y-3" data-testid="editar-datos">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Corregir datos</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-xs font-semibold text-slate-600">Nº de factura<input className={`${campo} w-full mt-1`} value={borrador.numero} onChange={(e) => setBorrador({ ...borrador, numero: e.target.value })} aria-label="Número de factura" /></label>
              <label className="text-xs font-semibold text-slate-600">Fecha<input type="date" className={`${campo} w-full mt-1`} value={borrador.fecha} onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} aria-label="Fecha de la factura" /></label>
              <label className="text-xs font-semibold text-slate-600">Vencimiento<input type="date" className={`${campo} w-full mt-1`} value={borrador.fechaVencimiento} onChange={(e) => setBorrador({ ...borrador, fechaVencimiento: e.target.value })} aria-label="Vencimiento" /></label>
              <label className="sm:col-span-3 text-xs font-semibold text-slate-600">Notas<textarea rows={2} className={`${campo} w-full mt-1`} value={borrador.notas} onChange={(e) => setBorrador({ ...borrador, notas: e.target.value })} aria-label="Notas" /></label>
            </div>
            <p className="text-[11px] text-slate-400">Para cambiar importes o líneas, anula la compra y vuelve a registrarla: así el stock y el IVA quedan siempre cuadrados.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditando(false)} className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">Cancelar</button>
              <button disabled={ocupado} data-testid="guardar-datos" onClick={async () => { if (await ejecutar(() => editarDatosCompra(c.id, borrador), 'Datos guardados.')) setEditando(false); }}
                className="px-3 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60">Guardar</button>
            </div>
          </div>
        )}

        {error && <p role="alert" data-testid="error-detalle" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
        {abierta && !editando && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {c.estado === 'pendiente' ? (
              <>
                <input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} className={`${campo} !py-1.5`} aria-label="Fecha de pago" />
                <button disabled={ocupado} onClick={() => void ejecutar(() => marcarPagoCompra(c.id, fechaPago), 'Marcada como pagada.')} data-testid="marcar-pagada"
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl cursor-pointer disabled:opacity-60"><Check className="w-3.5 h-3.5" /> Marcar pagada</button>
              </>
            ) : (
              <button disabled={ocupado} onClick={() => void ejecutar(() => marcarPagoCompra(c.id, null), 'Vuelve a estar pendiente.')} data-testid="marcar-pendiente"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer disabled:opacity-60"><Undo2 className="w-3.5 h-3.5" /> Marcar pendiente</button>
            )}
            <button onClick={() => { setBorrador({ numero: c.numero, fecha: c.fecha, fechaVencimiento: c.fechaVencimiento ?? '', notas: c.notas ?? '' }); setEditando(true); setError(''); }} data-testid="corregir-datos"
              className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-xl cursor-pointer">Corregir datos</button>
            <button onClick={() => setAnular(true)} data-testid="anular-compra"
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 border border-rose-200 hover:bg-rose-50 rounded-xl cursor-pointer"><Ban className="w-3.5 h-3.5" /> Anular</button>
          </div>
        )}
        <ConfirmDialog isOpen={anular} title="Anular compra"
          message={`¿Anular la compra ${c.numero} de ${c.proveedorNombre}? Dejará de contar en lo que debes y en el IVA soportado.${tieneProductos ? ' Las unidades que entraron al inventario se restarán del stock (el coste de los productos no se toca).' : ''} Podrás volver a registrar la factura si te equivocaste.`}
          confirmLabel="Anular compra" onCancel={() => setAnular(false)}
          onConfirm={() => { setAnular(false); void ejecutar(() => anularCompra(c.id), 'Compra anulada.', tieneProductos); }} />
      </div>
    </div>
  );
}

/** Los archivos de una compra (la factura del proveedor): ver, quitar y añadir. */
function AdjuntosCompra({ compraId, empresaId, puedeCambiar, onCambio }: { compraId: string; empresaId: string; puedeCambiar: boolean; onCambio: () => void }) {
  const [lista, setLista] = useState<CompraAdjunto[] | null>(null);
  const [subiendo, setSubiendo] = useState('');
  const [error, setError] = useState('');
  const [aQuitar, setAQuitar] = useState<CompraAdjunto | null>(null);
  const selector = useCallback((el: HTMLInputElement | null) => { if (el) el.value = ''; }, []);

  const recargar = useCallback(async () => {
    try { setLista(await listAdjuntos(compraId)); } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los archivos.'); setLista([]); }
  }, [compraId]);
  useEffect(() => { void recargar(); }, [recargar]);

  const anadir = async (elegidos: File[]) => {
    if (elegidos.length === 0) return;
    setError('');
    const { caben, sobran } = cabenArchivos(lista?.length ?? 0, elegidos.length);
    const fallos: string[] = [];
    if (sobran > 0) fallos.push(`Como máximo ${MAX_ADJUNTOS} archivos por compra: se han quedado fuera ${sobran}.`);
    for (const [i, f] of elegidos.slice(0, caben).entries()) {
      const problema = validarArchivoFactura(f);
      if (problema) { fallos.push(problema); continue; }
      setSubiendo(`Subiendo ${i + 1} de ${caben}…`);
      try { await subirAdjunto(empresaId, compraId, f); } catch (e) { fallos.push(e instanceof Error ? e.message : `No se pudo subir «${f.name}».`); }
    }
    setSubiendo('');
    if (fallos.length) setError(fallos.join(' '));
    await recargar(); onCambio();
  };

  const ver = async (a: CompraAdjunto) => {
    try {
      const r = await abrirEnPestana(() => urlAdjunto(a.ruta));
      if (r === 'bloqueado') setError('El navegador ha bloqueado la ventana: permite las ventanas emergentes para ver la factura.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el archivo.'); }
  };
  const quitar = async () => {
    if (!aQuitar) return;
    try { await borrarAdjunto(aQuitar); avisarOk('Archivo quitado.'); await recargar(); onCambio(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar el archivo.'); }
    finally { setAQuitar(null); }
  };

  return (
    <div className="space-y-2" data-testid="adjuntos-compra">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Factura del proveedor</p>
        {puedeCambiar && (
          <label className={`flex items-center gap-1.5 text-xs font-bold cursor-pointer ${subiendo ? 'text-slate-400' : 'text-blue-600 hover:text-blue-700'}`}>
            <Paperclip className="w-3.5 h-3.5" /> {subiendo || 'Adjuntar PDF o foto'}
            <input ref={selector} type="file" multiple accept="application/pdf,image/*,.pdf" className="hidden" disabled={!!subiendo || (lista?.length ?? 0) >= MAX_ADJUNTOS}
              data-testid="adjuntar-archivo" aria-label="Adjuntar archivos a la compra"
              onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ''; void anadir(f); }} />
          </label>
        )}
      </div>
      {lista === null ? <p className="text-xs text-slate-400">Cargando…</p>
        : lista.length === 0 ? <p className="text-xs text-slate-400">{puedeCambiar ? 'Sin archivos. Adjunta el PDF o una foto de la factura para tenerla a mano.' : 'Sin archivos.'}</p>
        : lista.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" data-testid="adjunto">
            {esImagen(a.tipo) ? <ImagenIcono className="w-4 h-4 text-slate-400 shrink-0" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0" />}
            <button type="button" onClick={() => void ver(a)} className="flex-1 truncate text-left font-semibold text-slate-700 hover:text-blue-600 cursor-pointer" title="Abrir en una pestaña nueva">{a.nombre}</button>
            <span className="text-[11px] text-slate-400 shrink-0">{formatoTamano(a.tamano)} · {formatDate(a.subidoEn.slice(0, 10))}</span>
            {puedeCambiar && <button type="button" onClick={() => setAQuitar(a)} aria-label={`Quitar ${a.nombre}`} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
          </div>
        ))}
      {error && <p role="alert" data-testid="error-adjuntos" className="text-xs font-semibold text-rose-600">{error}</p>}
      <p className="text-[11px] text-slate-400">Se conservan mientras exista la compra: la ley pide guardar las facturas recibidas varios años.</p>
      <ConfirmDialog isOpen={!!aQuitar} title="Quitar archivo" message={`¿Quitar «${aQuitar?.nombre ?? ''}» de esta compra? Se borrará del almacenamiento.`} confirmLabel="Quitar" onCancel={() => setAQuitar(null)} onConfirm={() => void quitar()} />
    </div>
  );
}
