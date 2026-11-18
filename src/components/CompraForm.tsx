import { useMemo, useState } from 'react';
import { useRef } from 'react';
import { Check, FileText, Image as ImagenIcono, Paperclip, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type { Producto, Proveedor } from '../types';
import { guardarCompra } from '../lib/data/compras';
import { subirAdjunto } from '../lib/data/comprasAdjuntos';
import { cabenArchivos, esImagen, formatoTamano, MAX_ADJUNTOS, tipoDeArchivo, validarArchivoFactura } from '../utils/adjuntos';
import { calcularCompra, TIPOS_IVA, validarCompra, vencimientoSugerido } from '../utils/compras';
import { fmt2 } from '../utils/moneda';
import { ProveedorFormModal } from './ProveedoresPanel';

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

interface LineaForm { clave: number; productoId: string; descripcion: string; cantidad: string; precio: string; ivaPct: number }
let siguienteClave = 1;
const lineaNueva = (ivaPct = 21): LineaForm => ({ clave: siguienteClave++, productoId: '', descripcion: '', cantidad: '1', precio: '', ivaPct });
const num = (t: string) => { const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : 0; };

interface Props {
  proveedores: Proveedor[];
  productos: Producto[];
  /** Proveedor ya elegido (al registrar desde su ficha). */
  proveedorInicial?: string;
  onProveedorCreado: (p: Proveedor) => void;
  /** Para guardar la carpeta de los archivos (`<empresa>/<compra>/…`). */
  empresaId: string;
  /** `tocaStock`: alguna línea llevaba producto, así que el inventario cambió. `archivosFallidos`: lo que no se pudo subir (la compra sí se guardó). */
  onGuardada: (tocaStock: boolean, archivosFallidos: string[]) => void;
  onClose: () => void;
}

/** Ventana «Nueva compra»: proveedor, número y fechas, líneas (con o sin producto del inventario) y pago. */
export default function CompraForm({ proveedores, productos, proveedorInicial, onProveedorCreado, empresaId, onGuardada, onClose }: Props) {
  const activos = useMemo(() => proveedores.filter((p) => p.activo), [proveedores]);
  const productosActivos = useMemo(() => productos.filter((p) => p.activo), [productos]);
  const [proveedorId, setProveedorId] = useState(proveedorInicial ?? '');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [vencimiento, setVencimiento] = useState('');
  const [venceTocado, setVenceTocado] = useState(false);
  const [notas, setNotas] = useState('');
  const [pagada, setPagada] = useState(false);
  const [fechaPago, setFechaPago] = useState(hoyIso());
  const [actualizarCoste, setActualizarCoste] = useState(true);
  const [lineas, setLineas] = useState<LineaForm[]>([lineaNueva()]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [errorArchivos, setErrorArchivos] = useState('');
  const [progreso, setProgreso] = useState('');
  const selector = useRef<HTMLInputElement>(null);

  const proveedor = proveedores.find((p) => p.id === proveedorId);
  const calculo = useMemo(() => calcularCompra(lineas.map((l) => ({ cantidad: num(l.cantidad), precioUnitario: num(l.precio), ivaPct: l.ivaPct }))), [lineas]);
  const hayProductos = lineas.some((l) => l.productoId);

  // El vencimiento se propone con los días de pago del proveedor mientras no se haya tocado a mano.
  const proponerVencimiento = (prov: Proveedor | undefined, f: string) => {
    if (!venceTocado) setVencimiento(prov && f ? vencimientoSugerido(f, prov.diasPago) ?? '' : '');
  };
  const elegirProveedor = (id: string) => { setProveedorId(id); proponerVencimiento(proveedores.find((p) => p.id === id), fecha); };
  const cambiarFecha = (f: string) => { setFecha(f); proponerVencimiento(proveedor, f); };

  const cambiarLinea = (clave: number, cambios: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const elegirProducto = (clave: number, productoId: string) => {
    const p = productos.find((x) => x.id === productoId);
    setLineas((ls) => ls.map((l) => (l.clave !== clave ? l : {
      ...l, productoId, descripcion: p && !l.descripcion.trim() ? p.nombre : l.descripcion, precio: p && !num(l.precio) && p.costo > 0 ? String(p.costo) : l.precio,
    })));
  };

  const elegirArchivos = (lista: FileList | null) => {
    const elegidos = Array.from(lista ?? []);
    if (selector.current) selector.current.value = '';
    if (elegidos.length === 0) return;
    const validos: File[] = [];
    for (const f of elegidos) {
      const p = validarArchivoFactura(f);
      if (p) { setErrorArchivos(p); return; }
      validos.push(f);
    }
    const { caben, sobran } = cabenArchivos(archivos.length, validos.length);
    setArchivos((a) => [...a, ...validos.slice(0, caben)]);
    setErrorArchivos(sobran > 0 ? `Como máximo ${MAX_ADJUNTOS} archivos por compra: se han quedado fuera ${sobran}.` : '');
  };

  const guardar = async () => {
    const problema = validarCompra({
      proveedorId, numero, fecha, fechaVencimiento: vencimiento, pagada, fechaPago,
      lineas: lineas.map((l) => ({ productoId: l.productoId, descripcion: l.descripcion, cantidad: num(l.cantidad), precioUnitario: num(l.precio), ivaPct: l.ivaPct })),
    }, hoyIso());
    if (problema) { setError(problema); return; }
    setGuardando(true); setError('');
    try {
      const id = await guardarCompra({
        proveedorId, numero: numero.trim(), fecha, fechaVencimiento: vencimiento || undefined, notas: notas.trim() || undefined,
        pagada, fechaPago: pagada ? fechaPago : undefined, actualizarCoste: hayProductos && actualizarCoste,
        lineas: lineas.map((l) => ({ productoId: l.productoId || undefined, descripcion: l.descripcion.trim(), cantidad: num(l.cantidad), precioUnitario: num(l.precio), ivaPct: l.ivaPct })),
      });
      // La compra ya está guardada: si algún archivo falla, se avisa pero no se deshace nada (se puede adjuntar después).
      const fallidos: string[] = [];
      for (const [i, f] of archivos.entries()) {
        setProgreso(`Subiendo archivo ${i + 1} de ${archivos.length}…`);
        try { await subirAdjunto(empresaId, id, f); } catch (e) { fallidos.push(e instanceof Error ? e.message : `No se pudo subir «${f.name}».`); }
      }
      onGuardada(hayProductos, fallidos);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la compra.');
    } finally {
      setGuardando(false); setProgreso('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Nueva compra">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto animate-modal-pop p-6 space-y-5" data-testid="compra-form">
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-slate-800">Nueva compra</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600" htmlFor="compra-proveedor">Proveedor *</label>
            <div className="flex gap-2 mt-1">
              <select id="compra-proveedor" value={proveedorId} onChange={(e) => elegirProveedor(e.target.value)} className={campo}>
                <option value="">Elige un proveedor…</option>
                {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.nif ? ` · ${p.nif}` : ''}</option>)}
              </select>
              <button type="button" onClick={() => setNuevoProveedor(true)} data-testid="compra-nuevo-proveedor"
                className="shrink-0 flex items-center gap-1.5 px-3 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl cursor-pointer"><UserPlus className="w-4 h-4" /> Nuevo</button>
            </div>
          </div>
          <label className="text-xs font-semibold text-slate-600">Nº de factura del proveedor *
            <input className={`${campo} mt-1`} value={numero} maxLength={60} onChange={(e) => setNumero(e.target.value)} aria-label="Número de factura del proveedor" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Fecha de la factura *
            <input className={`${campo} mt-1`} type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} aria-label="Fecha de la factura" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Vencimiento
            <input className={`${campo} mt-1`} type="date" value={vencimiento} onChange={(e) => { setVenceTocado(true); setVencimiento(e.target.value); }} aria-label="Vencimiento" />
          </label>
          <div className="flex items-end gap-3 pb-1">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer"><input type="checkbox" checked={pagada} onChange={(e) => setPagada(e.target.checked)} data-testid="compra-pagada" /> Ya está pagada</label>
            {pagada && <input className={`${campo} max-w-[10rem]`} type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} aria-label="Fecha de pago" />}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Líneas</p>
          {lineas.map((l, i) => {
            const sub = calculo.subtotales[i] ?? 0;
            return (
              <div key={l.clave} className="rounded-2xl border border-slate-200 p-3 space-y-2" data-testid="compra-linea">
                <div className="grid grid-cols-12 gap-2">
                  {productosActivos.length > 0 && (
                    <select value={l.productoId} onChange={(e) => elegirProducto(l.clave, e.target.value)} className={`${campo} col-span-12 sm:col-span-4`} aria-label={`Producto de la línea ${i + 1}`}>
                      <option value="">Sin producto (gasto o servicio)</option>
                      {productosActivos.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.sku ? ` · ${p.sku}` : ''}</option>)}
                    </select>
                  )}
                  <input value={l.descripcion} onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })} maxLength={200} placeholder={l.productoId ? 'Descripción (opcional)' : 'Descripción'}
                    className={`${campo} col-span-12 ${productosActivos.length > 0 ? 'sm:col-span-8' : ''}`} aria-label={`Descripción de la línea ${i + 1}`} />
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <input value={l.cantidad} onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })} inputMode="decimal" placeholder="Cant." className={`${campo} col-span-4 sm:col-span-2`} aria-label={`Cantidad de la línea ${i + 1}`} />
                  <input value={l.precio} onChange={(e) => cambiarLinea(l.clave, { precio: e.target.value })} inputMode="decimal" placeholder="Precio (sin IVA)" className={`${campo} col-span-8 sm:col-span-4`} aria-label={`Precio de la línea ${i + 1}`} />
                  <select value={l.ivaPct} onChange={(e) => cambiarLinea(l.clave, { ivaPct: Number(e.target.value) })} className={`${campo} col-span-5 sm:col-span-2`} aria-label={`IVA de la línea ${i + 1}`}>
                    {TIPOS_IVA.map((t) => <option key={t} value={t}>{t} %</option>)}
                  </select>
                  <p className="col-span-5 sm:col-span-3 text-right text-sm font-bold text-slate-700">{fmt2(sub)} €</p>
                  <button type="button" onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : ls))} disabled={lineas.length === 1} aria-label={`Quitar la línea ${i + 1}`}
                    className="col-span-2 sm:col-span-1 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer disabled:opacity-30 justify-self-end"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => setLineas((ls) => [...ls, lineaNueva(ls[ls.length - 1]?.ivaPct ?? 21)])} disabled={lineas.length >= 100} data-testid="compra-anadir-linea"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-40"><Plus className="w-3.5 h-3.5" /> Añadir línea</button>
        </div>

        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-sm" data-testid="compra-totales">
          <div className="flex justify-between text-slate-600"><span>Base imponible</span><span>{fmt2(calculo.base)} €</span></div>
          {calculo.porIva.map((g) => <div key={g.ivaPct} className="flex justify-between text-slate-500 text-xs"><span>IVA {String(g.ivaPct).replace('.', ',')} % sobre {fmt2(g.base)} €</span><span>{fmt2(g.cuota)} €</span></div>)}
          <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-200 pt-1.5"><span>Total</span><span>{fmt2(calculo.total)} €</span></div>
          <p className="text-[11px] text-slate-400 pt-1">El IVA se calcula sobre la base de cada tipo, como en la factura del proveedor. Si tu factura difiere en un céntimo, es un redondeo del proveedor.</p>
        </div>

        <label className="block text-xs font-semibold text-slate-600">Notas
          <textarea className={`${campo} mt-1`} rows={2} value={notas} maxLength={1000} onChange={(e) => setNotas(e.target.value)} aria-label="Notas de la compra" />
        </label>

        <div className="space-y-2" data-testid="compra-archivos">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Factura del proveedor (PDF o foto)</p>
            <button type="button" onClick={() => selector.current?.click()} disabled={archivos.length >= MAX_ADJUNTOS} data-testid="compra-adjuntar"
              className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-40"><Paperclip className="w-3.5 h-3.5" /> Adjuntar</button>
            <input ref={selector} type="file" multiple accept="application/pdf,image/*,.pdf" className="hidden" onChange={(e) => elegirArchivos(e.target.files)} data-testid="compra-archivo" aria-label="Archivos de la factura" />
          </div>
          {archivos.length === 0 && <p className="text-[11px] text-slate-400">Opcional: guarda aquí el documento para encontrarlo cuando la gestoría lo pida. Las fotos se reducen antes de subirlas.</p>}
          {archivos.map((f, i) => (
            <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" data-testid="compra-archivo-elegido">
              {esImagen(tipoDeArchivo(f)) ? <ImagenIcono className="w-4 h-4 text-slate-400 shrink-0" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0" />}
              <span className="flex-1 truncate text-slate-700">{f.name}</span>
              <span className="text-[11px] text-slate-400 shrink-0">{formatoTamano(f.size)}</span>
              <button type="button" onClick={() => setArchivos((a) => a.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          ))}
          {errorArchivos && <p role="alert" data-testid="error-archivos" className="text-xs font-semibold text-amber-700">{errorArchivos}</p>}
        </div>

        {hayProductos && (
          <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={actualizarCoste} onChange={(e) => setActualizarCoste(e.target.checked)} data-testid="compra-actualizar-coste" />
            <span>Poner como coste de cada producto el precio de esta compra. Las unidades se suman al stock en cualquier caso.</span>
          </label>
        )}

        {/* El aviso va junto al botón de guardar, donde se está mirando. */}
        <div className="space-y-2">
          {error && <p role="alert" data-testid="error-compra" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">Cancelar</button>
            <button onClick={() => void guardar()} disabled={guardando} data-testid="guardar-compra"
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60">
              <Check className="w-4 h-4" /> {guardando ? (progreso || 'Guardando…') : 'Registrar compra'}
            </button>
          </div>
        </div>
      </div>
      {nuevoProveedor && <ProveedorFormModal onClose={() => setNuevoProveedor(false)} onGuardado={(p) => { onProveedorCreado(p); setNuevoProveedor(false); elegirProveedor(p.id); }} />}
    </div>
  );
}
