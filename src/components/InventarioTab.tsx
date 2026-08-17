import { useState, useMemo, useEffect } from 'react';
import { Producto, MovimientoStock } from '../types';
import { listMovimientos, NuevoMovimiento } from '../lib/data/productos';
import {
  Package, Search, Plus, Edit2, Trash2, X, Check, AlertTriangle, History, PackagePlus, ArrowUpCircle, SlidersHorizontal
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';

interface InventarioTabProps {
  productos: Producto[];
  onAddProducto: (p: Producto, stockInicial: number) => Promise<Producto>;
  onUpdateProducto: (p: Producto) => void | Promise<void>;
  onDeleteProducto: (id: string) => void | Promise<void>;
  onRegistrarMovimiento: (m: NuevoMovimiento) => void | Promise<void>;
}

interface FormState {
  nombre: string;
  descripcion: string;
  sku: string;
  precioVenta: string;
  costo: string;
  stockMinimo: string;
  stockInicial: string;
  unidad: string;
  activo: boolean;
}

const EMPTY_FORM: FormState = {
  nombre: '', descripcion: '', sku: '', precioVenta: '', costo: '',
  stockMinimo: '0', stockInicial: '0', unidad: 'unidad', activo: true,
};

const UNIDADES = ['unidad', 'litro', 'kg', 'metro', 'caja'];

export default function InventarioTab({ productos, onAddProducto, onUpdateProducto, onDeleteProducto, onRegistrarMovimiento }: InventarioTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [soloStockBajo, setSoloStockBajo] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Producto | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [movimientoProducto, setMovimientoProducto] = useState<Producto | null>(null);
  const [historialProducto, setHistorialProducto] = useState<Producto | null>(null);

  const bajoStock = (p: Producto) => p.stockActual <= p.stockMinimo;

  const filtrados = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return productos
      .filter(p => !term || p.nombre.toLowerCase().includes(term) || (p.sku ?? '').toLowerCase().includes(term))
      .filter(p => !soloStockBajo || bajoStock(p));
  }, [productos, searchTerm, soloStockBajo]);

  const totalStockBajo = useMemo(() => productos.filter(bajoStock).length, [productos]);
  const valorInventario = useMemo(() => productos.reduce((sum, p) => sum + p.stockActual * p.costo, 0), [productos]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (p: Producto) => {
    setForm({
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      sku: p.sku ?? '',
      precioVenta: String(p.precioVenta),
      costo: String(p.costo),
      stockMinimo: String(p.stockMinimo),
      stockInicial: '0',
      unidad: p.unidad,
      activo: p.activo,
    });
    setEditingId(p.id);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return; }
    const precioVenta = Number(form.precioVenta) || 0;
    const costo = Number(form.costo) || 0;
    const stockMinimo = Number(form.stockMinimo) || 0;

    setSaving(true);
    try {
      const producto: Producto = {
        id: editingId ?? '',
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        sku: form.sku.trim() || undefined,
        precioVenta,
        costo,
        stockActual: 0,
        stockMinimo,
        unidad: form.unidad,
        activo: form.activo,
      };
      if (editingId) {
        await onUpdateProducto(producto);
      } else {
        await onAddProducto(producto, Number(form.stockInicial) || 0);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    const producto = confirmDelete;
    setDeleteError('');
    try {
      await onDeleteProducto(producto.id);
      setConfirmDelete(null);
    } catch {
      setDeleteError(`No se puede eliminar "${producto.nombre}": ya se ha usado en alguna orden de trabajo. Puedes desactivarlo en su lugar.`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Productos</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{productos.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Stock bajo</p>
          <p className={`text-2xl font-bold mt-1 ${totalStockBajo > 0 ? 'text-rose-600' : 'text-slate-800'}`}>{totalStockBajo}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Valor de inventario</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{valorInventario.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={() => setSoloStockBajo((v) => !v)}
          className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
            soloStockBajo ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> Solo stock bajo
        </button>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>
      </div>

      {/* Table */}
      {filtrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
          <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">{productos.length === 0 ? 'Aún no hay productos en el catálogo.' : 'Sin resultados para este filtro.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Precio venta</th>
                <th className="px-4 py-3">Costo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{p.nombre}</p>
                    {p.sku && <p className="text-[11px] text-slate-400 font-mono">{p.sku}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bajoStock(p) ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>
                      {p.stockActual} {p.unidad}
                    </span>
                    {bajoStock(p) && <span className="block text-[10px] text-rose-500 mt-0.5">Mínimo: {p.stockMinimo}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.precioVenta.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  <td className="px-4 py-3 text-slate-500">{p.costo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setHistorialProducto(p)} title="Historial de movimientos" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setMovimientoProducto(p)} title="Registrar entrada / ajustar stock" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer">
                        <PackagePlus className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEdit(p)} title="Editar" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setConfirmDelete(p); setDeleteError(''); }} title="Eliminar" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Crear / editar producto */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden border-l border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white">
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm tracking-tight">{editingId ? 'Editar producto' : 'Nuevo producto'}</span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-800 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Filtro de aceite" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                <input type="text" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">SKU / referencia</label>
                <input type="text" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Precio venta €</label>
                  <input type="number" min="0" step="0.01" value={form.precioVenta} onChange={(e) => setForm((f) => ({ ...f, precioVenta: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Costo €</label>
                  <input type="number" min="0" step="0.01" value={form.costo} onChange={(e) => setForm((f) => ({ ...f, costo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Stock mínimo</label>
                  <input type="number" min="0" step="1" value={form.stockMinimo} onChange={(e) => setForm((f) => ({ ...f, stockMinimo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Unidad</label>
                  <select value={form.unidad} onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {!editingId && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Stock inicial</label>
                  <input type="number" min="0" step="1" value={form.stockInicial} onChange={(e) => setForm((f) => ({ ...f, stockInicial: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <p className="text-[10px] text-slate-400 mt-1">Se registra como movimiento de "Alta inicial de inventario".</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}
                  className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${form.activo ? 'bg-green-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.activo ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                <label className="text-xs font-semibold text-slate-600">Activo</label>
              </div>

              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">{formError}</div>
              )}

              <button onClick={handleSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition cursor-pointer disabled:opacity-60">
                <Check className="w-4 h-4" />
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear producto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {movimientoProducto && (
        <MovimientoModal
          producto={movimientoProducto}
          onClose={() => setMovimientoProducto(null)}
          onRegistrar={onRegistrarMovimiento}
        />
      )}

      {historialProducto && (
        <HistorialModal producto={historialProducto} onClose={() => setHistorialProducto(null)} />
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Eliminar producto"
        message={deleteError || `Se eliminará "${confirmDelete?.nombre}" del catálogo. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => { setConfirmDelete(null); setDeleteError(''); }}
      />
    </div>
  );
}

interface MovimientoModalProps {
  producto: Producto;
  onClose: () => void;
  onRegistrar: (m: NuevoMovimiento) => void | Promise<void>;
}

function MovimientoModal({ producto, onClose, onRegistrar }: MovimientoModalProps) {
  const [tipo, setTipo] = useState<'entrada' | 'ajuste'>('entrada');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    const n = Number(cantidad);
    if (!n || (tipo === 'entrada' && n <= 0)) { setError('Introduce una cantidad válida.'); return; }
    setSaving(true);
    try {
      await onRegistrar({ productoId: producto.id, tipo, cantidad: n, motivo: motivo.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el movimiento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Ajustar stock — {producto.nombre}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">Stock actual: <span className="font-semibold text-slate-700">{producto.stockActual} {producto.unidad}</span></p>

        <div className="flex gap-2">
          <button onClick={() => setTipo('entrada')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${tipo === 'entrada' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-slate-500 border-slate-200'}`}>
            <ArrowUpCircle className="w-3.5 h-3.5" /> Entrada
          </button>
          <button onClick={() => setTipo('ajuste')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${tipo === 'ajuste' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-white text-slate-500 border-slate-200'}`}>
            <SlidersHorizontal className="w-3.5 h-3.5" /> Ajuste
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">
            Cantidad {tipo === 'ajuste' && '(negativa para restar)'}
          </label>
          <input type="number" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder={tipo === 'entrada' ? 'ej. 10' : 'ej. -2'} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo</label>
          <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Compra a proveedor, recuento físico..." />
        </div>

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">{error}</div>}

        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition cursor-pointer disabled:opacity-60">
          <Check className="w-4 h-4" /> {saving ? 'Guardando…' : 'Registrar movimiento'}
        </button>
      </div>
    </div>
  );
}

const MOVIMIENTO_LABEL: Record<MovimientoStock['tipo'], string> = {
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste',
};
const MOVIMIENTO_COLOR: Record<MovimientoStock['tipo'], string> = {
  entrada: 'bg-green-100 text-green-700', salida: 'bg-rose-100 text-rose-700', ajuste: 'bg-amber-100 text-amber-700',
};

function HistorialModal({ producto, onClose }: { producto: Producto; onClose: () => void }) {
  const [movimientos, setMovimientos] = useState<MovimientoStock[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listMovimientos(producto.id).then(setMovimientos).catch((err) => setError(err instanceof Error ? err.message : 'Error cargando el historial.'));
  }, [producto.id]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden border-l border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white">
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm tracking-tight">Historial — {producto.nombre}</span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-2">
          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">{error}</div>}
          {movimientos === null && !error && <p className="text-xs text-slate-400 text-center py-6">Cargando…</p>}
          {movimientos?.length === 0 && <p className="text-xs text-slate-400 text-center py-6">Sin movimientos todavía.</p>}
          {movimientos?.map((m) => (
            <div key={m.id} className="border border-slate-200 rounded-xl px-4 py-3 flex items-start justify-between gap-2">
              <div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MOVIMIENTO_COLOR[m.tipo]}`}>{MOVIMIENTO_LABEL[m.tipo]}</span>
                {m.motivo && <p className="text-xs text-slate-600 mt-1">{m.motivo}</p>}
                <p className="text-[10px] text-slate-400 mt-0.5">{new Date(m.createdAt).toLocaleString('es-ES')}</p>
              </div>
              <span className={`text-sm font-bold shrink-0 ${m.tipo === 'salida' ? 'text-rose-600' : 'text-green-600'}`}>
                {m.tipo === 'salida' ? '−' : '+'}{m.cantidad}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
