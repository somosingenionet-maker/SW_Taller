import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ClipboardList, Plus, Search, ChevronRight, X, Check, Trash2,
  Car, User, Calendar, Gauge, Wrench, Package, AlertCircle, FileText,
  Bell, Printer, Pencil, MessageCircle, Mail, List, LayoutGrid, Camera, ImageOff
} from 'lucide-react';
import { OrdenTrabajo, OTEstado, LineaOT, LineaOTTipo, Vehiculo, Cliente, EventoOT, Tecnico, Empresa, Producto } from '../types';
import { listTecnicos, setPortalTokenTecnico } from '../lib/data/tecnicos';
import { supabase } from '../lib/supabase';
import SearchableSelect from './SearchableSelect';
import ConfirmDialog from './ConfirmDialog';

interface Props {
  ordenes: OrdenTrabajo[];
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  empresa: Empresa;
  productos: Producto[];
  onAdd: (ot: OrdenTrabajo) => void | Promise<OrdenTrabajo>;
  /** Devuelve la OT tal como quedó en el servidor (con los ids reales de sus líneas) — imprescindible para que ediciones encadenadas de líneas recién creadas se reconozcan como existentes en vez de generar un delete+insert espurio. */
  onUpdate: (ot: OrdenTrabajo) => Promise<OrdenTrabajo>;
  onDelete: (id: string) => void | Promise<void>;
  onCreateProducto: (p: Producto, stockInicial: number) => Promise<Producto>;
  /** El tablero necesita más ancho del que da el layout centrado normal — App.tsx usa esto para ensanchar el <main> solo mientras esta vista está activa. */
  onVistaAmpliaChange?: (amplia: boolean) => void;
}

const ESTADO_META: Record<OTEstado, { label: string; color: string; bg: string; dot: string }> = {
  presupuesto:   { label: 'Presupuesto',   color: 'text-violet-700', bg: 'bg-violet-50', dot: 'bg-violet-500' },
  recibido:      { label: 'Recibido',      color: 'text-slate-600',  bg: 'bg-slate-100', dot: 'bg-slate-500' },
  en_reparacion: { label: 'En reparación', color: 'text-orange-700', bg: 'bg-orange-50', dot: 'bg-orange-500' },
  listo:         { label: 'Listo',         color: 'text-cyan-700',   bg: 'bg-cyan-50', dot: 'bg-cyan-500' },
  entregado:     { label: 'Entregado',     color: 'text-teal-700',   bg: 'bg-teal-100', dot: 'bg-teal-500' },
  cancelado:     { label: 'Cancelado',     color: 'text-rose-600',   bg: 'bg-rose-50', dot: 'bg-rose-500' },
};

const ESTADO_FLOW: OTEstado[] = [
  'presupuesto', 'recibido', 'en_reparacion', 'listo', 'entregado'
];

/** Comprobación fija al recibir el vehículo — misma lista para todas las empresas. */
const CHECKLIST_RECEPCION_ITEMS = [
  'Neumáticos en buen estado',
  'Luces funcionando correctamente',
  'Sin daños visibles en la carrocería',
  'Documentación entregada (permiso, ITV)',
  'Objetos personales retirados',
];

const FOTO_MIME_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
};

const MAX_FOTOS_RECEPCION = 4;

const TIPO_META: Record<LineaOTTipo, { label: string; icon: React.ReactNode }> = {
  mano_de_obra: { label: 'Mano de obra', icon: <Wrench size={12} /> },
  producto:     { label: 'Producto',     icon: <Package size={12} /> },
};

const IVA_DEFAULT = 21;

interface LineaForm {
  tipo: LineaOTTipo;
  productoId?: string;
  descripcion: string;
  cantidad: number | '';
  precioUnitario: number | '';
  costoUnitario: number | '';
}

const EMPTY_LINEA: LineaForm = {
  tipo: 'mano_de_obra',
  productoId: undefined,
  descripcion: '',
  cantidad: 1,
  precioUnitario: '',
  costoUnitario: '',
};

/** Selector de tipo + (descripción libre o producto de catálogo), reutilizado
 * en los 4 formularios de línea (nueva/editar × crear-OT/editar-OT). Cuando
 * tipo='producto' el nombre queda fijado por el producto elegido — no se
 * edita a mano (así solo hay "un nombre": el del catálogo). */
function LineaTipoYProducto({
  form, setForm, productos, onSolicitarCrearProducto, bloquearTipo,
}: {
  form: LineaForm;
  setForm: (updater: (f: LineaForm) => LineaForm) => void;
  productos: Producto[];
  onSolicitarCrearProducto: (nombreBuscado: string, aplicar: (p: Producto) => void) => void;
  /** true cuando la línea ya existe en la OT (tipo/producto quedan fijos, solo cantidad/precio/costo editables). */
  bloquearTipo?: boolean;
}) {
  const opciones = productos.map((p) => ({
    value: p.id,
    label: p.nombre,
    sublabel: `Stock: ${p.stockActual} ${p.unidad} · Costo: ${p.costo.toFixed(2)} €`,
  }));

  const aplicarProducto = (p: Producto) => {
    setForm((f) => ({ ...f, productoId: p.id, descripcion: p.nombre, precioUnitario: p.precioVenta, costoUnitario: p.costo }));
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={form.tipo}
        disabled={bloquearTipo}
        onChange={(e) => setForm((f) => ({ ...EMPTY_LINEA, tipo: e.target.value as LineaOTTipo, cantidad: f.cantidad }))}
        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400"
      >
        {(Object.keys(TIPO_META) as LineaOTTipo[]).map((t) => <option key={t} value={t}>{TIPO_META[t].label}</option>)}
      </select>
      {form.tipo === 'producto' ? (
        bloquearTipo ? (
          <div className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-100 text-slate-500 truncate flex items-center" title={form.descripcion}>
            {form.descripcion || '—'}
          </div>
        ) : (
          <SearchableSelect
            options={opciones}
            value={form.productoId ?? ''}
            onChange={(val) => {
              const p = productos.find((x) => x.id === val);
              if (p) aplicarProducto(p);
            }}
            placeholder="Buscar producto..."
            emptyMessage="Sin productos — créalo escribiendo su nombre"
            onCreateNew={(termino) => onSolicitarCrearProducto(termino, aplicarProducto)}
            createLabel="Crear producto"
          />
        )
      ) : (
        <input
          type="text"
          placeholder="Descripción *"
          value={form.descripcion}
          onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
          className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none"
        />
      )}
    </div>
  );
}

interface OTForm {
  vehiculoId: string;
  clienteId: string;
  fechaRecepcion: string;
  fechaEstimadaEntrega: string;
  kilometrajeEntrada: number | '';
  descripcionProblema: string;
  diagnostico: string;
  tecnicoAsignado: string;
  notas: string;
  ivaPct: number;
}

const EMPTY_OT_FORM: OTForm = {
  vehiculoId: '',
  clienteId: '',
  fechaRecepcion: new Date().toISOString().split('T')[0],
  fechaEstimadaEntrega: '',
  kilometrajeEntrada: '',
  descripcionProblema: '',
  diagnostico: '',
  tecnicoAsignado: '',
  notas: '',
  ivaPct: IVA_DEFAULT,
};

function calcTotals(lineas: LineaOT[], ivaPct: number) {
  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const totalIva = subtotal * (ivaPct / 100);
  return { subtotal, totalIva, total: subtotal + totalIva };
}

function BadgeEstado({ estado, presupuestoEstado, presupuestoAprobado, notificacionEnviada }: {
  estado: OTEstado;
  presupuestoEstado?: 'pendiente' | 'enviado';
  presupuestoAprobado?: boolean;
  notificacionEnviada?: boolean;
}) {
  const m = ESTADO_META[estado];
  if (estado === 'presupuesto' && presupuestoEstado === 'enviado') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Enviado</span>;
  if (estado === 'recibido' && presupuestoAprobado) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">Aprobado</span>;
  if (estado === 'recibido' && !presupuestoAprobado) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pdte. diagnóstico</span>;
  if (estado === 'listo' && notificacionEnviada) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Notificado</span>;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.label}</span>;
}

function evento(descripcion: string): EventoOT {
  return { fecha: new Date().toISOString(), descripcion };
}

/** Iniciales para el avatar circular del cliente en cada tarjeta Kanban. */
function iniciales(nombre: string, apellidos: string): string {
  return `${nombre[0] ?? ''}${apellidos[0] ?? ''}`.toUpperCase();
}

function diasDesde(fechaISO: string): { texto: string; aviso: boolean } {
  const dias = Math.floor((Date.now() - new Date(fechaISO).getTime()) / 86400000);
  if (dias <= 0) return { texto: 'hoy', aviso: false };
  return { texto: `${dias} día${dias !== 1 ? 's' : ''}`, aviso: dias > 5 };
}

/** Vista alternativa a la tabla: una columna por estado (sin 'cancelado' — ese
 * se sigue viendo desde la lista con su filtro), arrastrar una tarjeta a otra
 * columna dispara el mismo cambio de estado que el desplegable "Avanzar
 * estado" del detalle (incluida la apertura del modal de recepción si
 * corresponde — ver handleEstadoChange). */
