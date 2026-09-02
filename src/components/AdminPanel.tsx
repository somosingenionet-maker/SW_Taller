import { useEffect, useState } from 'react';
import { X, Shield, Plus, Edit2, Trash2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Perfil, ModuloId } from '../types';
import { listUsuarios, createUsuario, updateUsuario, deleteUsuario, setUsuarioPassword, setUsuarioEmail } from '../lib/data/usuarios';
import { validarPassword, REQUISITOS_PASSWORD } from '../utils/password';

interface AdminPanelProps {
  currentUser: Perfil;
  onClose: () => void;
  /** Solo para el super admin: acota el listado a una empresa concreta (panel de soporte). */
  empresaId?: string;
  empresaNombre?: string;
  /** Alta de usuarios nuevos — desactivada cuando el super admin gestiona otra empresa (la Edge Function admin-users crea siempre en la empresa de quien llama). */
  canCreate?: boolean;
}

const MODULOS_BASE = [
  { id: 'citas' as ModuloId, label: 'Agenda', desc: 'Citas y programación del taller' },
  { id: 'inventario' as ModuloId, label: 'Inventario', desc: 'Catálogo y control de stock' },
  { id: 'vehiculos' as ModuloId, label: 'Vehículos', desc: 'Gestión de flota' },
  { id: 'clientes' as ModuloId, label: 'Clientes CRM', desc: 'Directorio de clientes' },
  { id: 'taller' as ModuloId, label: 'Taller', desc: 'Diario de mantenimientos' },
  { id: 'alertas' as ModuloId, label: 'Alertas', desc: 'ITV y vencimientos' },
  { id: 'rentabilidad' as ModuloId, label: 'Rentabilidad', desc: 'Análisis LTV' },
  { id: 'facturas' as ModuloId, label: 'Facturas', desc: 'Documentos comerciales' },
];

interface FormState {
  nombre: string;
  email: string;
  password: string;
  rol: 'admin' | 'usuario';
  activo: boolean;
  modulos: ModuloId[];
}

const EMPTY_FORM: FormState = {
  nombre: '',
  email: '',
  password: '',
  rol: 'usuario',
  activo: true,
  modulos: MODULOS_BASE.map(m => m.id),
};

