import { useEffect, useState } from 'react';
import { Building2, Plus, Trash2, LogOut, Shield, Check, X } from 'lucide-react';
import { Perfil } from '../types';
import { listEmpresas, createEmpresaConAdmin, toggleEmpresaActivo, deleteEmpresa, NuevaEmpresaInput } from '../lib/data/empresa';
import type { Empresa } from '../types';
import ConfirmDialog from './ConfirmDialog';

interface SuperAdminPanelProps {
  currentUser: Perfil;
  onLogout: () => void;
}

interface FormState {
  nombre: string;
  nif: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
}

const EMPTY_FORM: FormState = { nombre: '', nif: '', adminNombre: '', adminEmail: '', adminPassword: '' };

export default function SuperAdminPanel({ currentUser, onLogout }: SuperAdminPanelProps) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Empresa | null>(null);

  const recargar = async () => {
    setListError('');
    try {
      setEmpresas(await listEmpresas());
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Error cargando empresas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.nombre.trim()) { setFormError('El nombre de la empresa es obligatorio.'); return; }
    if (!form.adminNombre.trim() || !form.adminEmail.trim()) { setFormError('Nombre y email del administrador son obligatorios.'); return; }
    if (form.adminPassword.length < 6) { setFormError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setSaving(true);
    try {
      const input: NuevaEmpresaInput = {
        nombre: form.nombre.trim(),
        nif: form.nif.trim() || undefined,
        adminNombre: form.adminNombre.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
      };
      await createEmpresaConAdmin(input);
      await recargar();
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear la empresa.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (e: Empresa) => {
    setListError('');
    try {
      await toggleEmpresaActivo(e.id, !e.activo);
      await recargar();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo actualizar la empresa.');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    const empresa = confirmDelete;
    setConfirmDelete(null);
    setListError('');
    try {
      await deleteEmpresa(empresa.id);
      await recargar();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo eliminar la empresa.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex flex-col antialiased">
      {/* HEADER */}
      <header className="bg-slate-950 shadow-md shrink-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Tibox Motor
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-widest bg-white/10 text-white border border-white/20">
                  Super Admin
                </span>
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Gestión de empresas clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/10 text-white">
              <div className="w-6 h-6 rounded-full bg-white text-slate-900 flex items-center justify-center text-[10px] font-black">
                {currentUser.nombre[0].toUpperCase()}
              </div>
              <span className="text-xs font-semibold hidden sm:block">{currentUser.nombre}</span>
            </div>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* BODY */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">
        {listError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium px-4 py-2.5 rounded-lg">
            {listError}
          </div>
        )}

        {!showForm && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Empresas ({empresas.length})</p>
              </div>
              <button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Nueva Empresa
              </button>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400 text-center py-10">Cargando empresas…</p>
            ) : empresas.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center">
                <Building2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Aún no hay empresas dadas de alta.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {empresas.map((e) => (
                  <div key={e.id} className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex items-center gap-4">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                      style={{ backgroundColor: `${e.brandColor}22`, color: e.brandColor }}
                    >
                      {e.nombre.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'E'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800 truncate">{e.nombre}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${e.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {e.activo ? 'Activa' : 'Suspendida'}
                        </span>
                      </div>
                      {e.nif && <p className="text-xs text-slate-500 mt-0.5">NIF: {e.nif}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleActivo(e)}
                        title={e.activo ? 'Suspender' : 'Reactivar'}
                        className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${e.activo ? 'bg-green-500' : 'bg-slate-300'}`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${e.activo ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                      <button
                        onClick={() => setConfirmDelete(e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Eliminar empresa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {showForm && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 max-w-lg">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nueva empresa</p>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la empresa *</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Taller Ejemplo S.L."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NIF / CIF</label>
              <input
                type="text"
                value={form.nif}
                onChange={(e) => setForm((f) => ({ ...f, nif: e.target.value }))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="B-00000000"
              />
            </div>

            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Primer administrador de la empresa</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={form.adminNombre}
                    onChange={(e) => setForm((f) => ({ ...f, adminNombre: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                  <input
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="admin@empresa.net"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña * (mín. 6 caracteres)</label>
                  <input
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="mínimo 6 caracteres"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-lg">
                {formError}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {saving ? 'Creando…' : 'Crear empresa'}
            </button>
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Eliminar empresa"
        message={`Se eliminará "${confirmDelete?.nombre}" junto con todos sus usuarios y datos (vehículos, clientes, facturas...). Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
