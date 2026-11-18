import { blobADataUrl, comprimirImagen, OPCIONES_LOGO } from '../utils/imagen';
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, RotateCcw, Check, Building2, Wrench, Plus, Edit2, Trash2, Mail, MessageSquareText, IdCard, Landmark, Palette, Bell, Link2, Copy, ShieldOff, RefreshCw, Camera, ClipboardCheck, CalendarCheck, ChevronRight } from 'lucide-react';
import { AlertaTipo, Tecnico, Empresa } from '../types';
import { listTecnicos, createTecnico, updateTecnico, deleteTecnico, setPortalTokenTecnico } from '../lib/data/tecnicos';
import { supabase } from '../lib/supabase';
import { avisarError } from '../lib/avisos';
import { contrastText } from '../utils/color';
import { PLANTILLA_DEFAULT, VARIABLES_DISPONIBLES } from '../utils/recordatorioTemplates';
import VerifactuSettings from './VerifactuSettings';
import AjustesInspeccion from './AjustesInspeccion';
import AjustesReservas from './AjustesReservas';
import { formatearBytes } from '../utils/imagen';

interface Props {
  config: Empresa;
  /** Pestaña con la que se abre (la guía de primeros pasos enlaza directo a cada una). */
  pestanaInicial?: TabId;
  onSave: (config: Partial<Empresa>) => void | Promise<void>;
  onClose: () => void;
}

const TIPO_LABEL: Record<AlertaTipo, string> = {
  itv: 'ITV',
  seguro: 'Seguro',
  impuesto: 'Impuesto de circulación',
  aceite: 'Cambio de aceite (recordatorio)',
};

export type TabId = 'identidad' | 'fiscal' | 'marca' | 'recordatorios' | 'reservas' | 'inspeccion' | 'fotos' | 'tecnicos';

/** Las secciones de la configuración, agrupadas por lo que se quiere hacer. Los identificadores son los de siempre (la guía de primeros pasos enlaza a ellos). */
const GRUPOS: { titulo: string; items: { id: TabId; titulo: string; descripcion: string; icono: typeof Building2 }[] }[] = [
  { titulo: 'Tu empresa', items: [
    { id: 'identidad', titulo: 'Datos de la empresa', descripcion: 'Cómo se llama tu taller y cómo contactan contigo tus clientes.', icono: IdCard },
    { id: 'fiscal', titulo: 'Facturación', descripcion: 'Datos fiscales, numeración de facturas y envío a Hacienda (VERI*FACTU).', icono: Landmark },
    { id: 'marca', titulo: 'Logo y color', descripcion: 'La imagen de tu taller en la aplicación, en los documentos y en las páginas que ven tus clientes.', icono: Palette },
  ] },
  { titulo: 'Clientes', items: [
    { id: 'recordatorios', titulo: 'Recordatorios', descripcion: 'Avisos automáticos por correo de ITV, seguro, impuesto y cambio de aceite.', icono: Bell },
    { id: 'reservas', titulo: 'Reservas online', descripcion: 'Que tus clientes pidan cita desde tu propia página.', icono: CalendarCheck },
  ] },
  { titulo: 'Taller', items: [
    { id: 'inspeccion', titulo: 'Inspección', descripcion: 'Servicios predefinidos y plantillas de la inspección digital.', icono: ClipboardCheck },
    { id: 'fotos', titulo: 'Fotos', descripcion: 'Cuánto tiempo se conservan las fotos de cada orden.', icono: Camera },
    { id: 'tecnicos', titulo: 'Técnicos', descripcion: 'Quién trabaja en el taller y su enlace personal para ver y marcar sus trabajos.', icono: Wrench },
  ] },
];
const TODAS = GRUPOS.flatMap(g => g.items);

/** Estas secciones guardan solas, al momento: el botón de abajo es para los datos de la empresa. */
const GUARDAN_SOLAS: TabId[] = ['reservas', 'inspeccion', 'tecnicos'];

const entrada = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-400';