export default function AdminPanel({ currentUser, onClose, empresaId, empresaNombre, canCreate = true }: AdminPanelProps) {
  const [usuarios, setUsuarios] = useState<Perfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const recargar = async () => {
    setListError('');
    try {
      setUsuarios(await listUsuarios(empresaId));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Error cargando usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (u: Perfil) => {
    setForm({
      nombre: u.nombre,
      email: u.email,
      password: '', // vacío = mantener la contraseña actual
      // AdminPanel es de empresa: el listado (filtrado por RLS a la propia
      // empresa) nunca trae un super_admin, pero se acota el tipo por si acaso.
      rol: u.rol === 'admin' ? 'admin' : 'usuario',
      activo: u.activo,
      modulos: [...u.modulos],
    });
    setEditingId(u.id);
    setFormError('');
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError('');
  };

  const handleToggleModulo = (id: ModuloId) => {
    setForm(prev => ({
      ...prev,
      modulos: prev.modulos.includes(id) ? prev.modulos.filter(m => m !== id) : [...prev.modulos, id],
    }));
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.nombre.trim()) { setFormError('El nombre es obligatorio.'); return; }
    if (!form.email.trim()) { setFormError('El email es obligatorio.'); return; }
    // Al editar, dejar la contraseña vacía significa no cambiarla
    if (!editingId || form.password.length > 0) {
      const errorPassword = validarPassword(form.password);
      if (errorPassword) { setFormError(errorPassword); return; }
    }

    const duplicate = usuarios.find(
      u => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.id !== editingId
    );
    if (duplicate) { setFormError('Ya existe un usuario con ese email.'); return; }

    setSaving(true);
    try {
      if (editingId) {
        await updateUsuario(editingId, {
          nombre: form.nombre.trim(),
          rol: form.rol,
          activo: form.activo,
          modulos: form.modulos,
        });
        const original = usuarios.find(u => u.id === editingId);
        if (original && form.email.trim() !== original.email) {
          await setUsuarioEmail(editingId, form.email.trim());
        }
        if (form.password.length > 0) {
          await setUsuarioPassword(editingId, form.password);
        }
      } else {
        await createUsuario({
          email: form.email.trim(),
          password: form.password,
          nombre: form.nombre.trim(),
          rol: form.rol,
          activo: form.activo,
          modulos: form.modulos,
        });
      }
      await recargar();
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActivo = async (u: Perfil) => {
    setListError('');
    try {
      await updateUsuario(u.id, { activo: !u.activo });
      await recargar();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario.');
    }
  };

  const handleDelete = async (u: Perfil) => {
    if (!canDelete(u)) return;
    setListError('');
    try {
      await deleteUsuario(u.id);
      await recargar();
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'No se pudo eliminar el usuario.');
    }
  };

  const canDelete = (u: Perfil) => {
    if (u.id === currentUser.id) return false;
    if (u.rol === 'admin') {
      const otherAdmins = usuarios.filter(usr => usr.rol === 'admin' && usr.id !== u.id);
      return otherAdmins.length > 0;
    }
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl rounded-3xl flex flex-col max-h-[88vh] overflow-hidden animate-modal-pop">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm tracking-tight">
              {empresaNombre ? `Usuarios de ${empresaNombre}` : 'Panel de Administración'}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {listError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">
              {listError}
            </div>
          )}

          {/* User list */}
          {!showForm && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Usuarios del sistema ({usuarios.length})</p>
                {canCreate && (
                  <button
                    onClick={openCreate}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nuevo Usuario
                  </button>
                )}
              </div>

              {loading ? (
                <p className="text-xs text-slate-400 text-center py-6">Cargando usuarios…</p>
              ) : (
              <div className="space-y-2">
                {usuarios.map(u => (
                  <div key={u.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800 truncate">{u.nombre}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.rol === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {u.rol}
                          </span>
                          {u.id === currentUser.id && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Tú</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{u.email}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Activo toggle */}
                        <button
                          onClick={() => handleToggleActivo(u)}
                          title={u.activo ? 'Desactivar' : 'Activar'}
                          className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${u.activo ? 'bg-green-500' : 'bg-slate-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${u.activo ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>

                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"
                          title="Editar usuario"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDelete(u)}
                          disabled={!canDelete(u)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={!canDelete(u) ? 'No se puede eliminar' : 'Eliminar usuario'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer"
                        >
                          {expandedId === u.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded modules */}
                    {expandedId === u.id && (
                      <div className="px-4 py-3 border-t border-slate-100 bg-white">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Módulos activos</p>
                        <div className="flex flex-wrap gap-1.5">
                          {MODULOS_BASE.map(m => (
                            <span
                              key={m.id}
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${u.modulos.includes(m.id) ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400 line-through'}`}
                            >
                              {m.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </>
          )}

          {/* Create / Edit form */}
          {showForm && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {editingId ? 'Editar usuario' : 'Nuevo usuario'}
                </p>
                <button onClick={cancelForm} className="text-xs text-slate-400 hover:text-slate-600 transition cursor-pointer">
                  Cancelar
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="usuario@empresa.net"
                />
                {editingId && <p className="text-[10px] text-slate-400 mt-1">Cambiar el email actualiza también las credenciales de acceso.</p>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {editingId ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña *'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <p className="text-[10px] text-slate-400 mt-1">{REQUISITOS_PASSWORD}</p>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Rol</label>
                  <select
                    value={form.rol}
                    onChange={e => setForm(f => ({ ...f, rol: e.target.value as 'admin' | 'usuario' }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                  >
                    <option value="usuario">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="flex items-end pb-2 gap-2">
                  <label className="text-xs font-semibold text-slate-600">Activo</label>
                  <button
                    onClick={() => setForm(f => ({ ...f, activo: !f.activo }))}
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${form.activo ? 'bg-green-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.activo ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {/* Modules */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Módulos</p>
                <div className="space-y-2">
                  {MODULOS_BASE.map(m => (
                    <label key={m.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.modulos.includes(m.id)}
                        onChange={() => handleToggleModulo(m.id)}
                        className="w-4 h-4 rounded accent-blue-600"
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-700 group-hover:text-blue-700 transition">{m.label}</p>
                        <p className="text-[10px] text-slate-400">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">
                  {formError}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