function KanbanBoard({
  ordenes, vehiculos, clientes, onSelect, onDrop, onRetrocesoBloqueado, dragOtId, setDragOtId, dragOverEstado, setDragOverEstado,
}: {
  ordenes: OrdenTrabajo[];
  vehiculos: Vehiculo[];
  clientes: Cliente[];
  onSelect: (ot: OrdenTrabajo) => void;
  onDrop: (ot: OrdenTrabajo, estado: OTEstado) => void;
  onRetrocesoBloqueado: (ot: OrdenTrabajo, estado: OTEstado) => void;
  dragOtId: string | null;
  setDragOtId: React.Dispatch<React.SetStateAction<string | null>>;
  dragOverEstado: OTEstado | null;
  setDragOverEstado: React.Dispatch<React.SetStateAction<OTEstado | null>>;
}) {
  const columnas = ESTADO_FLOW.map(estado => ({
    estado,
    items: ordenes.filter(o => o.estado === estado),
  }));

  // Solo para el aviso visual mientras se arrastra (dragOtId sí puede fiarse
  // aquí: por algo tan simple como resaltar en rojo un destino no hay
  // problema si tarda un pelín en confirmarse) — la decisión real de si el
  // drop es válido se hace en el propio onDrop, a partir del dataTransfer.
  const otArrastrada = dragOtId ? ordenes.find(o => o.id === dragOtId) : null;

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-2 items-start">
      {columnas.map(({ estado, items }) => {
        const meta = ESTADO_META[estado];
        const esDestino = dragOverEstado === estado;
        const esRetroceso = !!otArrastrada && ESTADO_FLOW.indexOf(estado) < ESTADO_FLOW.indexOf(otArrastrada.estado);
        return (
          <div
            key={estado}
            onDragOver={e => { e.preventDefault(); setDragOverEstado(estado); }}
            onDragLeave={() => setDragOverEstado(prev => (prev === estado ? null : prev))}
            onDrop={e => {
              e.preventDefault();
              setDragOverEstado(null);
              // El id viaja en el propio dataTransfer nativo (no en el estado
              // de React): entre el dragstart y este drop puede no haber dado
              // tiempo a que el setState de dragOtId se confirme todavía.
              const id = e.dataTransfer.getData('text/plain');
              const ot = ordenes.find(o => o.id === id);
              setDragOtId(null);
              if (!ot || ot.estado === estado) return;
              if (ESTADO_FLOW.indexOf(estado) < ESTADO_FLOW.indexOf(ot.estado)) {
                onRetrocesoBloqueado(ot, estado);
                return;
              }
              onDrop(ot, estado);
            }}
            className={`shrink-0 w-64 border rounded-2xl p-2.5 flex flex-col gap-2 max-h-[70vh] transition ${
              esDestino && esRetroceso ? 'border-rose-400 bg-rose-50/60'
              : esDestino ? 'border-blue-400 bg-blue-50/40'
              : 'border-slate-100 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2 px-1 pb-1">
              <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
              <span className={`text-xs font-extrabold uppercase tracking-wide ${meta.color}`}>{meta.label}</span>
              <span className={`ml-auto text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>{items.length}</span>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto px-0.5">
              {items.length === 0 && (
                <div className="border-2 border-dashed border-slate-200 rounded-xl h-14 flex items-center justify-center text-[11px] text-slate-400 font-medium">
                  sin órdenes
                </div>
              )}
              {items.map(ot => {
                const veh = vehiculos.find(v => v.id === ot.vehiculoId);
                const cli = clientes.find(c => c.id === ot.clienteId);
                const { texto, aviso } = diasDesde(ot.fechaRecepcion);
                return (
                  <div
                    key={ot.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', ot.id); setDragOtId(ot.id); }}
                    onDragEnd={() => { setDragOtId(null); setDragOverEstado(null); }}
                    onClick={() => onSelect(ot)}
                    className={`bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition ${dragOtId === ot.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-400 font-mono">{ot.numero}</span>
                      <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-full ${aviso ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{texto}</span>
                    </div>
                    <div className="text-xs font-extrabold text-slate-800">{veh ? `${veh.marca} ${veh.modelo}` : '—'}</div>
                    <div className="text-[10px] text-slate-400 font-mono mb-1.5">{veh?.matricula}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mb-1.5">
                      {cli && (
                        <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-[8px] font-extrabold shrink-0">
                          {iniciales(cli.nombre, cli.apellidos)}
                        </span>
                      )}
                      <span className="truncate">{cli ? `${cli.nombre} ${cli.apellidos}` : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-700">
                        {ot.total > 0 ? `${ot.total.toFixed(2)} €` : <span className="text-slate-300 font-normal">Por definir</span>}
                      </span>
                      {estado === 'presupuesto' && ot.presupuestoEstado === 'enviado' && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Enviado</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function OrdenesTrabajoTab({ ordenes, vehiculos, clientes, empresa, productos, onAdd, onUpdate, onDelete, onCreateProducto, onVistaAmpliaChange }: Props) {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  useEffect(() => { listTecnicos().then(setTecnicos); }, []);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState<OTEstado | 'todas'>('todas');
  const [vista, setVista] = useState<'lista' | 'kanban'>('lista');
  useEffect(() => {
    onVistaAmpliaChange?.(vista === 'kanban');
    return () => onVistaAmpliaChange?.(false);
  }, [vista, onVistaAmpliaChange]);
  const [dragOtId, setDragOtId] = useState<string | null>(null);
  const [dragOverEstado, setDragOverEstado] = useState<OTEstado | null>(null);
  const [kanbanAviso, setKanbanAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!kanbanAviso) return;
    const t = setTimeout(() => setKanbanAviso(null), 4000);
    return () => clearTimeout(t);
  }, [kanbanAviso]);
  const [selected, setSelected] = useState<OrdenTrabajo | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [guardandoOT, setGuardandoOT] = useState(false);
  const [createTipo, setCreateTipo] = useState<'presupuesto' | 'recibido'>('presupuesto');
  const [otForm, setOTForm] = useState<OTForm>(EMPTY_OT_FORM);
  const [formLineas, setFormLineas] = useState<LineaOT[]>([]);
  const [newLinea, setNewLinea] = useState<LineaForm>(EMPTY_LINEA);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [presupuestoPDF, setPresupuestoPDF] = useState<OrdenTrabajo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<OTForm>(EMPTY_OT_FORM);
  const [editingLineaId, setEditingLineaId] = useState<string | null>(null);
  const [editLineaForm, setEditLineaForm] = useState<LineaForm>(EMPTY_LINEA);
  const [editOTLineas, setEditOTLineas] = useState<LineaOT[]>([]);
  const [editOTEditingLineaId, setEditOTEditingLineaId] = useState<string | null>(null);
  const [editOTEditLineaForm, setEditOTEditLineaForm] = useState<LineaForm>(EMPTY_LINEA);
  const [editOTNewLinea, setEditOTNewLinea] = useState<LineaForm>(EMPTY_LINEA);
  const [recepcionModal, setRecepcionModal] = useState<{
    km: number | ''; fechaEst: string; tecnico: string;
    checklist: Record<string, boolean>; observaciones: string; fotos: string[];
  } | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoError, setFotoError] = useState('');
  const [crearChecklist, setCrearChecklist] = useState<Record<string, boolean>>({});
  const [crearObservaciones, setCrearObservaciones] = useState('');
  const [crearFotos, setCrearFotos] = useState<string[]>([]);
  const [crearProductoRapido, setCrearProductoRapido] = useState<{ nombreInicial: string; aplicar: (p: Producto) => void } | null>(null);

  const solicitarCrearProducto = (nombreBuscado: string, aplicar: (p: Producto) => void) => {
    setCrearProductoRapido({ nombreInicial: nombreBuscado, aplicar });
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return ordenes
      .filter(ot => {
        // El filtro por estado (pills "Todas/Presupuesto/...") solo tiene
        // sentido en la vista de lista — el Kanban ya organiza por estado en
        // sus propias columnas, así que debe ver siempre todas las OTs.
        if (vista === 'lista' && filterEstado !== 'todas' && ot.estado !== filterEstado) return false;
        const veh = vehiculos.find(v => v.id === ot.vehiculoId);
        const cli = clientes.find(c => c.id === ot.clienteId);
        return (
          ot.numero.toLowerCase().includes(term) ||
          veh?.matricula.toLowerCase().includes(term) ||
          `${veh?.marca} ${veh?.modelo}`.toLowerCase().includes(term) ||
          `${cli?.nombre} ${cli?.apellidos}`.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.fechaActualizacion.localeCompare(a.fechaActualizacion));
  }, [ordenes, vehiculos, clientes, search, filterEstado, vista]);

  const openCreate = () => {
    setCreateTipo('presupuesto');
    setOTForm({ ...EMPTY_OT_FORM, fechaRecepcion: new Date().toISOString().split('T')[0] });
    setFormLineas([]);
    setNewLinea(EMPTY_LINEA);
    setFormError('');
    setFotoError('');
    setCrearChecklist(Object.fromEntries(CHECKLIST_RECEPCION_ITEMS.map(item => [item, false])));
    setCrearObservaciones('');
    setCrearFotos([]);
    setIsCreating(true);
  };

  const handleAddLinea = () => {
    if (!newLinea.descripcion || newLinea.cantidad === '' || newLinea.precioUnitario === '') return;
    if (newLinea.tipo === 'producto' && !newLinea.productoId) return;
    const linea: LineaOT = {
      id: 'lot-' + Date.now(),
      tipo: newLinea.tipo,
      productoId: newLinea.productoId,
      descripcion: newLinea.descripcion,
      cantidad: Number(newLinea.cantidad),
      precioUnitario: Number(newLinea.precioUnitario),
      costoUnitario: newLinea.costoUnitario !== '' ? Number(newLinea.costoUnitario) : undefined,
      subtotal: Number(newLinea.cantidad) * Number(newLinea.precioUnitario),
    };
    setFormLineas(prev => [...prev, linea]);
    setNewLinea(EMPTY_LINEA);
  };

  const handleRemoveLinea = (id: string) => setFormLineas(prev => prev.filter(l => l.id !== id));

  const openEditLinea = (l: LineaOT) => {
    setEditingLineaId(l.id);
    setEditLineaForm({ tipo: l.tipo, productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, costoUnitario: l.costoUnitario ?? '' });
  };

  const handleSaveEditLinea = (id: string) => {
    if (!editLineaForm.descripcion || editLineaForm.cantidad === '' || editLineaForm.precioUnitario === '') return;
    setFormLineas(prev => prev.map(l => l.id !== id ? l : {
      ...l,
      cantidad: Number(editLineaForm.cantidad),
      precioUnitario: Number(editLineaForm.precioUnitario),
      costoUnitario: editLineaForm.costoUnitario !== '' ? Number(editLineaForm.costoUnitario) : undefined,
      subtotal: Number(editLineaForm.cantidad) * Number(editLineaForm.precioUnitario),
    }));
    setEditingLineaId(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const esPresupuesto = createTipo === 'presupuesto';
    const kmRequerido = !esPresupuesto && otForm.kilometrajeEntrada === '';
    if (!otForm.vehiculoId || !otForm.clienteId || !otForm.descripcionProblema || kmRequerido) {
      setFormError(esPresupuesto
        ? 'Completa vehículo, cliente y descripción del problema.'
        : 'Completa vehículo, cliente, kilometraje y descripción del problema.');
      return;
    }
    const { subtotal, totalIva, total } = calcTotals(formLineas, otForm.ivaPct);
    const nextNum = 'OT-' + new Date().getFullYear() + '-' + String(ordenes.length + 1).padStart(3, '0');
    const ot: OrdenTrabajo = {
      id: 'ot-' + Date.now(),
      numero: nextNum,
      fechaActualizacion: new Date().toISOString(),
      historial: [evento(esPresupuesto ? 'Presupuesto creado' : 'Vehículo recibido en taller')],
      vehiculoId: otForm.vehiculoId,
      clienteId: otForm.clienteId,
      estado: createTipo,
      fechaRecepcion: otForm.fechaRecepcion,
      fechaEstimadaEntrega: otForm.fechaEstimadaEntrega || undefined,
      kilometrajeEntrada: esPresupuesto ? 0 : Number(otForm.kilometrajeEntrada),
      descripcionProblema: otForm.descripcionProblema,
      diagnostico: otForm.diagnostico || undefined,
      tecnicoAsignado: otForm.tecnicoAsignado || undefined,
      notas: otForm.notas || undefined,
      lineas: formLineas,
      subtotal,
      ivaPct: otForm.ivaPct,
      totalIva,
      total,
      ...(esPresupuesto ? {} : {
        checklistRecepcion: CHECKLIST_RECEPCION_ITEMS.map(item => ({ item, ok: !!crearChecklist[item] })),
        checklistObservaciones: crearObservaciones || undefined,
        fotosRecepcion: crearFotos,
      }),
    };
    setGuardandoOT(true);
    try {
      // Se espera a que el guardado termine antes de cerrar el modal: si se
      // cierra de inmediato (como antes), la tarjeta no aparece en el Kanban
      // ni en la lista hasta que algo más fuerce un re-render — parece un
      // fallo de refresco cuando en realidad la orden simplemente no había
      // terminado de guardarse todavía.
      await onAdd(ot);
      setIsCreating(false);
    } finally {
      setGuardandoOT(false);
    }
  };

  const handleEstadoChange = async (ot: OrdenTrabajo, estado: OTEstado) => {
    if (ot.estado === 'presupuesto' && estado === 'recibido') {
      // El modal de recepción se renderiza condicionado a `selected` (lo
      // rellena la ficha de detalle al abrirla) — al arrastrar la tarjeta
      // desde el Kanban nunca se pasa por ahí, así que sin esto el modal
      // preparaba su estado pero nunca llegaba a aparecer en pantalla.
      setSelected(ot);
      setFotoError('');
      setRecepcionModal({
        km: '', fechaEst: '', tecnico: ot.tecnicoAsignado ?? '',
        checklist: Object.fromEntries(CHECKLIST_RECEPCION_ITEMS.map(item => [item, false])),
        observaciones: '', fotos: [],
      });
      return;
    }
    const EVENTO_LABEL: Record<OTEstado, string> = {
      presupuesto:   'Presupuesto generado',
      recibido:      'Vehículo recibido en taller',
      en_reparacion: 'Reparación iniciada',
      listo:         'Trabajo completado',
      entregado:     'Vehículo entregado al cliente',
      cancelado:     'OT cancelada',
    };
    const now = new Date().toISOString();
    const updated: OrdenTrabajo = {
      ...ot,
      estado,
      fechaActualizacion: now,
      historial: [...(ot.historial ?? []), evento(EVENTO_LABEL[estado])],
    };
    if (estado === 'presupuesto') updated.presupuestoEstado = 'pendiente';
    if (estado === 'entregado' && !ot.fechaEntrega) {
      updated.fechaEntrega = new Date().toISOString().split('T')[0];
    }
    setSelected(await onUpdate(updated));
  };

  const handleConfirmarRecepcion = async (ot: OrdenTrabajo) => {
    if (!recepcionModal || recepcionModal.km === '') return;
    const updated: OrdenTrabajo = {
      ...ot,
      estado: 'recibido',
      presupuestoAprobado: true,
      fechaActualizacion: new Date().toISOString(),
      historial: [...(ot.historial ?? []), evento('Presupuesto aprobado — vehículo recibido en taller')],
      kilometrajeEntrada: Number(recepcionModal.km),
      fechaRecepcion: new Date().toISOString().split('T')[0],
      fechaEstimadaEntrega: recepcionModal.fechaEst || ot.fechaEstimadaEntrega,
      tecnicoAsignado: recepcionModal.tecnico || ot.tecnicoAsignado,
      checklistRecepcion: CHECKLIST_RECEPCION_ITEMS.map(item => ({ item, ok: !!recepcionModal.checklist[item] })),
      checklistObservaciones: recepcionModal.observaciones || undefined,
      fotosRecepcion: recepcionModal.fotos,
    };
    setSelected(await onUpdate(updated));
    setRecepcionModal(null);
  };

  /** Compartido entre el modal de recepción y el alta directa como "recibido" — ambos suben a la misma carpeta/límite, solo cambia dónde se guarda el resultado. */
  const subirFotosRecepcion = (
    seleccionados: File[],
    fotosActuales: string[],
    onFotoSubida: (url: string) => void,
  ) => {
    if (!seleccionados.length) return;
    setFotoError('');
    const huecos = MAX_FOTOS_RECEPCION - fotosActuales.length;
    const files = seleccionados.slice(0, huecos);
    if (seleccionados.length > huecos) {
      setFotoError(`Máximo ${MAX_FOTOS_RECEPCION} fotos — se subieron solo las primeras ${huecos > 0 ? huecos : 0}.`);
    }
    if (!files.length) return;
    setSubiendoFoto(true);
    void (async () => {
      try {
        for (const file of files) {
          const ext = FOTO_MIME_EXT[file.type] || file.name.split('.').pop() || 'jpg';
          const path = `${empresa.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from('fotos-recepcion')
            .upload(path, file, { cacheControl: '3600' });
          if (error) throw error;
          const { data } = supabase.storage.from('fotos-recepcion').getPublicUrl(path);
          onFotoSubida(data.publicUrl);
        }
      } catch {
        setFotoError('No se pudo subir alguna foto. Inténtalo de nuevo.');
      } finally {
        setSubiendoFoto(false);
      }
    })();
  };

  const handleFotoRecepcionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seleccionados = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!recepcionModal) return;
    subirFotosRecepcion(seleccionados, recepcionModal.fotos, url =>
      setRecepcionModal(r => r ? { ...r, fotos: [...r.fotos, url] } : r));
  };

  const handleQuitarFotoRecepcion = (url: string) => {
    setRecepcionModal(r => r ? { ...r, fotos: r.fotos.filter(f => f !== url) } : r);
  };

  const handleFotoCreacionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seleccionados = Array.from(e.target.files ?? []);
    e.target.value = '';
    subirFotosRecepcion(seleccionados, crearFotos, url => setCrearFotos(fotos => [...fotos, url]));
  };

  const handleQuitarFotoCreacion = (url: string) => {
    setCrearFotos(fotos => fotos.filter(f => f !== url));
  };

  const handleEnviarPresupuesto = async (ot: OrdenTrabajo) => {
    const updated: OrdenTrabajo = {
      ...ot,
      presupuestoEstado: 'enviado',
      fechaActualizacion: new Date().toISOString(),
      historial: [...(ot.historial ?? []), evento('Presupuesto enviado al cliente')],
    };
    setSelected(await onUpdate(updated));
  };

  const handleNotificarListo = async (ot: OrdenTrabajo) => {
    const updated: OrdenTrabajo = {
      ...ot,
      notificacionEnviada: true,
      fechaActualizacion: new Date().toISOString(),
      historial: [...(ot.historial ?? []), evento('Cliente notificado — vehículo listo para recoger')],
    };
    setSelected(await onUpdate(updated));
  };

  const [generandoPortalTecnico, setGenerandoPortalTecnico] = useState(false);

  /**
   * El enlace del Portal del Mecánico se genera perezosamente aquí (al pulsar
   * "Notificar por WhatsApp") en vez de exigir que se cree antes desde
   * Configuración > Técnicos — así el flujo de asignar-y-avisar no depende
   * de un paso previo aparte.
   */
  const asegurarPortalTecnico = async (tec: Tecnico): Promise<Tecnico> => {
    if (tec.portalToken) return tec;
    setGenerandoPortalTecnico(true);
    try {
      const actualizado = await setPortalTokenTecnico(tec.id, crypto.randomUUID());
      setTecnicos(prev => prev.map(t => (t.id === actualizado.id ? actualizado : t)));
      return actualizado;
    } finally {
      setGenerandoPortalTecnico(false);
    }
  };

  const openEdit = (ot: OrdenTrabajo) => {
    setEditForm({
      vehiculoId: ot.vehiculoId,
      clienteId: ot.clienteId,
      fechaRecepcion: ot.fechaRecepcion,
      fechaEstimadaEntrega: ot.fechaEstimadaEntrega ?? '',
      kilometrajeEntrada: ot.kilometrajeEntrada,
      descripcionProblema: ot.descripcionProblema,
      diagnostico: ot.diagnostico ?? '',
      tecnicoAsignado: ot.tecnicoAsignado ?? '',
      notas: ot.notas ?? '',
      ivaPct: ot.ivaPct,
    });
    setEditOTLineas([...ot.lineas]);
    setEditOTEditingLineaId(null);
    setEditOTNewLinea(EMPTY_LINEA);
    setIsEditing(true);
  };

  const handleEditSave = async (ot: OrdenTrabajo) => {
    const { subtotal, totalIva, total } = calcTotals(editOTLineas, editForm.ivaPct);
    const updated: OrdenTrabajo = {
      ...ot,
      fechaActualizacion: new Date().toISOString(),
      vehiculoId: editForm.vehiculoId,
      clienteId: editForm.clienteId,
      fechaRecepcion: editForm.fechaRecepcion,
      fechaEstimadaEntrega: editForm.fechaEstimadaEntrega || undefined,
      kilometrajeEntrada: Number(editForm.kilometrajeEntrada),
      descripcionProblema: editForm.descripcionProblema,
      diagnostico: editForm.diagnostico || undefined,
      tecnicoAsignado: editForm.tecnicoAsignado || undefined,
      notas: editForm.notas || undefined,
      ivaPct: editForm.ivaPct,
      lineas: editOTLineas,
      subtotal, totalIva, total,
    };
    setSelected(await onUpdate(updated));
    setIsEditing(false);
  };

  const handleDeleteConfirmed = () => {
    if (confirmDelete) {
      onDelete(confirmDelete);
      if (selected?.id === confirmDelete) setSelected(null);
      setConfirmDelete(null);
    }
  };

  const vehLabel = (id: string) => {
    const v = vehiculos.find(x => x.id === id);
    return v ? `${v.marca} ${v.modelo} · ${v.matricula}` : id;
  };
  const cliLabel = (id: string) => {
    const c = clientes.find(x => x.id === id);
    return c ? `${c.nombre} ${c.apellidos}` : id;
  };

  const totalesSelected = selected ? calcTotals(selected.lineas, selected.ivaPct) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <ClipboardList size={20} className="text-blue-600" /> Órdenes de Trabajo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{ordenes.length} órdenes en total</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl w-fit">
            <button
              onClick={() => setVista('lista')}
              title="Vista de lista"
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                vista === 'lista' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <List size={13} /> Lista
            </button>
            <button
              onClick={() => setVista('kanban')}
              title="Vista de tablero"
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                vista === 'kanban' ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGrid size={13} /> Tablero
            </button>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition shadow-sm"
          >
            <Plus size={15} /> Nueva OT
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por número, matrícula o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {vista === 'lista' && (
          <div className="flex flex-wrap gap-1.5">
            {(['todas', ...ESTADO_FLOW, 'cancelado'] as (OTEstado | 'todas')[]).map(e => (
              <button
                key={e}
                onClick={() => setFilterEstado(e)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${filterEstado === e ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {e === 'todas' ? 'Todas' : ESTADO_META[e as OTEstado].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {vista === 'kanban' && (
        <>
          {kanbanAviso && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold px-3.5 py-2.5 rounded-xl">
              <AlertCircle size={14} className="shrink-0" /> {kanbanAviso}
            </div>
          )}
          <KanbanBoard
            ordenes={filtered}
            vehiculos={vehiculos}
            clientes={clientes}
            onSelect={setSelected}
            onDrop={(ot, estado) => handleEstadoChange(ot, estado)}
            onRetrocesoBloqueado={(ot, estado) => setKanbanAviso(
              `No puedes retroceder de "${ESTADO_META[ot.estado].label}" a "${ESTADO_META[estado].label}" — corrígelo desde el detalle de la OT si es necesario.`
            )}
            dragOtId={dragOtId}
            setDragOtId={setDragOtId}
            dragOverEstado={dragOverEstado}
            setDragOverEstado={setDragOverEstado}
          />
        </>
      )}

      {/* Table */}
      {vista === 'lista' && (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-20" />
            No hay órdenes de trabajo
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">Nº OT</th>
                  <th className="px-4 py-3 text-left font-semibold">Vehículo</th>
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold">Recepción</th>
                  <th className="px-4 py-3 text-left font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(ot => {
                  const veh = vehiculos.find(v => v.id === ot.vehiculoId);
                  const cli = clientes.find(c => c.id === ot.clienteId);
                  return (
                    <tr
                      key={ot.id}
                      onClick={() => setSelected(ot)}
                      className={`cursor-pointer hover:bg-blue-50/40 transition ${selected?.id === ot.id ? 'bg-blue-50/60' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{ot.numero}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{veh ? `${veh.marca} ${veh.modelo}` : '—'}</div>
                        <div className="text-[11px] text-slate-400">{veh?.matricula}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{cli ? `${cli.nombre} ${cli.apellidos}` : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{ot.fechaRecepcion}</td>
                      <td className="px-4 py-3"><BadgeEstado estado={ot.estado} presupuestoEstado={ot.presupuestoEstado} presupuestoAprobado={ot.presupuestoAprobado} notificacionEnviada={ot.notificacionEnviada} /></td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                        {ot.total > 0 ? `${ot.total.toFixed(2)} €` : <span className="text-slate-300 font-normal text-xs">Por definir</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={14} className="text-slate-300 inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Detail Panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-30"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-40 flex flex-col overflow-hidden"
            >
              {/* Panel header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-blue-700 font-bold text-base">{selected.numero}</span>
                    <BadgeEstado estado={selected.estado} presupuestoEstado={selected.presupuestoEstado} presupuestoAprobado={selected.presupuestoAprobado} notificacionEnviada={selected.notificacionEnviada} />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selected.estado === 'presupuesto' ? 'Solicitud del' : 'Recibido el'} {selected.fechaRecepcion}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(selected)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                    title="Editar OT"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(selected.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Vehicle + Client */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-2xl p-3 flex items-start gap-2">
                    <Car size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Vehículo</p>
                      <p className="text-sm font-semibold text-slate-800">{vehLabel(selected.vehiculoId)}</p>
                      {selected.estado !== 'presupuesto' && (
                        <p className="text-xs text-slate-400">{selected.kilometrajeEntrada.toLocaleString()} km entrada
                          {selected.kilometrajeSalida && ` · ${selected.kilometrajeSalida.toLocaleString()} km salida`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl p-3 flex items-start gap-2">
                    <User size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Cliente</p>
                      <p className="text-sm font-semibold text-slate-800">{cliLabel(selected.clienteId)}</p>
                      {selected.tecnicoAsignado && <p className="text-xs text-slate-400">Técnico: {selected.tecnicoAsignado}</p>}
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Calendar size={11} /> {selected.estado === 'presupuesto' ? 'Solicitud:' : 'Recepción:'} <strong>{selected.fechaRecepcion}</strong></span>
                  {selected.fechaEstimadaEntrega && <span className="flex items-center gap-1"><Calendar size={11} /> Est. entrega: <strong>{selected.fechaEstimadaEntrega}</strong></span>}
                  {selected.fechaEntrega && <span className="flex items-center gap-1 text-green-600"><Check size={11} /> Entregado: <strong>{selected.fechaEntrega}</strong></span>}
                </div>

                {/* Problem + Diagnosis */}
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Problema descrito por el cliente</p>
                    <p className="text-sm text-slate-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{selected.descripcionProblema}</p>
                  </div>
                  {selected.diagnostico && (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-1">Diagnóstico del taller</p>
                      <p className="text-sm text-slate-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">{selected.diagnostico}</p>
                    </div>
                  )}
                </div>

                {/* Checklist de recepción */}
                {selected.checklistRecepcion && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><ClipboardList size={12} /> Estado al recibir el vehículo</p>
                    <div className="border border-slate-100 rounded-2xl px-3 py-2.5 space-y-1.5">
                      {selected.checklistRecepcion.map(({ item, ok }) => (
                        <div key={item} className="flex items-center gap-2 text-sm">
                          {ok
                            ? <Check size={14} className="text-teal-600 shrink-0" />
                            : <X size={14} className="text-rose-400 shrink-0" />}
                          <span className={ok ? 'text-slate-700' : 'text-slate-400'}>{item}</span>
                        </div>
                      ))}
                      {selected.checklistObservaciones && (
                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 mt-2">{selected.checklistObservaciones}</p>
                      )}
                      {!!selected.fotosRecepcion?.length && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selected.fotosRecepcion.map(url => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="w-16 h-16 rounded-lg overflow-hidden border border-slate-200 block">
                              <img src={url} alt="Foto de recepción" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Lines */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-slate-600">Líneas de trabajo</p>
                    {(() => {
                      const tareas = selected.lineas.filter(l => l.tipo === 'mano_de_obra');
                      if (tareas.length === 0) return null;
                      const hechas = tareas.filter(l => l.completado).length;
                      return (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1">
                          <Wrench size={9} /> {hechas}/{tareas.length} tareas del técnico
                        </span>
                      );
                    })()}
                  </div>
                  {selected.lineas.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Sin líneas añadidas aún.</p>
                  ) : (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-[10px]">
                          <tr>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-center">Tipo</th>
                            <th className="px-3 py-2 text-right">Cant.</th>
                            <th className="px-3 py-2 text-right">Precio</th>
                            <th className="px-3 py-2 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selected.lineas.map(l => (
                            <tr key={l.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-slate-800">
                                <span className="flex items-center gap-1.5">
                                  {l.tipo === 'mano_de_obra' && l.completado && <Check size={12} className="text-teal-600 shrink-0" />}
                                  {l.descripcion}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${l.tipo === 'mano_de_obra' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {TIPO_META[l.tipo].label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600">{l.cantidad}</td>
                              <td className="px-3 py-2 text-right font-mono">{l.precioUnitario.toFixed(2)} €</td>
                              <td className="px-3 py-2 text-right font-mono font-semibold">{l.subtotal.toFixed(2)} €</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Totals */}
                {totalesSelected && selected.lineas.length > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-mono">{totalesSelected.subtotal.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>IVA ({selected.ivaPct}%)</span>
                      <span className="font-mono">{totalesSelected.totalIva.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="font-mono text-base">{totalesSelected.total.toFixed(2)} €</span>
                    </div>
                  </div>
                )}

                {selected.notas && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Notas</p>
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{selected.notas}</p>
                  </div>
                )}

                {/* Bloque: Cotización — PDF y seguimiento */}
                {/* Bloque: Presupuesto */}
                {selected.estado === 'presupuesto' && (() => {
                  const enviado = selected.presupuestoEstado === 'enviado';
                  return (
                    <div className={`rounded-2xl border p-4 space-y-3 ${enviado ? 'bg-green-50 border-green-200' : 'bg-violet-50 border-violet-200'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase text-slate-500">Presupuesto</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enviado ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                          {enviado ? 'Enviado' : 'Pendiente de envío'}
                        </span>
                      </div>
                      {!enviado && (
                        <p className="text-xs text-slate-500">Genera el PDF del presupuesto y envíaselo al cliente para que apruebe.</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setPresupuestoPDF(selected)}
                          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                        >
                          <FileText size={13} /> Ver / Descargar PDF
                        </button>
                        {!enviado && (
                          <button
                            onClick={() => handleEnviarPresupuesto(selected)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
                          >
                            <Check size={13} /> Marcar enviado
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Bloque: Notificar al cliente cuando está listo */}
                {selected.estado === 'listo' && (() => {
                  const cli = clientes.find(c => c.id === selected.clienteId);
                  const veh = vehiculos.find(v => v.id === selected.vehiculoId);
                  const notificado = selected.notificacionEnviada;
                  const nombreCliente = cli ? `${cli.nombre} ${cli.apellidos}` : 'cliente';
                  const descVeh = veh ? `${veh.marca} ${veh.modelo}${veh.matricula ? ` (${veh.matricula})` : ''}` : 'su vehículo';
                  const mensaje = `Hola ${nombreCliente}, le informamos que su vehículo ${descVeh} ya está listo para recoger en ${empresa.nombre}. Puede pasar cuando lo desee en nuestro horario de atención. ¡Gracias por confiar en nosotros!`;
                  const waHref = cli?.telefono
                    ? `https://wa.me/${cli.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`
                    : null;
                  const mailHref = cli?.correo
                    ? `mailto:${cli.correo}?subject=${encodeURIComponent(`Su vehículo está listo - ${empresa.nombre}`)}&body=${encodeURIComponent(mensaje)}`
                    : null;
                  return (
                    <div className={`rounded-2xl border p-4 space-y-3 ${notificado ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Bell size={11} /> Notificación al cliente</p>
                        {notificado && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Notificado</span>}
                      </div>
                      {!notificado && (
                        <p className="text-xs text-slate-500">Avisa al cliente de que su vehículo está listo para recoger.</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {waHref ? (
                          <a
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition"
                          >
                            <MessageCircle size={13} /> WhatsApp
                          </a>
                        ) : (
                          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
                            <MessageCircle size={13} /> WhatsApp
                          </span>
                        )}
                        {mailHref ? (
                          <a
                            href={mailHref}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                          >
                            <Mail size={13} /> Email
                          </a>
                        ) : (
                          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
                            <Mail size={13} /> Email
                          </span>
                        )}
                        {!notificado && (
                          <button
                            onClick={() => handleNotificarListo(selected)}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
                          >
                            <Check size={13} /> Marcar notificado
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Bloque: Notificar al técnico asignado (checklist de tareas en su Portal) */}
                {selected.tecnicoAsignado && (selected.estado === 'recibido' || selected.estado === 'en_reparacion') && (() => {
                  const tec = tecnicos.find(t => t.nombre === selected.tecnicoAsignado);
                  if (!tec) return null;
                  const veh = vehiculos.find(v => v.id === selected.vehiculoId);
                  const descVeh = veh ? `${veh.marca} ${veh.modelo}${veh.matricula ? ` (${veh.matricula})` : ''}` : 'un vehículo';

                  const handleClick = async () => {
                    const tecConToken = await asegurarPortalTecnico(tec);
                    const enlace = `${window.location.origin}/mecanico/${tecConToken.portalToken}`;
                    const mensaje = `Hola ${tec.nombre}, se te ha asignado ${descVeh} — OT ${selected.numero}. Aquí puedes ver y marcar las tareas: ${enlace}`;
                    window.open(`https://wa.me/${(tec.telefono ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer');
                  };

                  return (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Wrench size={11} /> Notificación al técnico</p>
                      <p className="text-xs text-slate-500">Avisa a {tec.nombre} del vehículo asignado y del enlace de su checklist de tareas.</p>
                      {tec.telefono ? (
                        <button
                          onClick={handleClick}
                          disabled={generandoPortalTecnico}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                        >
                          <MessageCircle size={13} /> {generandoPortalTecnico ? 'Preparando enlace…' : 'Notificar por WhatsApp'}
                        </button>
                      ) : (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          {tec.nombre} no tiene teléfono guardado — añádelo en Configuración de empresa → Técnicos para poder avisarle.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Historial de eventos */}
                {selected.historial && selected.historial.length > 0 && (() => {
                  const fmt = (iso: string) => {
                    const d = new Date(iso);
                    return {
                      fecha: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                      hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                    };
                  };
                  const diffLabel = (a: string, b: string) => {
                    const ms = new Date(b).getTime() - new Date(a).getTime();
                    const min = Math.floor(ms / 60000);
                    if (min < 60) return `${min}m`;
                    const h = Math.floor(min / 60);
                    const m = min % 60;
                    if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
                    const dias = Math.floor(h / 24);
                    const hh = h % 24;
                    return hh > 0 ? `${dias}d ${hh}h` : `${dias}d`;
                  };
                  return (
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-3">Historial</p>
                      <div className="relative">
                        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
                        <div className="space-y-4">
                          {selected.historial.map((ev, i) => {
                            const { fecha, hora } = fmt(ev.fecha);
                            const siguiente = selected.historial[i + 1];
                            return (
                              <div key={i} className="relative pl-6">
                                <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-blue-500 bg-white" />
                                <p className="text-xs font-semibold text-slate-800">{ev.descripcion}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">{fecha} · {hora}</p>
                                {siguiente && (
                                  <p className="text-[10px] text-blue-400 mt-1 font-medium">
                                    ↓ {diffLabel(ev.fecha, siguiente.fecha)} después
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Estado flow */}
                {selected.estado !== 'cancelado' && selected.estado !== 'entregado' && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-2">Avanzar estado</p>
                    <div className="flex flex-wrap gap-2">
                      {/* Camino B: recibido sin presupuesto aprobado → puede generar presupuesto */}
                      {selected.estado === 'recibido' && !selected.presupuestoAprobado && (
                        <button
                          onClick={() => handleEstadoChange(selected, 'presupuesto')}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${ESTADO_META['presupuesto'].bg} ${ESTADO_META['presupuesto'].color} border-current/20 hover:opacity-80`}
                        >
                          → {ESTADO_META['presupuesto'].label}
                        </button>
                      )}
                      {ESTADO_FLOW.filter(e => {
                        const currentIdx = ESTADO_FLOW.indexOf(selected.estado);
                        const targetIdx = ESTADO_FLOW.indexOf(e);
                        if (targetIdx <= currentIdx) return false;
                        return true;
                      }).map(e => (
                        <button
                          key={e}
                          onClick={() => handleEstadoChange(selected, e)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${ESTADO_META[e].bg} ${ESTADO_META[e].color} border-current/20 hover:opacity-80`}
                        >
                          {selected.estado === 'presupuesto' && e === 'recibido' ? '🔑 Recibir vehículo' : `→ ${ESTADO_META[e].label}`}
                        </button>
                      ))}
                      <button
                        onClick={() => handleEstadoChange(selected, 'cancelado')}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition border bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100"
                      >
                        Cancelar OT
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Panel */}
      <AnimatePresence>
        {isEditing && selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50"
              onClick={() => setIsEditing(false)}
            />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed inset-y-0 right-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Pencil size={15} className="text-blue-600" /> Editar {selected.numero}
                </h3>
                <button onClick={() => setIsEditing(false)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition"><X size={16} /></button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Vehículo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo *</label>
                  <select value={editForm.vehiculoId}
                    onChange={e => {
                      const vehId = e.target.value;
                      const dueno = clientes.find(c => c.vehiculosAsociados?.includes(vehId));
                      setEditForm(f => ({ ...f, vehiculoId: vehId, clienteId: dueno?.id ?? '' }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                    {vehiculos.map(v => (
                      <option key={v.id} value={v.id}>{v.marca} {v.modelo} · {v.matricula}</option>
                    ))}
                  </select>
                </div>

                {/* Cliente */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente *</label>
                  {(() => {
                    const dueno = clientes.find(c => c.vehiculosAsociados?.includes(editForm.vehiculoId));
                    if (dueno) return (
                      <div className="mt-1 px-3 py-2 border border-blue-200 bg-blue-50 rounded-xl text-sm text-blue-800 font-medium flex items-center justify-between">
                        <span>{dueno.nombre} {dueno.apellidos}</span>
                        <span className="text-[10px] text-blue-400">Asignado al vehículo</span>
                      </div>
                    );
                    return (
                      <select value={editForm.clienteId}
                        onChange={e => setEditForm(f => ({ ...f, clienteId: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        <option value="">Seleccionar cliente...</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>)}
                      </select>
                    );
                  })()}
                </div>

                {/* Fecha */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {selected.estado === 'presupuesto' ? 'Fecha solicitud *' : 'Fecha recepción *'}
                  </label>
                  <input type="date" value={editForm.fechaRecepcion}
                    onChange={e => setEditForm(f => ({ ...f, fechaRecepcion: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>

                {/* Campos solo disponibles una vez el vehículo está en el taller */}
                {selected.estado !== 'presupuesto' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Entrega estimada</label>
                        <input type="date" value={editForm.fechaEstimadaEntrega}
                          onChange={e => setEditForm(f => ({ ...f, fechaEstimadaEntrega: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Gauge size={10} /> Km entrada *</label>
                        <input type="number" min="0" value={editForm.kilometrajeEntrada}
                          onChange={e => setEditForm(f => ({ ...f, kilometrajeEntrada: e.target.value === '' ? '' : Number(e.target.value) }))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Técnico asignado</label>
                      <select value={editForm.tecnicoAsignado}
                        onChange={e => setEditForm(f => ({ ...f, tecnicoAsignado: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                        <option value="">— Sin asignar —</option>
                        {tecnicos.filter(t => t.activo).map(t => <option key={t.id} value={t.nombre}>{t.nombre}{t.especialidad ? ` · ${t.especialidad}` : ''}</option>)}
                      </select>
                    </div>
                  </>
                )}

                {/* Problema */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Problema descrito por el cliente *</label>
                  <textarea rows={2} value={editForm.descripcionProblema}
                    onChange={e => setEditForm(f => ({ ...f, descripcionProblema: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                {/* Diagnóstico */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Diagnóstico técnico</label>
                  <textarea rows={2} value={editForm.diagnostico}
                    onChange={e => setEditForm(f => ({ ...f, diagnostico: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                {/* Líneas de trabajo */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Líneas de trabajo</p>
                  {editOTLineas.length > 0 && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-right">Cant.</th>
                            <th className="px-3 py-2 text-right">Precio</th>
                            <th className="px-3 py-2 text-right">Sub.</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {editOTLineas.map(l => editOTEditingLineaId === l.id ? (
                            <tr key={l.id} className="bg-blue-50/40">
                              <td colSpan={5} className="px-3 py-2">
                                <div className="space-y-2">
                                  <LineaTipoYProducto
                                    form={editOTEditLineaForm}
                                    setForm={(updater) => setEditOTEditLineaForm(updater)}
                                    productos={productos}
                                    onSolicitarCrearProducto={solicitarCrearProducto}
                                    bloquearTipo
                                  />
                                  <div className="grid grid-cols-3 gap-2">
                                    <input type="number" min="1" step="1" value={editOTEditLineaForm.cantidad}
                                      onChange={e => setEditOTEditLineaForm(f => ({ ...f, cantidad: e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none"
                                      placeholder={editOTEditLineaForm.tipo === 'mano_de_obra' ? 'Horas *' : 'Cantidad *'} />
                                    <input type="number" min="0" step="0.01" value={editOTEditLineaForm.precioUnitario}
                                      onChange={e => setEditOTEditLineaForm(f => ({ ...f, precioUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none" placeholder="Precio venta € *" />
                                    <input type="number" min="0" step="0.01" value={editOTEditLineaForm.costoUnitario}
                                      onChange={e => setEditOTEditLineaForm(f => ({ ...f, costoUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none" placeholder="Coste taller €" />
                                  </div>
                                  <div className="flex gap-2 justify-end">
                                    <button type="button" onClick={() => setEditOTEditingLineaId(null)}
                                      className="px-2 py-1 rounded-xl border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">Cancelar</button>
                                    <button type="button" onClick={() => {
                                      if (!editOTEditLineaForm.descripcion || editOTEditLineaForm.cantidad === '' || editOTEditLineaForm.precioUnitario === '') return;
                                      setEditOTLineas(prev => prev.map(x => x.id !== l.id ? x : {
                                        ...x,
                                        cantidad: Number(editOTEditLineaForm.cantidad),
                                        precioUnitario: Number(editOTEditLineaForm.precioUnitario),
                                        costoUnitario: editOTEditLineaForm.costoUnitario !== '' ? Number(editOTEditLineaForm.costoUnitario) : undefined,
                                        subtotal: Number(editOTEditLineaForm.cantidad) * Number(editOTEditLineaForm.precioUnitario),
                                      }));
                                      setEditOTEditingLineaId(null);
                                    }} className="px-2 py-1 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 flex items-center gap-1">
                                      <Check size={11} /> Guardar
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={l.id}>
                              <td className="px-3 py-1.5 text-slate-700">{l.descripcion} <span className="text-slate-400 text-[9px]">({TIPO_META[l.tipo].label})</span></td>
                              <td className="px-3 py-1.5 text-right">{l.cantidad}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{l.precioUnitario.toFixed(2)} €</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{l.subtotal.toFixed(2)} €</td>
                              <td className="px-3 py-1.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button type="button" onClick={() => {
                                    setEditOTEditingLineaId(l.id);
                                    setEditOTEditLineaForm({ tipo: l.tipo, productoId: l.productoId, descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, costoUnitario: l.costoUnitario ?? '' });
                                  }} className="text-slate-300 hover:text-blue-500 transition"><Pencil size={11} /></button>
                                  <button type="button" onClick={() => setEditOTLineas(prev => prev.filter(x => x.id !== l.id))}
                                    className="text-slate-300 hover:text-rose-500 transition"><X size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Nueva línea */}
                  <div className="bg-slate-50 rounded-2xl p-3 space-y-2 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Añadir línea</p>
                    <LineaTipoYProducto
                      form={editOTNewLinea}
                      setForm={(updater) => setEditOTNewLinea(updater)}
                      productos={productos}
                      onSolicitarCrearProducto={solicitarCrearProducto}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" min="1" step="1" value={editOTNewLinea.cantidad}
                        onChange={e => setEditOTNewLinea(f => ({ ...f, cantidad: e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))) }))}
                        placeholder={editOTNewLinea.tipo === 'mano_de_obra' ? 'Horas *' : 'Cantidad *'}
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                      <input type="number" min="0" step="0.01" value={editOTNewLinea.precioUnitario}
                        onChange={e => setEditOTNewLinea(f => ({ ...f, precioUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                        placeholder="Precio venta € *"
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                      <input type="number" min="0" step="0.01" value={editOTNewLinea.costoUnitario}
                        onChange={e => setEditOTNewLinea(f => ({ ...f, costoUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                        placeholder="Coste taller €"
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                    </div>
                    <button type="button" onClick={() => {
                      if (!editOTNewLinea.descripcion || editOTNewLinea.cantidad === '' || editOTNewLinea.precioUnitario === '') return;
                      if (editOTNewLinea.tipo === 'producto' && !editOTNewLinea.productoId) return;
                      const linea: LineaOT = {
                        id: 'lot-' + Date.now(),
                        tipo: editOTNewLinea.tipo,
                        productoId: editOTNewLinea.productoId,
                        descripcion: editOTNewLinea.descripcion,
                        cantidad: Number(editOTNewLinea.cantidad),
                        precioUnitario: Number(editOTNewLinea.precioUnitario),
                        costoUnitario: editOTNewLinea.costoUnitario !== '' ? Number(editOTNewLinea.costoUnitario) : undefined,
                        subtotal: Number(editOTNewLinea.cantidad) * Number(editOTNewLinea.precioUnitario),
                      };
                      setEditOTLineas(prev => [...prev, linea]);
                      setEditOTNewLinea(EMPTY_LINEA);
                    }} className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1">
                      <Plus size={11} /> Añadir línea
                    </button>
                  </div>
                </div>

                {/* IVA */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600">IVA (%)</label>
                  <input type="number" min="0" max="100" value={editForm.ivaPct}
                    onChange={e => setEditForm(f => ({ ...f, ivaPct: Number(e.target.value) }))}
                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  {editOTLineas.length > 0 && (() => {
                    const t = calcTotals(editOTLineas, editForm.ivaPct);
                    return <div className="flex-1 text-right text-sm"><span className="text-slate-400">Base: {t.subtotal.toFixed(2)} € · IVA: {t.totalIva.toFixed(2)} € · </span><strong className="text-slate-800 font-mono">{t.total.toFixed(2)} €</strong></div>;
                  })()}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas</label>
                  <textarea rows={2} value={editForm.notas}
                    onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2 pb-4">
                  <button type="button" onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                    Cancelar
                  </button>
                  <button type="button" onClick={() => handleEditSave(selected)}
                    className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition shadow-sm flex items-center gap-2">
                    <Check size={14} /> Guardar cambios
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create Panel */}
      {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={() => setIsCreating(false)} />
            <div className="relative w-full max-w-2xl bg-white shadow-2xl rounded-3xl flex flex-col max-h-[88vh] overflow-hidden animate-modal-pop">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white shrink-0">
                <div className="flex items-center gap-2.5">
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-sm tracking-tight">Nueva Orden de Trabajo</span>
                </div>
                <button onClick={() => setIsCreating(false)} className="p-1.5 hover:bg-slate-800 rounded-2xl transition"><X className="w-4 h-4" /></button>
              </div>

              <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

                {/* Tipo de ingreso */}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button"
                    onClick={() => setCreateTipo('presupuesto')}
                    className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition text-left ${createTipo === 'presupuesto' ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className="font-bold mb-0.5">📋 Nuevo presupuesto</div>
                    <div className="text-xs font-normal opacity-70">El vehículo aún no entra al taller</div>
                  </button>
                  <button type="button"
                    onClick={() => setCreateTipo('recibido')}
                    className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition text-left ${createTipo === 'recibido' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className="font-bold mb-0.5">🔑 Recepción de vehículo</div>
                    <div className="text-xs font-normal opacity-70">El vehículo entra físicamente al taller</div>
                  </button>
                </div>

                {/* Vehículo */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo *</label>
                  <select
                    value={otForm.vehiculoId}
                    onChange={e => {
                      const vehId = e.target.value;
                      const dueno = clientes.find(c => c.vehiculosAsociados?.includes(vehId));
                      setOTForm(f => ({ ...f, vehiculoId: vehId, clienteId: dueno?.id ?? '' }));
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                  >
                    <option value="">Seleccionar vehículo...</option>
                    {vehiculos.map(v => {
                      const dueno = clientes.find(c => c.vehiculosAsociados?.includes(v.id));
                      return (
                        <option key={v.id} value={v.id}>
                          {v.marca} {v.modelo} · {v.matricula}{dueno ? ` (${dueno.nombre} ${dueno.apellidos})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Cliente */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente *</label>
                  {(() => {
                    const dueno = clientes.find(c => c.vehiculosAsociados?.includes(otForm.vehiculoId));
                    if (dueno) {
                      return (
                        <div className="mt-1 px-3 py-2 border border-blue-200 bg-blue-50 rounded-xl text-sm text-blue-800 font-medium flex items-center justify-between">
                          <span>{dueno.nombre} {dueno.apellidos}</span>
                          <span className="text-[10px] text-blue-400 font-normal">Asignado al vehículo</span>
                        </div>
                      );
                    }
                    return (
                      <select
                        value={otForm.clienteId}
                        onChange={e => setOTForm(f => ({ ...f, clienteId: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        required
                      >
                        <option value="">Seleccionar cliente...</option>
                        {clientes.map(c => (
                          <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>
                        ))}
                      </select>
                    );
                  })()}
                </div>

                {/* Dates + km */}
                {createTipo === 'presupuesto' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha solicitud *</label>
                    <input type="date" value={otForm.fechaRecepcion} onChange={e => setOTForm(f => ({ ...f, fechaRecepcion: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" required />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha recepción *</label>
                      <input type="date" value={otForm.fechaRecepcion} onChange={e => setOTForm(f => ({ ...f, fechaRecepcion: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Entrega estimada</label>
                      <input type="date" value={otForm.fechaEstimadaEntrega} onChange={e => setOTForm(f => ({ ...f, fechaEstimadaEntrega: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Gauge size={10} /> Km entrada *</label>
                      <input type="number" min="0" placeholder="0" value={otForm.kilometrajeEntrada}
                        onChange={e => setOTForm(f => ({ ...f, kilometrajeEntrada: e.target.value === '' ? '' : Number(e.target.value) }))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono" required />
                    </div>
                  </div>
                )}

                {/* Técnico — solo en recepción */}
                {createTipo === 'recibido' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 ">Técnico asignado</label>
                    <select value={otForm.tecnicoAsignado}
                      onChange={e => setOTForm(f => ({ ...f, tecnicoAsignado: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">— Sin asignar —</option>
                      {tecnicos.filter(t => t.activo).map(t => <option key={t.id} value={t.nombre}>{t.nombre}{t.especialidad ? ` · ${t.especialidad}` : ''}</option>)}
                    </select>
                  </div>
                )}

                {/* Problema */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Problema descrito por el cliente *</label>
                  <textarea rows={2} placeholder="Describe el problema que reporta el cliente..." value={otForm.descripcionProblema}
                    onChange={e => setOTForm(f => ({ ...f, descripcionProblema: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" required />
                </div>

                {/* Diagnóstico — solo al recibir el vehículo */}
                {createTipo === 'recibido' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Diagnóstico inicial (opcional)</label>
                    <textarea rows={2} placeholder="Observaciones técnicas del mecánico..." value={otForm.diagnostico}
                      onChange={e => setOTForm(f => ({ ...f, diagnostico: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                  </div>
                )}

                {/* Checklist de recepción — solo al recibir el vehículo directamente */}
                {createTipo === 'recibido' && (
                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><ClipboardList size={10} /> Estado del vehículo</label>
                      <div className="space-y-1.5">
                        {CHECKLIST_RECEPCION_ITEMS.map(item => (
                          <label key={item} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!crearChecklist[item]}
                              onChange={e => setCrearChecklist(c => ({ ...c, [item]: e.target.checked }))}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
                      <textarea
                        value={crearObservaciones}
                        onChange={e => setCrearObservaciones(e.target.value)}
                        placeholder="Daños o detalles ya existentes al recibir el vehículo…"
                        rows={2}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Camera size={10} /> Fotos</label>
                      <div className="flex flex-wrap gap-2">
                        {crearFotos.map(url => (
                          <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group">
                            <img src={url} alt="Foto de recepción" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => handleQuitarFotoCreacion(url)}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                        {crearFotos.length < MAX_FOTOS_RECEPCION && (
                          <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition">
                            {subiendoFoto
                              ? <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                              : <Camera size={18} />}
                            <input type="file" accept="image/*" multiple capture="environment" className="hidden" disabled={subiendoFoto} onChange={handleFotoCreacionUpload} />
                          </label>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">{crearFotos.length}/{MAX_FOTOS_RECEPCION} fotos</p>
                      {fotoError && <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1"><ImageOff size={12} /> {fotoError}</p>}
                    </div>
                  </div>
                )}

                {/* Líneas */}
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">Líneas de trabajo</p>
                  {formLineas.length > 0 && (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase">
                          <tr>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-right">Cant.</th>
                            <th className="px-3 py-2 text-right">Precio</th>
                            <th className="px-3 py-2 text-right">Sub.</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {formLineas.map(l => editingLineaId === l.id ? (
                            <tr key={l.id} className="bg-blue-50/40">
                              <td colSpan={5} className="px-3 py-2">
                                <div className="space-y-2">
                                  <LineaTipoYProducto
                                    form={editLineaForm}
                                    setForm={(updater) => setEditLineaForm(updater)}
                                    productos={productos}
                                    onSolicitarCrearProducto={solicitarCrearProducto}
                                    bloquearTipo
                                  />
                                  <div className="grid grid-cols-3 gap-2">
                                    <input type="number" min="1" step="1" value={editLineaForm.cantidad}
                                      onChange={e => setEditLineaForm(f => ({ ...f, cantidad: e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none"
                                      placeholder={editLineaForm.tipo === 'mano_de_obra' ? 'Horas *' : 'Cantidad *'} />
                                    <input type="number" min="0" step="0.01" value={editLineaForm.precioUnitario}
                                      onChange={e => setEditLineaForm(f => ({ ...f, precioUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none" placeholder="Precio venta € *" />
                                    <input type="number" min="0" step="0.01" value={editLineaForm.costoUnitario}
                                      onChange={e => setEditLineaForm(f => ({ ...f, costoUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                                      className="px-2 py-1.5 border border-blue-300 rounded-xl text-xs font-mono focus:outline-none" placeholder="Coste taller €" />
                                  </div>
                                  <div className="flex gap-2 justify-end">
                                    <button type="button" onClick={() => setEditingLineaId(null)}
                                      className="px-2 py-1 rounded-xl border border-slate-200 text-xs text-slate-500 hover:bg-slate-50">Cancelar</button>
                                    <button type="button" onClick={() => handleSaveEditLinea(l.id)}
                                      className="px-2 py-1 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 flex items-center gap-1">
                                      <Check size={11} /> Guardar
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={l.id}>
                              <td className="px-3 py-1.5 text-slate-700">{l.descripcion} <span className="text-slate-400 text-[9px]">({TIPO_META[l.tipo].label})</span></td>
                              <td className="px-3 py-1.5 text-right">{l.cantidad}</td>
                              <td className="px-3 py-1.5 text-right font-mono">{l.precioUnitario.toFixed(2)} €</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{l.subtotal.toFixed(2)} €</td>
                              <td className="px-3 py-1.5 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button type="button" onClick={() => openEditLinea(l)} className="text-slate-300 hover:text-blue-500 transition"><Pencil size={11} /></button>
                                  <button type="button" onClick={() => handleRemoveLinea(l.id)} className="text-slate-300 hover:text-rose-500 transition"><X size={12} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Add line form */}
                  <div className="bg-slate-50 rounded-2xl p-3 space-y-2 border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Añadir línea</p>
                    <LineaTipoYProducto
                      form={newLinea}
                      setForm={(updater) => setNewLinea(updater)}
                      productos={productos}
                      onSolicitarCrearProducto={solicitarCrearProducto}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" min="1" step="1" placeholder={newLinea.tipo === 'mano_de_obra' ? 'Horas *' : 'Cantidad *'} value={newLinea.cantidad}
                        onChange={e => setNewLinea(l => ({ ...l, cantidad: e.target.value === '' ? '' : Math.max(1, Math.round(Number(e.target.value))) }))}
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                      <input type="number" min="0" step="0.01" placeholder="Precio venta € *" value={newLinea.precioUnitario}
                        onChange={e => setNewLinea(l => ({ ...l, precioUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                      <input type="number" min="0" step="0.01" placeholder="Coste taller €" value={newLinea.costoUnitario}
                        onChange={e => setNewLinea(l => ({ ...l, costoUnitario: e.target.value === '' ? '' : Number(e.target.value) }))}
                        className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none" />
                    </div>
                    <button type="button" onClick={handleAddLinea}
                      className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1">
                      <Plus size={11} /> Añadir línea
                    </button>
                  </div>
                </div>

                {/* IVA */}
                <div className="flex items-center gap-3">
                  <label className="text-xs font-semibold text-slate-600">IVA (%)</label>
                  <input type="number" min="0" max="100" value={otForm.ivaPct}
                    onChange={e => setOTForm(f => ({ ...f, ivaPct: Number(e.target.value) }))}
                    className="w-20 px-2 py-1.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  {formLineas.length > 0 && (() => {
                    const t = calcTotals(formLineas, otForm.ivaPct);
                    return (
                      <div className="flex-1 text-right text-sm">
                        <span className="text-slate-400">Base: {t.subtotal.toFixed(2)} € · IVA: {t.totalIva.toFixed(2)} € · </span>
                        <strong className="text-slate-800 font-mono">{t.total.toFixed(2)} €</strong>
                      </div>
                    );
                  })()}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas</label>
                  <textarea rows={2} placeholder="Observaciones adicionales..." value={otForm.notas}
                    onChange={e => setOTForm(f => ({ ...f, notas: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                {formError && (
                  <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" /> {formError}
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2 pb-4">
                  <button type="button" onClick={() => setIsCreating(false)} disabled={guardandoOT}
                    className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition">
                    Cancelar
                  </button>
                  <button type="submit" disabled={guardandoOT}
                    className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-sm flex items-center gap-2">
                    {guardandoOT
                      ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <FileText size={14} />}
                    {guardandoOT ? 'Guardando…' : (createTipo === 'presupuesto' ? 'Crear presupuesto' : 'Crear OT')}
                  </button>
                </div>
              </form>
            </div>
          </div>
      )}

      {/* Modal recepción de vehículo (presupuesto aprobado → recibido) */}
      {recepcionModal && selected && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={() => setRecepcionModal(null)} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-5">
                <div>
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">🔑 Recibir vehículo en taller</h3>
                  <p className="text-xs text-slate-400 mt-1">El presupuesto {selected.numero} fue aprobado. Completa los datos de entrada del vehículo.</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Gauge size={10} /> Km entrada *</label>
                    <input
                      type="number" min="0" autoFocus placeholder="Kilometraje actual del vehículo"
                      value={recepcionModal.km}
                      onChange={e => setRecepcionModal(r => r ? { ...r, km: e.target.value === '' ? '' : Number(e.target.value) } : r)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Calendar size={10} /> Entrega estimada</label>
                    <input
                      type="date" value={recepcionModal.fechaEst}
                      onChange={e => setRecepcionModal(r => r ? { ...r, fechaEst: e.target.value } : r)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1"><Wrench size={10} /> Técnico asignado</label>
                    <select value={recepcionModal.tecnico}
                      onChange={e => setRecepcionModal(r => r ? { ...r, tecnico: e.target.value } : r)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">— Sin asignar —</option>
                      {tecnicos.filter(t => t.activo).map(t => <option key={t.id} value={t.nombre}>{t.nombre}{t.especialidad ? ` · ${t.especialidad}` : ''}</option>)}
                    </select>
                  </div>
                  <div className="border-t border-slate-100 pt-4">
                    <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><ClipboardList size={10} /> Estado del vehículo</label>
                    <div className="space-y-1.5">
                      {CHECKLIST_RECEPCION_ITEMS.map(item => (
                        <label key={item} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!recepcionModal.checklist[item]}
                            onChange={e => setRecepcionModal(r => r ? { ...r, checklist: { ...r.checklist, [item]: e.target.checked } } : r)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-400"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones</label>
                    <textarea
                      value={recepcionModal.observaciones}
                      onChange={e => setRecepcionModal(r => r ? { ...r, observaciones: e.target.value } : r)}
                      placeholder="Daños o detalles ya existentes al recibir el vehículo…"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1"><Camera size={10} /> Fotos</label>
                    <div className="flex flex-wrap gap-2">
                      {recepcionModal.fotos.map(url => (
                        <div key={url} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 group">
                          <img src={url} alt="Foto de recepción" className="w-full h-full object-cover" />
                          <button type="button" onClick={() => handleQuitarFotoRecepcion(url)}
                            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                      {recepcionModal.fotos.length < MAX_FOTOS_RECEPCION && (
                        <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition">
                          {subiendoFoto
                            ? <div className="w-4 h-4 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                            : <Camera size={18} />}
                          <input type="file" accept="image/*" multiple capture="environment" className="hidden" disabled={subiendoFoto} onChange={handleFotoRecepcionUpload} />
                        </label>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{recepcionModal.fotos.length}/{MAX_FOTOS_RECEPCION} fotos</p>
                    {fotoError && <p className="text-xs text-rose-500 mt-1.5 flex items-center gap-1"><ImageOff size={12} /> {fotoError}</p>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setRecepcionModal(null)}
                    className="px-4 py-2 rounded-2xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition">
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleConfirmarRecepcion(selected)}
                    disabled={recepcionModal.km === ''}
                    className="px-4 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition shadow-sm flex items-center gap-2">
                    <Check size={14} /> Confirmar recepción
                  </button>
                </div>
              </div>
            </div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Eliminar esta OT"
        message="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* PDF Presupuesto Modal */}
      <AnimatePresence>
        {presupuestoPDF && (() => {
          const ot = presupuestoPDF;
          const cli = clientes.find(c => c.id === ot.clienteId);
          const veh = vehiculos.find(v => v.id === ot.vehiculoId);
          const esListo = ot.estado === 'listo' || ot.estado === 'entregado';
          const titulo = esListo ? 'Resumen de Reparación' : 'Presupuesto';
          return (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-50 print:hidden" onClick={() => setPresupuestoPDF(null)} />
              <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
                className="fixed inset-4 sm:inset-8 z-50 flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden print:inset-0 print:rounded-none print:shadow-none">

                {/* Toolbar — hidden on print */}
                <div className="flex items-center justify-between px-6 py-3 bg-slate-800 text-white print:hidden shrink-0">
                  <span className="font-semibold text-sm">{titulo} — {ot.numero}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => window.print()}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-xl text-xs font-semibold transition"
                    >
                      <Printer size={13} /> Imprimir / Guardar PDF
                    </button>
                    <button onClick={() => setPresupuestoPDF(null)} className="p-1.5 rounded-xl hover:bg-slate-700 transition">
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Printable content */}
                <div className="flex-1 overflow-y-auto bg-slate-100 print:bg-white print:overflow-visible">
                  <div className="max-w-3xl mx-auto my-8 bg-white shadow-xl rounded-2xl print:shadow-none print:rounded-none print:my-0 print:max-w-none">
                    <div className="p-10 space-y-6 text-slate-800 font-sans">

                    {/* Header empresa — misma línea gráfica que facturas */}
                    <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
                      <div className="flex items-center gap-4">
                        {empresa.logoBase64 && <img src={empresa.logoBase64} alt="Logo" className="h-14 object-contain" />}
                        <div>
                          <h1 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight">{empresa.nombre}</h1>
                          {empresa.ciudad && <p className="text-xs text-slate-500">{empresa.ciudad}</p>}
                          {empresa.correo && <p className="text-xs text-slate-500">{empresa.correo}</p>}
                          {empresa.telefono && <p className="text-xs text-slate-500">{empresa.telefono}</p>}
                          {empresa.web && <p className="text-xs text-slate-500">{empresa.web}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{titulo}</p>
                        <p className="text-2xl font-black font-mono text-blue-600">{ot.numero}</p>
                        <p className="text-xs text-slate-500 mt-1">Fecha: {ot.fechaRecepcion}</p>
                        {ot.fechaEstimadaEntrega && !esListo && (
                          <p className="text-xs text-slate-500">Entrega est.: {ot.fechaEstimadaEntrega}</p>
                        )}
                        {ot.fechaEntrega && (
                          <p className="text-xs text-slate-500">Entregado: {ot.fechaEntrega}</p>
                        )}
                      </div>
                    </div>

                    {/* Cliente + Vehículo */}
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Cliente</p>
                        <p className="font-semibold text-slate-800">{cli ? `${cli.nombre} ${cli.apellidos}` : '—'}</p>
                        {cli?.nifNiePasaporte && <p className="text-xs text-slate-500">DNI/NIE: {cli.nifNiePasaporte}</p>}
                        {cli?.telefono && <p className="text-xs text-slate-500">{cli.telefono}</p>}
                        {cli?.correo && <p className="text-xs text-slate-500">{cli.correo}</p>}
                        {cli?.direccion && <p className="text-xs text-slate-500">{cli.direccion}</p>}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Vehículo</p>
                        {veh ? (
                          <>
                            <p className="font-semibold text-slate-800">{veh.marca} {veh.modelo}</p>
                            <p className="text-xs text-slate-500">Matrícula: {veh.matricula}</p>
                            {veh.bastidor && <p className="text-xs text-slate-500">Bastidor: {veh.bastidor}</p>}
                            <p className="text-xs text-slate-500">Km entrada: {ot.kilometrajeEntrada.toLocaleString()} km</p>
                            {ot.kilometrajeSalida && <p className="text-xs text-slate-500">Km salida: {ot.kilometrajeSalida.toLocaleString()} km</p>}
                          </>
                        ) : <p className="text-xs text-slate-400">—</p>}
                        {ot.tecnicoAsignado && <p className="text-xs text-slate-500 mt-1">Técnico: {ot.tecnicoAsignado}</p>}
                      </div>
                    </div>

                    {/* Avería / Diagnóstico */}
                    <div className="space-y-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Descripción del problema</p>
                        <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">{ot.descripcionProblema}</p>
                      </div>
                      {ot.diagnostico && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Diagnóstico técnico</p>
                          <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">{ot.diagnostico}</p>
                        </div>
                      )}
                    </div>

                    {/* Líneas */}
                    {ot.lineas.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">Detalle de trabajos y materiales</p>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="border-b-2 border-slate-200">
                              <th className="py-2 text-left text-xs font-bold text-slate-500">Descripción</th>
                              <th className="py-2 text-center text-xs font-bold text-slate-500">Tipo</th>
                              <th className="py-2 text-right text-xs font-bold text-slate-500">Cant.</th>
                              <th className="py-2 text-right text-xs font-bold text-slate-500">Precio u.</th>
                              <th className="py-2 text-right text-xs font-bold text-slate-500">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ot.lineas.map((l, i) => (
                              <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                <td className="py-2 text-slate-800">{l.descripcion}</td>
                                <td className="py-2 text-center text-xs text-slate-500">{TIPO_META[l.tipo].label}</td>
                                <td className="py-2 text-right font-mono text-slate-600">{l.cantidad}</td>
                                <td className="py-2 text-right font-mono text-slate-600">{l.precioUnitario.toFixed(2)} €</td>
                                <td className="py-2 text-right font-mono font-semibold text-slate-800">{l.subtotal.toFixed(2)} €</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Totales */}
                    <div className="border-t-2 border-slate-200 pt-4 space-y-1.5">
                      <div className="flex justify-between text-sm text-slate-500">
                        <span>Base imponible</span>
                        <span className="font-mono">{ot.subtotal.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-sm text-slate-500">
                        <span>IVA ({ot.ivaPct}%)</span>
                        <span className="font-mono">{ot.totalIva.toFixed(2)} €</span>
                      </div>
                      <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                        <span>TOTAL</span>
                        <span className="font-mono text-lg">{ot.total.toFixed(2)} €</span>
                      </div>
                    </div>

                    {ot.notas && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Observaciones</p>
                        <p className="text-xs text-slate-600">{ot.notas}</p>
                      </div>
                    )}

                    {/* Pie */}
                    <div className="border-t border-slate-100 pt-6 text-center text-[10px] text-slate-300">
                      {empresa.nombre} · {empresa.direccionFiscal} · {empresa.telefono} · {empresa.web}
                    </div>
                  </div>
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {crearProductoRapido && (
        <CrearProductoRapidoModal
          nombreInicial={crearProductoRapido.nombreInicial}
          onClose={() => setCrearProductoRapido(null)}
          onCreado={(p) => { crearProductoRapido.aplicar(p); setCrearProductoRapido(null); }}
          onCreateProducto={onCreateProducto}
        />
      )}
    </div>
  );
}

interface CrearProductoRapidoModalProps {
  nombreInicial: string;
  onClose: () => void;
  onCreado: (p: Producto) => void;
  onCreateProducto: (p: Producto, stockInicial: number) => Promise<Producto>;
}

function CrearProductoRapidoModal({ nombreInicial, onClose, onCreado, onCreateProducto }: CrearProductoRapidoModalProps) {
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
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
            <label className="block text-xs font-semibold text-slate-600 mb-1">Costo €</label>
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
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-60">
          <Check size={15} /> {saving ? 'Creando…' : 'Crear y usar en la línea'}
        </button>
      </div>
    </div>
  );
}
