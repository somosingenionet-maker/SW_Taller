import { useMemo, useState } from 'react';
import { Building2, Check, Edit2, Plus, Power, Search, Trash2, X } from 'lucide-react';
import type { Proveedor } from '../types';
import { createProveedor, deleteProveedor, updateProveedor } from '../lib/data/proveedores';
import { avisarError, avisarOk } from '../lib/avisos';
import ConfirmDialog from './ConfirmDialog';

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';
const VACIO: Omit<Proveedor, 'id'> = { nombre: '', nif: '', telefono: '', correo: '', contacto: '', direccion: '', diasPago: 0, notas: '', activo: true };

/** Ventana de alta y edición de un proveedor. La usa también el formulario de compras para dar de alta uno «al vuelo». */
export function ProveedorFormModal({ proveedor, onGuardado, onClose }: { proveedor?: Proveedor; onGuardado: (p: Proveedor) => void; onClose: () => void }) {
  const [f, setF] = useState<Omit<Proveedor, 'id'>>(proveedor ? { ...VACIO, ...proveedor } : VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    if (!f.nombre.trim()) { setError('Escribe el nombre del proveedor.'); return; }
    if (f.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.correo.trim())) { setError('El correo no parece válido.'); return; }
    if (!Number.isInteger(f.diasPago) || f.diasPago < 0 || f.diasPago > 365) { setError('Los días de pago deben estar entre 0 y 365.'); return; }
    setGuardando(true); setError('');
    try {
      const p = proveedor ? await updateProveedor(proveedor.id, f) : await createProveedor(f);
      onGuardado(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4" role="dialog" aria-label={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4 dlg-b">
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold text-slate-800">{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs font-semibold text-slate-600">Nombre *
            <input className={`${campo} mt-1`} value={f.nombre} maxLength={120} onChange={(e) => set('nombre', e.target.value)} placeholder="Recambios Ruiz, S.L." aria-label="Nombre del proveedor" />
          </label>
          <label className="text-xs font-semibold text-slate-600">NIF / CIF
            <input className={`${campo} mt-1`} value={f.nif ?? ''} maxLength={20} onChange={(e) => set('nif', e.target.value)} aria-label="NIF del proveedor" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Días de pago
            <input className={`${campo} mt-1`} type="number" min={0} max={365} value={f.diasPago} onChange={(e) => set('diasPago', Number(e.target.value))} aria-label="Días de pago" />
          </label>
          <label className="text-xs font-semibold text-slate-600">Teléfono
            <input className={`${campo} mt-1`} value={f.telefono ?? ''} maxLength={30} onChange={(e) => set('telefono', e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Correo
            <input className={`${campo} mt-1`} value={f.correo ?? ''} maxLength={254} onChange={(e) => set('correo', e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Persona de contacto
            <input className={`${campo} mt-1`} value={f.contacto ?? ''} maxLength={120} onChange={(e) => set('contacto', e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Dirección
            <input className={`${campo} mt-1`} value={f.direccion ?? ''} maxLength={250} onChange={(e) => set('direccion', e.target.value)} />
          </label>
          <label className="col-span-2 text-xs font-semibold text-slate-600">Notas
            <textarea className={`${campo} mt-1`} rows={2} value={f.notas ?? ''} maxLength={1000} onChange={(e) => set('notas', e.target.value)} />
          </label>
        </div>
        <p className="text-[11px] text-slate-400">Los días de pago sirven para proponer el vencimiento al registrar una compra (0 = paga al contado).</p>
        <div className="space-y-2 dlg-pie-pila">
        {error && <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2" data-testid="error-proveedor">{error}</p>}
        <div className="flex justify-end gap-2 dlg-pie">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button onClick={() => void guardar()} disabled={guardando} data-testid="guardar-proveedor"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl cursor-pointer disabled:opacity-60">
            <Check className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

interface Props { proveedores: Proveedor[]; cargando: boolean; onCambio: (lista: Proveedor[]) => void }

export default function ProveedoresPanel({ proveedores, cargando, onCambio }: Props) {
  const [buscar, setBuscar] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [formulario, setFormulario] = useState<{ proveedor?: Proveedor } | null>(null);
  const [aBorrar, setABorrar] = useState<Proveedor | null>(null);

  const visibles = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    return proveedores.filter((p) => (verInactivos || p.activo) && (!t || p.nombre.toLowerCase().includes(t) || (p.nif ?? '').toLowerCase().includes(t) || (p.contacto ?? '').toLowerCase().includes(t)));
  }, [proveedores, buscar, verInactivos]);

  const reemplazar = (p: Proveedor) => onCambio([...proveedores.filter((x) => x.id !== p.id), p].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));

  const alternar = async (p: Proveedor) => {
    try { reemplazar(await updateProveedor(p.id, { ...p, activo: !p.activo })); }
    catch (e) { avisarError(e, 'No se pudo cambiar el estado del proveedor.'); }
  };
  const borrar = async () => {
    if (!aBorrar) return;
    try { await deleteProveedor(aBorrar.id); onCambio(proveedores.filter((x) => x.id !== aBorrar.id)); avisarOk('Proveedor eliminado.'); }
    catch (e) { avisarError(e, 'No se pudo eliminar el proveedor.'); }
    finally { setABorrar(null); }
  };

  return (
    <div className="space-y-4" data-testid="panel-proveedores">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, NIF o contacto…" aria-label="Buscar proveedor"
            className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer"><input type="checkbox" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} /> Ver desactivados</label>
        <button onClick={() => setFormulario({})} data-testid="nuevo-proveedor"
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer"><Plus className="w-3.5 h-3.5" /> Nuevo proveedor</button>
      </div>

      {cargando ? <p className="text-sm text-slate-400 py-8 text-center">Cargando proveedores…</p>
        : visibles.length === 0 ? (
          <div className="text-center py-14 text-slate-400">
            <Building2 className="w-9 h-9 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">{proveedores.length === 0 ? 'Todavía no tienes proveedores' : 'Ningún proveedor coincide con la búsqueda'}</p>
            {proveedores.length === 0 && <p className="text-xs mt-1">Añade a quien le compras recambios o servicios para registrar sus facturas.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2.5 font-bold">Proveedor</th><th className="px-3 py-2.5 font-bold">NIF</th><th className="px-3 py-2.5 font-bold">Contacto</th>
                <th className="px-3 py-2.5 font-bold text-right">Pago</th><th className="px-3 py-2.5" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((p) => (
                  <tr key={p.id} className={p.activo ? '' : 'opacity-50'} data-testid="fila-proveedor">
                    <td className="px-4 py-2.5"><p className="font-bold text-slate-800">{p.nombre}</p>{!p.activo && <span className="text-[10px] font-bold text-slate-500">Desactivado</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{p.nif || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{[p.contacto, p.telefono].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{p.diasPago > 0 ? `${p.diasPago} días` : 'Contado'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setFormulario({ proveedor: p })} title="Editar" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => void alternar(p)} title={p.activo ? 'Desactivar' : 'Activar'} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl cursor-pointer"><Power className="w-4 h-4" /></button>
                        <button onClick={() => setABorrar(p)} title="Eliminar" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {formulario && <ProveedorFormModal proveedor={formulario.proveedor} onClose={() => setFormulario(null)} onGuardado={(p) => { reemplazar(p); setFormulario(null); avisarOk(formulario.proveedor ? 'Proveedor guardado.' : 'Proveedor creado.'); }} />}
      <ConfirmDialog isOpen={!!aBorrar} title="Eliminar proveedor" message={`¿Eliminar a ${aBorrar?.nombre ?? ''}? Si ya tiene compras registradas no se podrá borrar: en ese caso desactívalo.`}
        confirmLabel="Eliminar" onConfirm={() => void borrar()} onCancel={() => setABorrar(null)} />
    </div>
  );
}
