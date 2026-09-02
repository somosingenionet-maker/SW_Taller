import { useState, useMemo, useEffect } from 'react';
import {
  CalendarClock, Plus, ChevronLeft, ChevronRight, X, Check, Trash2, Pencil,
  Clock, User, Car, Wrench, AlertTriangle, ClipboardCheck, Ban, ArrowRightCircle,
} from 'lucide-react';
import { Cita, Vehiculo, Cliente, Tecnico, OrdenTrabajo, OTEstado, EventoOT } from '../types';
import { listTecnicos } from '../lib/data/tecnicos';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  citas: Cita[];
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  ordenes: OrdenTrabajo[];
  onAddCita: (c: Omit<Cita, 'id'>) => void | Promise<Cita>;
  onUpdateCita: (id: string, cambios: Partial<Omit<Cita, 'id'>>) => void | Promise<Cita>;
  onDeleteCita: (id: string) => void | Promise<void>;
  onCreateOT: (ot: OrdenTrabajo) => void | Promise<OrdenTrabajo>;
}

const ESTADO_META: Record<Cita['estado'], { label: string; color: string; bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: 'text-amber-700',  bg: 'bg-amber-50' },
  confirmada: { label: 'Confirmada', color: 'text-teal-700',   bg: 'bg-teal-50' },
  cancelada:  { label: 'Cancelada',  color: 'text-rose-600',   bg: 'bg-rose-50' },
  convertida: { label: 'Convertida', color: 'text-slate-500',  bg: 'bg-slate-100' },
};

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function localKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function addMonths(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(1); // evita que un día 31 "salte" un mes al cambiar a uno más corto
  copy.setMonth(copy.getMonth() + n);
  copy.setDate(Math.min(d.getDate(), new Date(copy.getFullYear(), copy.getMonth() + 1, 0).getDate()));
  return copy;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

type Vista = 'dia' | 'semana' | 'mes';
const VISTAS: { id: Vista; label: string }[] = [
  { id: 'dia', label: 'Día' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
];

function evento(descripcion: string): EventoOT {
  return { fecha: new Date().toISOString(), descripcion };
}

interface CitaForm {
  modo: 'registrado' | 'nuevo';
  fecha: string;
  hora: string;
  duracionMinutos: number | '';
  clienteId: string;
  vehiculoId: string;
  contactoNombre: string;
  contactoTelefono: string;
  vehiculoDescripcion: string;
  motivo: string;
  tecnicoId: string;
  notas: string;
}

function emptyForm(dia: Date): CitaForm {
  return {
    modo: 'registrado',
    fecha: localKey(dia),
    hora: '09:00',
    duracionMinutos: 60,
    clienteId: '',
    vehiculoId: '',
    contactoNombre: '',
    contactoTelefono: '',
    vehiculoDescripcion: '',
    motivo: '',
    tecnicoId: '',
    notas: '',
  };
}

function citaToForm(c: Cita): CitaForm {
  const d = new Date(c.fechaHora);
  return {
    modo: c.clienteId ? 'registrado' : 'nuevo',
    fecha: localKey(d),
    hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    duracionMinutos: c.duracionMinutos,
    clienteId: c.clienteId ?? '',
    vehiculoId: c.vehiculoId ?? '',
    contactoNombre: c.contactoNombre ?? '',
    contactoTelefono: c.contactoTelefono ?? '',
    vehiculoDescripcion: c.vehiculoDescripcion ?? '',
    motivo: c.motivo,
    tecnicoId: c.tecnicoId ?? '',
    notas: c.notas ?? '',
  };
}

/** Rango [inicio, fin) en ms para una cita, a partir de la fecha/hora ISO y su duración. */
function rango(fechaHora: string, duracionMinutos: number): [number, number] {
  const inicio = new Date(fechaHora).getTime();
  return [inicio, inicio + duracionMinutos * 60000];
}

function seSolapan(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export default function AgendaTab({ citas, vehiculos, clientes, ordenes, onAddCita, onUpdateCita, onDeleteCita, onCreateOT }: Props) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  useEffect(() => { listTecnicos().then(setTecnicos); }, []);

  const [vista, setVista] = useState<Vista>('dia');
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const weekStart = useMemo(() => startOfWeek(selectedDay), [selectedDay]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const handlePrev = () => setSelectedDay((d) => (vista === 'mes' ? addMonths(d, -1) : addDays(d, -7)));
  const handleNext = () => setSelectedDay((d) => (vista === 'mes' ? addMonths(d, 1) : addDays(d, 7)));

  const irADia = (d: Date) => {
    setSelectedDay(d);
    setVista('dia');
  };

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CitaForm>(() => emptyForm(new Date()));
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Cita | null>(null);
  const [convertirCita, setConvertirCita] = useState<Cita | null>(null);

  const citasDelDia = useMemo(() => {
    const key = localKey(selectedDay);
    return citas
      .filter((c) => localKey(new Date(c.fechaHora)) === key)
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
  }, [citas, selectedDay]);

  const vehiculoLabel = (id?: string) => {
    if (!id) return null;
    const v = vehiculos.find((x) => x.id === id);
    return v ? `${v.marca} ${v.modelo} · ${v.matricula}` : null;
  };
  const clienteLabel = (id?: string) => {
    if (!id) return null;
    const c = clientes.find((x) => x.id === id);
    return c ? `${c.nombre} ${c.apellidos}` : null;
  };

  const openCreate = () => {
    setForm(emptyForm(selectedDay));
    setEditingId(null);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (c: Cita) => {
    setForm(citaToForm(c));
    setEditingId(c.id);
    setFormError('');
    setShowForm(true);
  };

  const fechaHoraForm = useMemo(() => {
    if (!form.fecha || !form.hora) return null;
    const d = new Date(`${form.fecha}T${form.hora}:00`);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }, [form.fecha, form.hora]);

  const solapamiento = useMemo(() => {
    if (!fechaHoraForm || form.duracionMinutos === '') return null;
    const rangoForm = rango(fechaHoraForm, Number(form.duracionMinutos));
    const key = localKey(new Date(fechaHoraForm));
    const candidatas = citas.filter((c) => {
      if (c.id === editingId) return false;
      if (c.estado === 'cancelada') return false;
      if (localKey(new Date(c.fechaHora)) !== key) return false;
      if (form.tecnicoId && c.tecnicoId && c.tecnicoId !== form.tecnicoId) return false;
      return seSolapan(rangoForm, rango(c.fechaHora, c.duracionMinutos));
    });
    if (candidatas.length === 0) return null;
    return { candidatas, mismoTecnico: form.tecnicoId ? candidatas.filter((c) => c.tecnicoId === form.tecnicoId) : [] };
  }, [citas, fechaHoraForm, form.duracionMinutos, form.tecnicoId, editingId]);

  const handleSave = async () => {
    setFormError('');
    if (!fechaHoraForm) { setFormError('Indica una fecha y hora válidas.'); return; }
    if (!form.motivo.trim()) { setFormError('El motivo de la cita es obligatorio.'); return; }
    if (form.duracionMinutos === '' || Number(form.duracionMinutos) <= 0) { setFormError('Indica una duración válida.'); return; }
    if (form.modo === 'registrado' && !form.clienteId) { setFormError('Selecciona un cliente registrado.'); return; }
    if (form.modo === 'nuevo' && !form.contactoNombre.trim()) { setFormError('Indica el nombre de contacto.'); return; }

    const cambios: Omit<Cita, 'id'> = {
      fechaHora: fechaHoraForm,
      duracionMinutos: Number(form.duracionMinutos),
      clienteId: form.modo === 'registrado' ? form.clienteId : undefined,
      vehiculoId: form.modo === 'registrado' ? (form.vehiculoId || undefined) : undefined,
      contactoNombre: form.modo === 'nuevo' ? form.contactoNombre.trim() : undefined,
      contactoTelefono: form.modo === 'nuevo' ? (form.contactoTelefono.trim() || undefined) : undefined,
      vehiculoDescripcion: form.modo === 'nuevo' ? (form.vehiculoDescripcion.trim() || undefined) : undefined,
      motivo: form.motivo.trim(),
      tecnicoId: form.tecnicoId || undefined,
      estado: editingId ? (citas.find((c) => c.id === editingId)?.estado ?? 'pendiente') : 'pendiente',
      notas: form.notas.trim() || undefined,
      otId: editingId ? citas.find((c) => c.id === editingId)?.otId : undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await onUpdateCita(editingId, cambios);
      } else {
        await onAddCita(cambios);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar la cita.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    await onDeleteCita(confirmDelete.id);
    setConfirmDelete(null);
  };

  const handleCambiarEstado = async (c: Cita, estado: Cita['estado']) => {
    await onUpdateCita(c.id, { estado });
  };

  const hoy = localKey(new Date());

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-2 border border-slate-200 rounded-2xl text-slate-500 hover:bg-slate-50 transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedDay(new Date())}
            className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-2xl hover:bg-slate-50 transition cursor-pointer"
          >
            Hoy
          </button>
          <button
            onClick={handleNext}
            className="p-2 border border-slate-200 rounded-2xl text-slate-500 hover:bg-slate-50 transition cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Nueva cita
        </button>
      </div>

      {/* Selector de vista */}
      <div className="flex gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl w-fit">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            onClick={() => setVista(v.id)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${
              vista === v.id ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Tira de 7 días */}
      {vista === 'dia' && (
      <>
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((d, i) => {
          const key = localKey(d);
          const activo = key === localKey(selectedDay);
          const esHoy = key === hoy;
          const nCitas = citas.filter((c) => localKey(new Date(c.fechaHora)) === key && c.estado !== 'cancelada').length;
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(d)}
              className={`flex flex-col items-center py-3 rounded-2xl border transition cursor-pointer ${
                activo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${activo ? 'text-blue-100' : 'text-slate-400'}`}>{DIAS_SEMANA[i]}</span>
              <span className={`text-lg font-extrabold mt-0.5 ${esHoy && !activo ? 'text-blue-600' : ''}`}>{d.getDate()}</span>
              {nCitas > 0 && (
                <span className={`mt-1 text-[9px] font-bold px-1.5 rounded-full ${activo ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                  {nCitas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista del día */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">
            {selectedDay.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <span className="text-xs text-slate-400">{citasDelDia.length} cita{citasDelDia.length !== 1 ? 's' : ''}</span>
        </div>

        {citasDelDia.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarClock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hay citas programadas este día.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {citasDelDia.map((c) => {
              const meta = ESTADO_META[c.estado];
              const tecnico = tecnicos.find((t) => t.id === c.tecnicoId);
              const veh = vehiculoLabel(c.vehiculoId) ?? c.vehiculoDescripcion;
              const cli = clienteLabel(c.clienteId) ?? c.contactoNombre;
              return (
                <div key={c.id} className="px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/60 transition">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex flex-col items-center shrink-0 w-14">
                      <Clock className="w-3.5 h-3.5 text-slate-300 mb-0.5" />
                      <span className="text-sm font-extrabold text-slate-800">
                        {new Date(c.fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-[10px] text-slate-400">{c.duracionMinutos} min</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800 truncate">{c.motivo}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.bg} ${meta.color}`}>{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-slate-500">
                        {cli && (
                          <span className="flex items-center gap-1"><User className="w-3 h-3" /> {cli}{!c.clienteId && ' (sin registrar)'}</span>
                        )}
                        {veh && <span className="flex items-center gap-1"><Car className="w-3 h-3" /> {veh}</span>}
                        {tecnico && <span className="flex items-center gap-1"><Wrench className="w-3 h-3" /> {tecnico.nombre}</span>}
                      </div>
                      {c.otId && (
                        <p className="text-[10px] text-teal-600 font-semibold mt-1">
                          {ordenes.find((o) => o.id === c.otId)?.numero ? `Convertida en OT ${ordenes.find((o) => o.id === c.otId)?.numero}` : 'Convertida en OT'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(c.estado === 'pendiente' || c.estado === 'confirmada') && (
                      <button onClick={() => setConvertirCita(c)} title="Convertir en OT" className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition cursor-pointer">
                        <ArrowRightCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {c.estado === 'pendiente' && (
                      <button onClick={() => handleCambiarEstado(c, 'confirmada')} title="Confirmar cita" className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition cursor-pointer">
                        <ClipboardCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(c.estado === 'pendiente' || c.estado === 'confirmada') && (
                      <button onClick={() => handleCambiarEstado(c, 'cancelada')} title="Cancelar cita" className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition cursor-pointer">
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => openEdit(c)} title="Editar" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(c)} title="Eliminar" className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}

      {/* Vista semanal */}
      {vista === 'semana' && (
        <VistaSemanal
          weekDays={weekDays}
          citas={citas}
          tecnicos={tecnicos}
          hoy={hoy}
          clienteLabel={clienteLabel}
          onSelectCita={openEdit}
          onSelectDay={irADia}
        />
      )}

      {/* Vista mensual */}
      {vista === 'mes' && (
        <VistaMensual
          mesAncla={selectedDay}
          citas={citas}
          hoy={hoy}
          clienteLabel={clienteLabel}
          onSelectCita={openEdit}
          onSelectDay={irADia}
        />
      )}

      {/* Crear / editar cita */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl rounded-3xl flex flex-col max-h-[88vh] overflow-hidden animate-modal-pop">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white shrink-0">
              <div className="flex items-center gap-2.5">
                <CalendarClock className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm tracking-tight">{editingId ? 'Editar cita' : 'Nueva cita'}</span>
              </div>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-800 rounded-2xl transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha *</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Hora *</label>
                  <input type="time" value={form.hora} onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Duración (minutos) *</label>
                <input type="number" min="5" step="5" value={form.duracionMinutos}
                  onChange={(e) => setForm((f) => ({ ...f, duracionMinutos: e.target.value === '' ? '' : Number(e.target.value) }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => setForm((f) => ({ ...f, modo: 'registrado' }))}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${form.modo === 'registrado' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  Cliente registrado
                </button>
                <button onClick={() => setForm((f) => ({ ...f, modo: 'nuevo' }))}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${form.modo === 'nuevo' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-500 border-slate-200'}`}>
                  Cliente nuevo
                </button>
              </div>

              {form.modo === 'registrado' ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo (opcional)</label>
                    <select value={form.vehiculoId}
                      onChange={(e) => {
                        const vehId = e.target.value;
                        const dueno = clientes.find((c) => c.vehiculosAsociados?.includes(vehId));
                        setForm((f) => ({ ...f, vehiculoId: vehId, clienteId: dueno?.id ?? f.clienteId }));
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">Sin vehículo concreto</option>
                      {vehiculos.map((v) => (
                        <option key={v.id} value={v.id}>{v.marca} {v.modelo} · {v.matricula}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente *</label>
                    <select value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                      <option value="">Seleccionar cliente...</option>
                      {clientes.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de contacto *</label>
                    <input type="text" value={form.contactoNombre} onChange={(e) => setForm((f) => ({ ...f, contactoNombre: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Nombre y apellidos" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                    <input type="text" value={form.contactoTelefono} onChange={(e) => setForm((f) => ({ ...f, contactoTelefono: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo (descripción libre)</label>
                    <input type="text" value={form.vehiculoDescripcion} onChange={(e) => setForm((f) => ({ ...f, vehiculoDescripcion: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Marca, modelo, color..." />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Motivo *</label>
                <input type="text" value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Revisión de frenos, cambio de aceite..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Técnico (opcional)</label>
                <select value={form.tecnicoId} onChange={(e) => setForm((f) => ({ ...f, tecnicoId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                  <option value="">Sin asignar</option>
                  {tecnicos.filter((t) => t.activo).map((t) => <option key={t.id} value={t.id}>{t.nombre}{t.especialidad ? ` · ${t.especialidad}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                <textarea value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} rows={2}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>

              {solapamiento && (
                <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-4 py-2.5 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {solapamiento.mismoTecnico.length > 0
                      ? `${tecnicos.find((t) => t.id === form.tecnicoId)?.nombre ?? 'Este técnico'} ya tiene ${solapamiento.mismoTecnico.length > 1 ? `${solapamiento.mismoTecnico.length} citas` : 'otra cita'} a esa hora.`
                      : `Se solapa con ${solapamiento.candidatas.length} cita${solapamiento.candidatas.length !== 1 ? 's' : ''} ya programada${solapamiento.candidatas.length !== 1 ? 's' : ''} ese día${form.tecnicoId ? ' (sin técnico asignado)' : ''}.`}
                    {' '}Puedes guardarla igualmente.
                  </span>
                </div>
              )}

              {formError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{formError}</div>
              )}

              <button onClick={handleSave} disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60">
                <Check className="w-4 h-4" />
                {saving ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Crear cita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {convertirCita && (
        <ConvertirEnOTModal
          cita={convertirCita}
          vehiculos={vehiculos}
          clientes={clientes}
          ordenes={ordenes}
          onCreateOT={onCreateOT}
          onConvertida={async (otId) => {
            await onUpdateCita(convertirCita.id, { estado: 'convertida', otId });
            setConvertirCita(null);
          }}
          onClose={() => setConvertirCita(null)}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Eliminar cita"
        message={`Se eliminará la cita "${confirmDelete?.motivo}". Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

interface ConvertirModalProps {
  cita: Cita;
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  ordenes: OrdenTrabajo[];
  onCreateOT: (ot: OrdenTrabajo) => void | Promise<OrdenTrabajo>;
  onConvertida: (otId: string) => void | Promise<void>;
  onClose: () => void;
}

function ConvertirEnOTModal({ cita, vehiculos, clientes, ordenes, onCreateOT, onConvertida, onClose }: ConvertirModalProps) {
  const [vehiculoId, setVehiculoId] = useState(cita.vehiculoId ?? '');
  const [clienteId, setClienteId] = useState(cita.clienteId ?? '');
  const [createTipo, setCreateTipo] = useState<'presupuesto' | 'recibido'>('presupuesto');
  const [kilometraje, setKilometraje] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const datosCompletos = !!vehiculoId && !!clienteId;

  const handleConfirmar = async () => {
    setError('');
    if (!vehiculoId || !clienteId) { setError('Selecciona el vehículo y el cliente registrados.'); return; }
    if (createTipo === 'recibido' && kilometraje === '') { setError('Indica el kilometraje de entrada.'); return; }

    setSaving(true);
    try {
      const nextNum = 'OT-' + new Date().getFullYear() + '-' + String(ordenes.length + 1).padStart(3, '0');
      const ot: OrdenTrabajo = {
        id: 'ot-' + Date.now(),
        numero: nextNum,
        fechaActualizacion: new Date().toISOString(),
        historial: [evento(createTipo === 'presupuesto' ? 'Presupuesto creado desde cita' : 'Vehículo recibido en taller desde cita')],
        vehiculoId,
        clienteId,
        estado: createTipo as OTEstado,
        fechaRecepcion: new Date().toISOString().split('T')[0],
        kilometrajeEntrada: createTipo === 'recibido' ? Number(kilometraje) : 0,
        descripcionProblema: cita.motivo,
        notas: cita.notas,
        lineas: [],
        subtotal: 0,
        ivaPct: 21,
        totalIva: 0,
        total: 0,
      };
      const creada = await onCreateOT(ot);
      const otId = creada && typeof creada === 'object' && 'id' in creada ? creada.id : ot.id;
      await onConvertida(otId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la orden de trabajo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm animate-modal-pop p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Convertir en OT</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-xs text-slate-500">{cita.motivo}</p>

        {!datosCompletos && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-4 py-2.5 rounded-xl">
            Esta cita no tiene cliente/vehículo registrados. Complétalos para poder crear la OT.
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo *</label>
          <select value={vehiculoId}
            onChange={(e) => {
              const vehId = e.target.value;
              const dueno = clientes.find((c) => c.vehiculosAsociados?.includes(vehId));
              setVehiculoId(vehId);
              setClienteId(dueno?.id ?? '');
            }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Seleccionar vehículo...</option>
            {vehiculos.map((v) => <option key={v.id} value={v.id}>{v.marca} {v.modelo} · {v.matricula}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente *</label>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Seleccionar cliente...</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setCreateTipo('presupuesto')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${createTipo === 'presupuesto' ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-slate-500 border-slate-200'}`}>
            Presupuesto
          </button>
          <button onClick={() => setCreateTipo('recibido')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl border transition cursor-pointer ${createTipo === 'recibido' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-slate-500 border-slate-200'}`}>
            Vehículo recibido
          </button>
        </div>

        {createTipo === 'recibido' && (
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Kilometraje de entrada *</label>
            <input type="number" min="0" value={kilometraje} onChange={(e) => setKilometraje(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        )}

        {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

        <button onClick={handleConfirmar} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60">
          <Check className="w-4 h-4" /> {saving ? 'Creando…' : 'Crear orden de trabajo'}
        </button>
      </div>
    </div>
  );
}

interface VistaSemanalProps {
  weekDays: Date[];
  citas: Cita[];
  tecnicos: Tecnico[];
  hoy: string;
  clienteLabel: (id?: string) => string | null;
  onSelectCita: (c: Cita) => void;
  onSelectDay: (d: Date) => void;
}

/** Semana completa: una columna por día con sus citas ordenadas por hora. */
function VistaSemanal({ weekDays, citas, tecnicos, hoy, clienteLabel, onSelectCita, onSelectDay }: VistaSemanalProps) {
  const label = `${weekDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: weekDays[0].getMonth() === weekDays[6].getMonth() ? undefined : 'short' })} – ${weekDays[6].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800 capitalize">Semana del {label}</p>
      </div>
      <div className="overflow-x-auto p-3">
        <div className="grid grid-cols-7 gap-2 min-w-[770px]">
          {weekDays.map((d, i) => {
            const key = localKey(d);
            const esHoy = key === hoy;
            const citasDia = citas
              .filter((c) => localKey(new Date(c.fechaHora)) === key)
              .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
            return (
              <div key={key} className="flex flex-col bg-slate-50/60 border border-slate-100 rounded-2xl overflow-hidden">
                <button
                  onClick={() => onSelectDay(d)}
                  title="Ver el día"
                  className={`px-2 py-2 text-center border-b transition cursor-pointer ${
                    esHoy ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${esHoy ? 'text-blue-100' : 'text-slate-400'}`}>{DIAS_SEMANA[i]}</p>
                  <p className="text-sm font-extrabold">{d.getDate()}</p>
                </button>
                <div className="flex-1 p-1.5 space-y-1.5 min-h-[90px]">
                  {citasDia.length === 0 ? (
                    <p className="text-[10px] text-slate-300 text-center py-3">—</p>
                  ) : (
                    citasDia.map((c) => {
                      const meta = ESTADO_META[c.estado];
                      const tecnico = tecnicos.find((t) => t.id === c.tecnicoId);
                      const cli = clienteLabel(c.clienteId) ?? c.contactoNombre;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelectCita(c)}
                          className={`w-full text-left px-2 py-1.5 rounded-xl text-[10px] leading-tight transition hover:opacity-80 cursor-pointer ${meta.bg} ${meta.color}`}
                        >
                          <p className="font-extrabold">
                            {new Date(c.fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="truncate font-semibold">{c.motivo}</p>
                          {cli && <p className="truncate opacity-70">{cli}</p>}
                          {tecnico && <p className="truncate opacity-70">{tecnico.nombre}</p>}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface VistaMensualProps {
  mesAncla: Date;
  citas: Cita[];
  hoy: string;
  clienteLabel: (id?: string) => string | null;
  onSelectCita: (c: Cita) => void;
  onSelectDay: (d: Date) => void;
}

const MAX_CITAS_POR_CELDA = 3;

/** Calendario mensual clásico (6 semanas), con hasta 3 citas por celda y "+N más". */
function VistaMensual({ mesAncla, citas, hoy, clienteLabel, onSelectCita, onSelectDay }: VistaMensualProps) {
  const dias = useMemo(() => {
    const inicioGrid = startOfWeek(startOfMonth(mesAncla));
    return Array.from({ length: 42 }, (_, i) => addDays(inicioGrid, i));
  }, [mesAncla]);

  const label = mesAncla.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-bold text-slate-800 capitalize">{label}</p>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS_SEMANA.map((d) => (
            <p key={d} className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center py-1">{d}</p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const key = localKey(d);
            const enMes = d.getMonth() === mesAncla.getMonth();
            const esHoy = key === hoy;
            const citasDia = citas
              .filter((c) => localKey(new Date(c.fechaHora)) === key)
              .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora));
            return (
              <div
                key={key}
                onClick={() => onSelectDay(d)}
                className={`min-h-[92px] p-1.5 rounded-xl border transition cursor-pointer ${
                  esHoy ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-100'
                } ${enMes ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-50'}`}
              >
                <span className={`text-xs font-bold ${esHoy ? 'text-blue-600' : enMes ? 'text-slate-700' : 'text-slate-300'}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {citasDia.slice(0, MAX_CITAS_POR_CELDA).map((c) => {
                    const meta = ESTADO_META[c.estado];
                    const cli = clienteLabel(c.clienteId) ?? c.contactoNombre;
                    return (
                      <button
                        key={c.id}
                        onClick={(e) => { e.stopPropagation(); onSelectCita(c); }}
                        title={`${c.motivo}${cli ? ' · ' + cli : ''}`}
                        className={`w-full text-left text-[9px] px-1 py-0.5 rounded truncate font-semibold transition hover:opacity-80 cursor-pointer ${meta.bg} ${meta.color}`}
                      >
                        {new Date(c.fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} {c.motivo}
                      </button>
                    );
                  })}
                  {citasDia.length > MAX_CITAS_POR_CELDA && (
                    <p className="text-[9px] text-slate-400 font-bold pl-1">+{citasDia.length - MAX_CITAS_POR_CELDA} más</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
