import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, RotateCcw, Check, Building2, Wrench, Plus, Edit2, Trash2 } from 'lucide-react';
import { EmpresaConfig, DEFAULT_EMPRESA_CONFIG } from '../data/mockData';
import { Tecnico } from '../types';
import { listTecnicos, createTecnico, updateTecnico, deleteTecnico } from '../lib/data/tecnicos';
import { contrastText } from '../utils/color';

interface Props {
  config: EmpresaConfig;
  onSave: (config: EmpresaConfig) => void;
  onClose: () => void;
}

const BRAND_COLORS = [
  { label: 'Azul',       value: '#2563eb' },
  { label: 'Índigo',     value: '#4f46e5' },
  { label: 'Violeta',    value: '#7c3aed' },
  { label: 'Rosa',       value: '#db2777' },
  { label: 'Rojo',       value: '#dc2626' },
  { label: 'Naranja',    value: '#ea580c' },
  { label: 'Ámbar',      value: '#d97706' },
  { label: 'Verde',      value: '#16a34a' },
  { label: 'Teal',       value: '#0d9488' },
  { label: 'Cian',       value: '#0891b2' },
  { label: 'Slate',      value: '#475569' },
  { label: 'Negro',      value: '#111827' },
];

export default function CompanySettingsPanel({ config, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<EmpresaConfig>({ ...config });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Técnicos (desde Supabase)
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [tecnicoForm, setTecnicoForm] = useState<{ nombre: string; especialidad: string } | null>(null);
  const [editingTecnicoId, setEditingTecnicoId] = useState<string | null>(null);

  const recargarTecnicos = () => listTecnicos().then(setTecnicos);
  useEffect(() => { recargarTecnicos(); }, []);

  const openTecnicoForm = (t?: Tecnico) => {
    setEditingTecnicoId(t?.id ?? null);
    setTecnicoForm({ nombre: t?.nombre ?? '', especialidad: t?.especialidad ?? '' });
  };

  const handleSaveTecnico = async () => {
    if (!tecnicoForm?.nombre.trim()) return;
    const nombre = tecnicoForm.nombre.trim();
    const especialidad = tecnicoForm.especialidad.trim();
    if (editingTecnicoId) {
      const actual = tecnicos.find(t => t.id === editingTecnicoId);
      await updateTecnico({ id: editingTecnicoId, nombre, especialidad, activo: actual?.activo ?? true });
    } else {
      await createTecnico({ nombre, especialidad, activo: true });
    }
    await recargarTecnicos();
    setTecnicoForm(null);
    setEditingTecnicoId(null);
  };

  const handleDeleteTecnico = async (id: string) => {
    await deleteTecnico(id);
    await recargarTecnicos();
  };

  const set = (field: keyof EmpresaConfig, value: string) =>
    setDraft(prev => ({ ...prev, [field]: value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => set('logoBase64', ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => setDraft({ ...DEFAULT_EMPRESA_CONFIG });

  // Derive initials for logo preview
  const initials = draft.nombre
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden border-l border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-4 h-4 text-slate-300" />
            <span className="font-bold text-sm tracking-tight">Configuración de Empresa</span>
          </div>
          <button onClick={onClose} title="Cerrar panel" className="p-1.5 hover:bg-slate-800 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* Logo preview + upload */}
          <section>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Logo de la Empresa</p>
            <div className="flex items-center gap-4">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center overflow-hidden shrink-0 shadow-md border border-slate-200"
                style={{ backgroundColor: draft.brandColor }}
              >
                {draft.logoBase64 ? (
                  <img src={draft.logoBase64} alt="logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-white font-black text-xl tracking-tighter">{initials}</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold rounded-lg border border-blue-200 transition"
                >
                  <Upload className="w-3.5 h-3.5" /> Subir imagen
                </button>
                {draft.logoBase64 && (
                  <button
                    onClick={() => set('logoBase64', '')}
                    className="text-xs text-slate-400 hover:text-rose-500 transition text-left"
                  >
                    Eliminar logo
                  </button>
                )}
                <p className="text-[10px] text-slate-400">PNG, JPG o SVG — máx. 2 MB</p>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </div>
          </section>

          {/* Identidad */}
          <section className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Identidad</p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la empresa *</label>
              <input
                type="text"
                value={draft.nombre}
                onChange={e => set('nombre', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Mi Empresa S.L."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción / Tagline</label>
              <input
                type="text"
                value={draft.tagline}
                onChange={e => set('tagline', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Sistema de gestión de flota..."
              />
            </div>
          </section>

          {/* Datos fiscales (aparecen en las facturas) */}
          <section className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datos Fiscales</p>
            <p className="text-[10px] text-slate-400 -mt-2">Se muestran en las facturas.</p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Razón social</label>
              <input
                type="text"
                value={draft.razonSocial}
                onChange={e => set('razonSocial', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Mi Empresa S.L."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">NIF / CIF</label>
              <input
                type="text"
                value={draft.nif}
                onChange={e => set('nif', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="B-00000000"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección fiscal</label>
              <input
                type="text"
                value={draft.direccionFiscal}
                onChange={e => set('direccionFiscal', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Calle Mayor 45, Planta 2, Madrid"
              />
            </div>
          </section>

          {/* Contacto */}
          <section className="space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datos de Contacto</p>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Correo electrónico</label>
              <input
                type="email"
                value={draft.correo}
                onChange={e => set('correo', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="contacto@empresa.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
              <input
                type="text"
                value={draft.telefono}
                onChange={e => set('telefono', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="(+34) 600 000 000"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sitio web</label>
              <input
                type="text"
                value={draft.web}
                onChange={e => set('web', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="www.miempresa.com"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Ciudad</label>
              <input
                type="text"
                value={draft.ciudad}
                onChange={e => set('ciudad', e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Madrid, Barcelona..."
              />
            </div>
          </section>

          {/* Color de marca */}
          <section>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Color de Marca</p>

            {/* Preset palette */}
            <div className="grid grid-cols-6 gap-2 mb-3">
              {BRAND_COLORS.map(c => (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={() => set('brandColor', c.value)}
                  className="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 shadow-sm"
                  style={{
                    backgroundColor: c.value,
                    borderColor: draft.brandColor === c.value ? '#ffffff' : 'transparent',
                    outline: draft.brandColor === c.value ? `2px solid ${c.value}` : 'none',
                    outlineOffset: '1px',
                  }}
                />
              ))}
            </div>

            {/* Custom color picker */}
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={draft.brandColor}
                onChange={e => set('brandColor', e.target.value)}
                className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
              />
              <div>
                <p className="text-xs text-slate-500">Color personalizado</p>
                <p className="text-xs font-mono text-slate-700">{draft.brandColor}</p>
              </div>
            </div>

            {/* Live preview */}
            {(() => {
              const previewText = contrastText(draft.brandColor);
              return (
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                  <div className="px-4 py-3 text-xs flex items-center gap-2.5" style={{ backgroundColor: draft.brandColor, color: previewText }}>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-sm shrink-0"
                      style={{ backgroundColor: `${previewText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: previewText }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="font-bold leading-tight">{draft.nombre || 'Nombre empresa'}</p>
                      <p className="text-[9px] opacity-70">{draft.tagline || 'Descripción'}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold" style={{ backgroundColor: `${previewText === '#ffffff' ? '#00000033' : '#ffffff33'}` }}>
                      ✉ {draft.correo || 'correo@empresa.com'}
                    </div>
                  </div>
                  <div className="px-4 py-2 bg-white text-[10px] text-slate-500 flex items-center gap-2">
                    <span className="font-semibold" style={{ color: draft.brandColor }}>Vista previa del header</span>
                    <span className="ml-auto font-mono">{draft.brandColor} · texto {previewText === '#ffffff' ? 'blanco' : 'negro'}</span>
                  </div>
                </div>
              );
            })()}
          </section>
        </div>

        {/* Técnicos */}
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-orange-500" /> Técnicos del taller
            </h3>
            <button
              onClick={() => openTecnicoForm()}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Añadir
            </button>
          </div>

          {tecnicoForm !== null && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
              <input
                type="text"
                value={tecnicoForm.nombre}
                onChange={e => setTecnicoForm(f => f ? { ...f, nombre: e.target.value } : f)}
                placeholder="Nombre del técnico *"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <input
                type="text"
                value={tecnicoForm.especialidad}
                onChange={e => setTecnicoForm(f => f ? { ...f, especialidad: e.target.value } : f)}
                placeholder="Especialidad (opcional)"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setTecnicoForm(null); setEditingTecnicoId(null); }} className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition cursor-pointer">Cancelar</button>
                <button onClick={handleSaveTecnico} className="px-3 py-1.5 text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition flex items-center gap-1 cursor-pointer">
                  <Check className="w-3 h-3" /> Guardar
                </button>
              </div>
            </div>
          )}

          {tecnicos.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-3">Sin técnicos registrados.</p>
          ) : (
            <div className="space-y-1.5">
              {tecnicos.map(t => (
                <div key={t.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{t.nombre}</p>
                    {t.especialidad && <p className="text-xs text-slate-400">{t.especialidad}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openTecnicoForm(t)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteTecnico(t.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar por defecto
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white rounded-lg transition flex items-center gap-1.5"
              style={{ backgroundColor: saved ? '#16a34a' : draft.brandColor }}
            >
              {saved ? <><Check className="w-3.5 h-3.5" /> Guardado</> : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