function Tarjeta({ titulo, ayuda, children, className = '', ...resto }: { titulo?: string; ayuda?: React.ReactNode; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl p-5 space-y-4 ${className}`} {...resto}>
      {(titulo || ayuda) && (
        <div>
          {titulo && <h3 className="text-base font-extrabold text-slate-800">{titulo}</h3>}
          {ayuda && <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{ayuda}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

function Campo({ etiqueta, id, children }: { etiqueta: string; id?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700 mb-1.5">{etiqueta}</label>
      {children}
    </div>
  );
}


/** Valores de marca por defecto para el botón "Restaurar por defecto" (id/activo/recordatorios/numeración de facturas se conservan). */
const DEFAULT_BRAND_FIELDS: Omit<Empresa, 'id' | 'activo' | 'recordatoriosAutomaticosActivos' | 'plantillasRecordatorios' | 'facturaPrefijo' | 'siguienteNumeroFactura' | 'facturaMostrarQr' | 'verifactuEnvioActivo' | 'verifactuEntorno' | 'verifactuNumeroInstalacion' | 'fotosRetencionMeses'> = {
  nombre: 'Mi Empresa',
  tagline: '',
  razonSocial: '',
  nif: '',
  direccionFiscal: '',
  correo: '',
  telefono: '',
  web: '',
  ciudad: '',
  brandColor: '#2563eb',
  logoBase64: '',
  logoUrl: '',
};

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

export default function CompanySettingsPanel({ config, pestanaInicial, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<Empresa>({ ...config });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>(pestanaInicial ?? 'identidad');
  const fileRef = useRef<HTMLInputElement>(null);

  // Técnicos (desde Supabase)
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [tecnicoForm, setTecnicoForm] = useState<{ nombre: string; especialidad: string; telefono: string } | null>(null);
  const [editingTecnicoId, setEditingTecnicoId] = useState<string | null>(null);
  const [portalTecnicoBusy, setPortalTecnicoBusy] = useState(false);
  const [portalTecnicoCopiado, setPortalTecnicoCopiado] = useState(false);

  const recargarTecnicos = () => listTecnicos().then(setTecnicos);
  useEffect(() => { recargarTecnicos(); }, []);

  const openTecnicoForm = (t?: Tecnico) => {
    setEditingTecnicoId(t?.id ?? null);
    setTecnicoForm({ nombre: t?.nombre ?? '', especialidad: t?.especialidad ?? '', telefono: t?.telefono ?? '' });
  };

  const handleSaveTecnico = async () => {
    if (!tecnicoForm?.nombre.trim()) return;
    const nombre = tecnicoForm.nombre.trim();
    const especialidad = tecnicoForm.especialidad.trim();
    const telefono = tecnicoForm.telefono.trim();
    try {
      if (editingTecnicoId) {
        const actual = tecnicos.find(t => t.id === editingTecnicoId);
        await updateTecnico({ id: editingTecnicoId, nombre, especialidad, telefono, activo: actual?.activo ?? true });
      } else {
        await createTecnico({ nombre, especialidad, telefono, activo: true });
      }
      await recargarTecnicos();
    } catch (err) {
      avisarError(err, 'No se pudo guardar el técnico.');
      return;
    }
    setTecnicoForm(null);
    setEditingTecnicoId(null);
  };

  const handleGenerarPortalTecnico = async () => {
    if (!editingTecnicoId) return;
    setPortalTecnicoBusy(true);
    try {
      await setPortalTokenTecnico(editingTecnicoId, crypto.randomUUID());
      await recargarTecnicos();
    } catch (err) {
      avisarError(err, 'No se pudo generar el enlace del mecánico.');
    } finally {
      setPortalTecnicoBusy(false);
    }
  };

  const handleRevocarPortalTecnico = async () => {
    if (!editingTecnicoId) return;
    setPortalTecnicoBusy(true);
    try {
      await setPortalTokenTecnico(editingTecnicoId, null);
      await recargarTecnicos();
    } catch (err) {
      avisarError(err, 'No se pudo revocar el enlace del mecánico.');
    } finally {
      setPortalTecnicoBusy(false);
    }
  };

  const handleCopiarPortalTecnico = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/mecanico/${token}`);
    setPortalTecnicoCopiado(true);
    setTimeout(() => setPortalTecnicoCopiado(false), 2000);
  };

  const handleDeleteTecnico = async (id: string) => {
    try {
      await deleteTecnico(id);
      await recargarTecnicos();
    } catch (err) {
      avisarError(err, 'No se pudo eliminar el técnico.');
    }
  };

  const set = (field: keyof Empresa, value: string) =>
    setDraft(prev => ({ ...prev, [field]: value }));

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [uso, setUso] = useState<{ bytes: number; archivos: number } | null>(null);

  // Espacio que ocupan las fotos y logos de este taller (solo se pide al abrir la pestaña «Fotos»).
  useEffect(() => {
    if (activeTab !== 'fotos' || uso !== null) return;
    void supabase.rpc('uso_almacenamiento').then(({ data }) => {
      const filas = (data ?? []) as { empresa_id: string; bytes: number; archivos: number }[];
      setUso({ bytes: filas.reduce((s, f) => s + Number(f.bytes), 0), archivos: filas.reduce((s, f) => s + Number(f.archivos), 0) });
    });
  }, [activeTab, uso]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLogoError('');

    void (async () => {
      setLogoUploading(true);
      try {
        // Se reduce antes de guardarlo: el logo en base64 viaja con la empresa en cada sesión, así que un
        // logo de varios MB ralentizaría la app para todos los usuarios del taller.
        const { blob, ext, tipo } = await comprimirImagen(file, OPCIONES_LOGO);

        // Base64 — se usa dentro de la app (header, PDF de factura, impresión de OT).
        set('logoBase64', await blobADataUrl(blob));

        // Además se sube a Storage: los emails de recordatorio necesitan una URL
        // real (un logo en base64 incrustado en el HTML del correo dispara los
        // filtros de spam), así que referencian este archivo en vez del base64.
        try {
          const path = `${config.id}/logo.${ext}`;
          const { error } = await supabase.storage
            .from('logos-empresas')
            .upload(path, blob, { upsert: true, cacheControl: '3600', contentType: tipo });
          if (error) throw error;
          const { data } = supabase.storage.from('logos-empresas').getPublicUrl(path);
          set('logoUrl', `${data.publicUrl}?v=${Date.now()}`);
        } catch {
          setLogoError('No se pudo subir el logo para los emails — se guardará igualmente el de la app.');
        }
      } catch {
        setLogoError('No se pudo leer la imagen del logo.');
      } finally {
        setLogoUploading(false);
      }
    })();
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    }
  };

  const handleReset = () => setDraft(prev => ({ ...prev, ...DEFAULT_BRAND_FIELDS }));

  const initials = draft.nombre
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?';

  const hayCambios = JSON.stringify(draft) !== JSON.stringify(config);
  const seccion = TODAS.find(x => x.id === activeTab)!;

  // Esc y pulsar fuera cierran solo si no hay nada sin guardar: así un formulario a medias no se pierde sin querer.
  const cerrarSiNoHayCambios = () => { if (!hayCambios) onClose(); };
  const cerrarRef = useRef(cerrarSiNoHayCambios);
  cerrarRef.current = cerrarSiNoHayCambios;
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);

  const previewText = contrastText(draft.brandColor);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-3 sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) cerrarSiNoHayCambios(); }}>
        <div role="dialog" aria-modal="true" aria-label="Configuración de Empresa" className="u-ajustes relative w-full max-w-6xl bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col h-[88vh] max-h-[860px] overflow-hidden animate-modal-pop">

          {/* Cabecera */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
            <h2 className="font-extrabold text-lg text-slate-800 flex items-center gap-2.5 font-display">
              <Building2 className="w-5 h-5 text-blue-600" /> Configuración de Empresa
            </h2>
            <button onClick={onClose} aria-label="Cerrar" title="Cerrar" className="p-1.5 hover:bg-slate-200 rounded-lg transition text-slate-400 cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col md:flex-row flex-1 min-h-0">
            {/* Menú de secciones */}
            <nav role="tablist" aria-label="Secciones de la configuración" aria-orientation="vertical" className="md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/70 p-3 md:p-4 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto">
              {GRUPOS.map(g => (
                <div key={g.titulo} className="flex md:flex-col gap-1 md:mb-3">
                  <p className="hidden md:block px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{g.titulo}</p>
                  {g.items.map(sec => {
                    const Icono = sec.icono;
                    const activa = activeTab === sec.id;
                    return (
                      <button
                        key={sec.id}
                        role="tab"
                        id={`ajustes-tab-${sec.id}`}
                        aria-selected={activa}
                        aria-controls="ajustes-panel"
                        onClick={() => setActiveTab(sec.id)}
                        className={`shrink-0 flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-sm font-semibold transition cursor-pointer border ${activa ? 'bg-white text-slate-900 shadow-sm border-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900 border-transparent'}`}
                      >
                        <Icono className={`w-[18px] h-[18px] shrink-0 ${activa ? 'text-blue-600' : 'text-slate-400'}`} />
                        <span className="whitespace-nowrap md:whitespace-normal">{sec.titulo}</span>
                        {activa && <ChevronRight className="hidden md:block w-4 h-4 ml-auto text-slate-300" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Contenido de la sección */}
            <div role="tabpanel" id="ajustes-panel" aria-labelledby={`ajustes-tab-${activeTab}`} className="flex-1 min-w-0 overflow-y-auto p-5 md:p-8 space-y-6 bg-slate-50/40">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 font-display">{seccion.titulo}</h2>
                <p className="text-sm text-slate-500 mt-1">{seccion.descripcion}</p>
              </div>

              {activeTab === 'identidad' && (
                <div className="grid lg:grid-cols-2 gap-5" data-testid="seccion-identidad">
                  <Tarjeta titulo="Tu taller" ayuda="Así se llama en la aplicación, en los correos y en tus documentos.">
                    <Campo etiqueta="Nombre de la empresa *" id="cfg-nombre">
                      <input id="cfg-nombre" type="text" value={draft.nombre} onChange={e => set('nombre', e.target.value)} className={entrada} placeholder="Mi Empresa S.L." />
                    </Campo>
                    <Campo etiqueta="Descripción / Tagline" id="cfg-tagline">
                      <input id="cfg-tagline" type="text" value={draft.tagline} onChange={e => set('tagline', e.target.value)} className={entrada} placeholder="Mecánica y neumáticos en Madrid" />
                    </Campo>
                  </Tarjeta>
                  <Tarjeta titulo="Contacto" ayuda="Es lo que ven tus clientes en las facturas, los presupuestos y los correos.">
                    <Campo etiqueta="Correo electrónico" id="cfg-correo">
                      <input id="cfg-correo" type="email" value={draft.correo} onChange={e => set('correo', e.target.value)} className={entrada} placeholder="contacto@empresa.com" />
                    </Campo>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Campo etiqueta="Teléfono" id="cfg-telefono">
                        <input id="cfg-telefono" type="text" value={draft.telefono} onChange={e => set('telefono', e.target.value)} className={entrada} placeholder="(+34) 600 000 000" />
                      </Campo>
                      <Campo etiqueta="Ciudad" id="cfg-ciudad">
                        <input id="cfg-ciudad" type="text" value={draft.ciudad} onChange={e => set('ciudad', e.target.value)} className={entrada} placeholder="Madrid, Barcelona..." />
                      </Campo>
                    </div>
                    <Campo etiqueta="Sitio web" id="cfg-web">
                      <input id="cfg-web" type="text" value={draft.web} onChange={e => set('web', e.target.value)} className={entrada} placeholder="www.miempresa.com" />
                    </Campo>
                  </Tarjeta>
                </div>
              )}

              {activeTab === 'fiscal' && (
                <div className="space-y-5" data-testid="seccion-fiscal">
                  <div className="grid lg:grid-cols-2 gap-5">
                    <Tarjeta titulo="Datos fiscales" ayuda="Se muestran en las facturas.">
                      <Campo etiqueta="Razón social" id="cfg-razon">
                        <input id="cfg-razon" type="text" value={draft.razonSocial} onChange={e => set('razonSocial', e.target.value)} className={entrada} placeholder="Mi Empresa S.L." />
                      </Campo>
                      <Campo etiqueta="NIF / CIF" id="cfg-nif">
                        <input id="cfg-nif" type="text" value={draft.nif} onChange={e => set('nif', e.target.value)} className={entrada} placeholder="B-00000000" />
                      </Campo>
                      <Campo etiqueta="Dirección fiscal" id="cfg-direccion">
                        <input id="cfg-direccion" type="text" value={draft.direccionFiscal} onChange={e => set('direccionFiscal', e.target.value)} className={entrada} placeholder="Calle Mayor 45, Planta 2, Madrid" />
                      </Campo>
                    </Tarjeta>

                    <Tarjeta titulo="Numeración de facturas" ayuda="Solo se puede cambiar antes de emitir la primera factura: sirve para continuar la numeración de un sistema anterior. Una vez emitida la primera, queda bloqueada por ley (numeración correlativa, sin huecos).">
                      <div className="grid grid-cols-2 gap-4">
                        <Campo etiqueta="Prefijo" id="cfg-prefijo">
                          <input id="cfg-prefijo" type="text" value={draft.facturaPrefijo} onChange={e => set('facturaPrefijo', e.target.value)} className={`${entrada} font-mono`} placeholder="FAC-" />
                        </Campo>
                        <Campo etiqueta="Próximo número" id="cfg-numero">
                          <input id="cfg-numero" type="number" min="1" step="1" value={draft.siguienteNumeroFactura}
                            onChange={e => setDraft(prev => ({ ...prev, siguienteNumeroFactura: Math.max(1, Number(e.target.value) || 1) }))} className={`${entrada} font-mono`} />
                        </Campo>
                      </div>
                      <p className="text-sm text-slate-500">
                        Próxima factura: <span className="font-mono font-semibold text-slate-800">{draft.facturaPrefijo}{String(draft.siguienteNumeroFactura).padStart(4, '0')}</span>
                      </p>
                    </Tarjeta>
                  </div>

                  {/* Envío a la AEAT (VERI*FACTU) */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5"><VerifactuSettings draft={draft} setDraft={setDraft} /></div>

                  <Tarjeta titulo="QR de verificación" ayuda="El QR remite a la AEAT, que solo puede confirmar la factura si ya la has enviado. Actívalo cuando el envío esté en Producción; en Pruebas déjalo desactivado, porque las facturas todavía no constan en la AEAT.">
                    <label className="flex items-center justify-between gap-4 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 cursor-pointer">
                      <span className="text-sm text-slate-700">Mostrar QR de verificación en las facturas</span>
                      <input type="checkbox" checked={draft.facturaMostrarQr} onChange={e => setDraft(prev => ({ ...prev, facturaMostrarQr: e.target.checked }))} className="w-5 h-5 shrink-0 cursor-pointer" />
                    </label>
                  </Tarjeta>
                </div>
              )}

              {activeTab === 'marca' && (
                <div className="grid lg:grid-cols-2 gap-5" data-testid="seccion-marca">
                  <Tarjeta titulo="Logo" ayuda="Sale en la aplicación, en las facturas, en las órdenes impresas y en los correos a tus clientes.">
                    <div className="flex items-center gap-5">
                      <div className="w-24 h-24 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 shadow-md border border-slate-200" style={{ backgroundColor: draft.brandColor }}>
                        {draft.logoBase64 ? (
                          <img src={draft.logoBase64} alt="logo" className="w-full h-full object-contain" />
                        ) : (
                          <span className="font-black text-3xl tracking-tighter" style={{ color: previewText }}>{initials}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 items-start">
                        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-semibold rounded-xl border border-blue-200 transition cursor-pointer">
                          <Upload className="w-4 h-4" /> Subir imagen
                        </button>
                        {draft.logoBase64 && (
                          <button onClick={() => { set('logoBase64', ''); set('logoUrl', ''); }} className="text-sm text-slate-500 hover:text-rose-600 transition cursor-pointer">Eliminar logo</button>
                        )}
                        {logoUploading && <p className="text-sm text-blue-600">Subiendo logo para los emails…</p>}
                        {logoError && <p className="text-sm text-rose-600">{logoError}</p>}
                        {!logoUploading && !logoError && <p className="text-[13px] text-slate-500">PNG, JPG o SVG — máx. 2 MB</p>}
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </div>
                  </Tarjeta>

                  <Tarjeta titulo="Color de marca" ayuda="El color de tu taller en botones, menús y enlaces.">
                    <div className="grid grid-cols-6 gap-3">
                      {BRAND_COLORS.map(c => (
                        <button
                          key={c.value}
                          title={c.label}
                          aria-label={c.label}
                          onClick={() => set('brandColor', c.value)}
                          className="w-10 h-10 rounded-xl border-2 transition-transform hover:scale-110 shadow-sm cursor-pointer"
                          style={{
                            backgroundColor: c.value,
                            borderColor: draft.brandColor === c.value ? '#ffffff' : 'transparent',
                            outline: draft.brandColor === c.value ? `2px solid ${c.value}` : 'none',
                            outlineOffset: '1px',
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <input type="color" value={draft.brandColor} onChange={e => set('brandColor', e.target.value)} aria-label="Color personalizado" className="w-12 h-12 rounded-xl border border-slate-200 cursor-pointer p-0.5" />
                      <div>
                        <p className="text-sm text-slate-600">Color personalizado</p>
                        <p className="text-sm font-mono text-slate-800">{draft.brandColor}</p>
                      </div>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                      <div className="px-4 py-3.5 flex items-center gap-3" style={{ backgroundColor: draft.brandColor, color: previewText }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0" style={{ backgroundColor: `${previewText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: previewText }}>{initials}</div>
                        <div className="min-w-0">
                          <p className="font-bold leading-tight text-sm truncate">{draft.nombre || 'Nombre empresa'}</p>
                          <p className="text-xs opacity-80 truncate">{draft.tagline || 'Descripción'}</p>
                        </div>
                      </div>
                      <div className="px-4 py-2.5 bg-white text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-semibold" style={{ color: draft.brandColor }}>Vista previa</span>
                        <span className="ml-auto font-mono">{draft.brandColor} · texto {previewText === '#ffffff' ? 'blanco' : 'negro'}</span>
                      </div>
                    </div>
                  </Tarjeta>
                </div>
              )}

              {activeTab === 'recordatorios' && (
                <div className="space-y-5 max-w-4xl">
                  <Tarjeta>
                    <label className="flex items-start justify-between gap-4 cursor-pointer">
                      <span className="text-sm text-slate-700 flex items-start gap-3 leading-relaxed">
                        <Mail className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                        Enviar por email a los clientes, automáticamente, los recordatorios de ITV, seguro e impuesto y los avisos del cambio de aceite (resumen al entregar, recordatorio antes del próximo cambio y último aviso si no vuelve).
                      </span>
                      <input type="checkbox" checked={draft.recordatoriosAutomaticosActivos} onChange={e => setDraft(prev => ({ ...prev, recordatoriosAutomaticosActivos: e.target.checked }))} className="w-5 h-5 shrink-0 mt-0.5 cursor-pointer" />
                    </label>
                  </Tarjeta>
                  <Tarjeta titulo="Mensaje de cada recordatorio" ayuda={<>Viene con el texto por defecto: puedes editarlo o dejarlo tal cual. Variables disponibles: {VARIABLES_DISPONIBLES.join(', ')}.</>}>
                    {(Object.keys(TIPO_LABEL) as AlertaTipo[]).map(tipo => (
                      <div key={tipo}>
                        <label htmlFor={`cfg-plantilla-${tipo}`} className="block text-sm font-semibold text-slate-700 mb-1.5 flex items-center gap-2">
                          <MessageSquareText className="w-4 h-4 text-slate-400" /> {TIPO_LABEL[tipo]}
                        </label>
                        <textarea
                          id={`cfg-plantilla-${tipo}`}
                          rows={4}
                          value={draft.plantillasRecordatorios[tipo] ?? PLANTILLA_DEFAULT[tipo]}
                          onChange={e => setDraft(prev => ({ ...prev, plantillasRecordatorios: { ...prev.plantillasRecordatorios, [tipo]: e.target.value } }))}
                          className={`${entrada} leading-relaxed`}
                        />
                      </div>
                    ))}
                  </Tarjeta>
                </div>
              )}

              {activeTab === 'reservas' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-4xl">
                  <AjustesReservas empresaId={config.id} nombreEmpresa={config.nombre} recordatoriosActivos={draft.recordatoriosAutomaticosActivos} />
                </div>
              )}

              {activeTab === 'inspeccion' && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 max-w-4xl">
                  <AjustesInspeccion />
                </div>
              )}

              {activeTab === 'fotos' && (
                <div className="space-y-5 max-w-3xl" data-testid="ajustes-fotos">
                  <Tarjeta titulo="Conservar las fotos de cada orden">
                    <select
                      id="fotos-retencion"
                      aria-label="Conservar las fotos de cada orden"
                      value={draft.fotosRetencionMeses}
                      onChange={e => setDraft(prev => ({ ...prev, fotosRetencionMeses: Number(e.target.value) as Empresa['fotosRetencionMeses'] }))}
                      className={`${entrada} bg-white`}
                    >
                      <option value={3}>3 meses después de la entrega</option>
                      <option value={6}>6 meses después de la entrega (recomendado)</option>
                      <option value={12}>12 meses después de la entrega</option>
                      <option value={24}>24 meses después de la entrega</option>
                    </select>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3.5 text-sm text-slate-600 space-y-2 leading-relaxed">
                      <p>Pasado ese plazo se borran solas las <b>fotos</b> de recepción y de inspección: así no se acumulan archivos con matrículas y personas más tiempo del necesario.</p>
                      <p>Se conservan siempre el texto, los estados, las notas, los precios y lo que respondió el cliente.</p>
                      <p>Antes de borrar, te avisamos por correo (como mucho una vez por semana) con las órdenes afectadas. En cada orden puedes marcar «Conservar las fotos» si hay una reclamación abierta.</p>
                    </div>
                    <p className="text-sm text-slate-500" data-testid="uso-almacenamiento">
                      {uso === null ? 'Calculando el espacio ocupado…' : uso.archivos === 0 ? 'Aún no hay fotos ni logos guardados.' : <>Espacio ocupado por fotos y logos: <b>{formatearBytes(uso.bytes)}</b> en {uso.archivos} archivo{uso.archivos === 1 ? '' : 's'}.</>}
                    </p>
                  </Tarjeta>
                </div>
              )}

              {activeTab === 'tecnicos' && (
                <div className="space-y-5 max-w-4xl">
                  <Tarjeta>
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-orange-500" /> Técnicos del taller
                      </h3>
                      <button onClick={() => openTecnicoForm()} className="flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition cursor-pointer">
                        <Plus className="w-4 h-4" /> Añadir
                      </button>
                    </div>

                    {tecnicoForm !== null && (
                      <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
                        <div className="grid sm:grid-cols-3 gap-3">
                          <input type="text" value={tecnicoForm.nombre} onChange={e => setTecnicoForm(f => f ? { ...f, nombre: e.target.value } : f)} placeholder="Nombre del técnico *" aria-label="Nombre del técnico" className={entrada} />
                          <input type="text" value={tecnicoForm.especialidad} onChange={e => setTecnicoForm(f => f ? { ...f, especialidad: e.target.value } : f)} placeholder="Especialidad (opcional)" aria-label="Especialidad" className={entrada} />
                          <input type="tel" value={tecnicoForm.telefono} onChange={e => setTecnicoForm(f => f ? { ...f, telefono: e.target.value } : f)} placeholder="Teléfono WhatsApp (opcional)" aria-label="Teléfono WhatsApp" className={entrada} />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setTecnicoForm(null); setEditingTecnicoId(null); }} className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 bg-white rounded-xl hover:bg-slate-100 transition cursor-pointer">Cancelar</button>
                          <button onClick={handleSaveTecnico} className="px-4 py-2 text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
                            <Check className="w-4 h-4" /> Guardar
                          </button>
                        </div>

                        {editingTecnicoId && (() => {
                          const actual = tecnicos.find(t => t.id === editingTecnicoId);
                          return (
                            <div className="border-t border-orange-200 pt-3">
                              <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Portal del Mecánico</p>
                              {actual?.portalToken ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                                    <span className="text-sm text-slate-600 truncate flex-1 font-mono">{window.location.origin}/mecanico/{actual.portalToken}</span>
                                    <button onClick={() => handleCopiarPortalTecnico(actual.portalToken!)} aria-label="Copiar enlace" className="text-slate-400 hover:text-blue-600 shrink-0 cursor-pointer"><Copy className="w-4 h-4" /></button>
                                  </div>
                                  {portalTecnicoCopiado && <p className="text-sm text-green-600 font-semibold">Enlace copiado</p>}
                                  <button onClick={handleRevocarPortalTecnico} disabled={portalTecnicoBusy} className="text-sm text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                                    <ShieldOff className="w-4 h-4" /> Revocar enlace
                                  </button>
                                </div>
                              ) : (
                                <button onClick={handleGenerarPortalTecnico} disabled={portalTecnicoBusy} className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
                                  <RefreshCw className="w-4 h-4" /> {portalTecnicoBusy ? 'Generando…' : 'Generar enlace'}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {tecnicos.length === 0 ? (
                      <p className="text-sm text-slate-400 italic text-center py-4">Sin técnicos registrados.</p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {tecnicos.map(t => (
                          <div key={t.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                            <div className="min-w-0">
                              <p className="text-[15px] font-semibold text-slate-800">{t.nombre}</p>
                              {t.especialidad && <p className="text-sm text-slate-500">{t.especialidad}</p>}
                              {t.telefono && <p className="text-sm text-slate-500">{t.telefono}</p>}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => openTecnicoForm(t)} aria-label={`Editar ${t.nombre}`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer"><Edit2 className="w-4 h-4" /></button>
                              <button onClick={() => handleDeleteTecnico(t.id)} aria-label={`Eliminar ${t.nombre}`} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Tarjeta>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <div role="alert" className="px-6 py-3 border-t border-rose-100 bg-rose-50 text-rose-700 text-sm font-medium shrink-0">{saveError}</div>
          )}

          {/* Pie fijo */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <button onClick={handleReset} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition cursor-pointer">
                <RotateCcw className="w-4 h-4" /> Restaurar por defecto
              </button>
              {hayCambios && (
                <span data-testid="cambios-sin-guardar" className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">Cambios sin guardar</span>
              )}
            </div>
            <div className="flex gap-3 items-center">
              {GUARDAN_SOLAS.includes(activeTab) && (
                <span className="hidden lg:block text-[13px] text-slate-500 mr-1">
                  {activeTab === 'reservas' ? 'Las reservas tienen su propio botón de guardar.' : 'Esta sección se guarda al momento.'}
                </span>
              )}
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl border border-slate-200 bg-white transition cursor-pointer">
                {hayCambios ? 'Cancelar' : 'Cerrar'}
              </button>
              <button onClick={handleSave} className="px-5 py-2.5 text-sm font-bold text-white rounded-xl transition flex items-center gap-1.5 cursor-pointer" style={{ backgroundColor: saved ? '#16a34a' : draft.brandColor }}>
                {saved ? <><Check className="w-4 h-4" /> Guardado</> : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
