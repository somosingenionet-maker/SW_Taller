import { useState } from 'react';
import { X, Check } from 'lucide-react';
import type { Producto } from '../../types';

interface CrearProductoRapidoModalProps {
  nombreInicial: string;
  onClose: () => void;
  onCreado: (p: Producto) => void;
  onCreateProducto: (p: Producto, stockInicial: number) => Promise<Producto>;
}

export default function CrearProductoRapidoModal({ nombreInicial, onClose, onCreado, onCreateProducto }: CrearProductoRapidoModalProps) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [precioVenta, setPrecioVenta] = useState('');
  const [costo, setCosto] = useState('');
  const [stockInicial, setStockInicial] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError('');
    if (!nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      const creado = await onCreateProducto(
        {
          id: '', nombre: nombre.trim(), precioVenta: Number(precioVenta) || 0, costo: Number(costo) || 0,
          stockActual: 0, stockMinimo: 0, unidad: 'unidad', activo: true,
        },
        Number(stockInicial) || 0,
      );
      onCreado(creado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4 dlg-b">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Nuevo producto</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X size={16} /></button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
          <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Precio venta €</label>
            <input type="number" min="0" step="0.01" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Coste €</label>
            <input type="number" min="0" step="0.01" value={costo} onChange={(e) => setCosto(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Stock inicial</label>
          <input type="number" min="0" step="1" value={stockInicial} onChange={(e) => setStockInicial(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}
        <div className="dlg-pie">
<button type="button" onClick={onClose} className="border border-slate-200 text-slate-600">Cancelar</button>
<button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60">
          <Check size={15} /> {saving ? 'Creando…' : 'Crear y usar en la línea'}
        </button>
</div>
      </div>
    </div>
  );
}
