import { comprimirImagen, OPCIONES_FOTO } from '../utils/imagen';
import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BellPlus, ClipboardList, Plus, Search, ChevronRight, X, Check, Trash2,
  Car, User, Calendar, Gauge, Wrench, AlertCircle, FileText,
  Pencil, List, LayoutGrid, Camera, ImageOff, Droplet
} from 'lucide-react';
import { OrdenTrabajo, OTEstado, LineaOT, Vehiculo, Cliente, Tecnico, Empresa, Producto } from '../types';
import { listTecnicos, setPortalTokenTecnico } from '../lib/data/tecnicos';
import { getOrden, buscarOrdenes, OrdenListaRow } from '../lib/data/ordenes';
import { supabase } from '../lib/supabase';
import { avisarError } from '../lib/avisos';
import { mensajeDeError } from '../lib/errores';
import { fmt2, formatKm } from '../utils/moneda';
import { resumenTiempos, textoDuracion, textoHoras } from '../utils/duracionTarea';
import CambioAceiteOrden from './CambioAceiteOrden';
import InspeccionOrden from './InspeccionOrden';
import FirmasOrden from './FirmasOrden';
import FirmaOrdenModal from './FirmaOrdenModal';
import type { TipoFirma } from '../lib/data/firmas';
import { avisarOk } from '../lib/avisos';
import SearchableSelect from './SearchableSelect';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import type { Intencion } from '../ui/navegacion';
import TableroTaller from '../ui/TableroTaller';
import PasosOrden from '../ui/PasosOrden';
import AltaRapida from './AltaRapida';
import NuevoAviso from './NuevoAviso';
import { TarjetaLista } from '../ui/componentes';
import { useMovil } from '../ui/useMovil';
import type { NuevoAviso as DatosAviso } from '../lib/data/avisos';
import BadgeEstado from './orden/BadgeEstado';
import VisorPresupuesto from './orden/VisorPresupuesto';
import { BloqueAvisoListo, BloqueAvisoTecnico, BloqueLineasNuevas, BloquePresupuesto, HistorialOrden } from './orden/BloquesFicha';
import LineaTipoYProducto from './orden/LineaTipoYProducto';
import CrearProductoRapidoModal from './orden/CrearProductoRapidoModal';
import {
  CHECKLIST_RECEPCION_ITEMS, EMPTY_LINEA, EMPTY_OT_FORM, ENTRADA_PANEL, ESTADO_FLOW, ESTADO_META, MAX_FOTOS_RECEPCION, TIPO_META,
  type LineaForm, type OTForm,
} from './orden/constantes';
import { calcTotals, ESTADOS_SIN_AVISO_EXTRA, evento, progresoTareas } from './orden/utilidades';
import type { NuevoCliente } from '../lib/data/clientes';
import type { NuevoVehiculo } from '../lib/data/vehiculos';

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
  /** Una orden cambió en el servidor fuera del guardado normal (cambio de aceite: interruptor, filtros, próximo cambio). */
  onRefrescada: (ot: OrdenTrabajo) => void;
  onCreateProducto: (p: Producto, stockInicial: number) => Promise<Producto>;
  /** El tablero necesita más ancho del que da el layout centrado normal — App.tsx usa esto para ensanchar el <main> solo mientras esta vista está activa. */
  onVistaAmpliaChange?: (amplia: boolean) => void;
  /** Orden que llega del botón «Nuevo» o del buscador global del nuevo diseño (cada una trae un número distinto). */
  intencion?: Intencion;
  /** Alta rápida desde la orden: crea un cliente / un vehículo (ya a nombre de su dueño) sin salir de la recepción. */
  onCrearCliente?: (input: NuevoCliente) => Promise<Cliente>;
  onCrearVehiculo?: (input: NuevoVehiculo, clienteId: string) => Promise<Vehiculo>;
  /** Programar un aviso al cliente desde una orden ya lista o entregada («neumáticos en 6 meses»). */
  onCrearAviso?: (a: DatosAviso) => Promise<void>;
}

export default function OrdenesTrabajoTab({ ordenes, vehiculos, clientes, empresa, productos, onAdd, onUpdate, onDelete, onRefrescada, onCreateProducto, onVistaAmpliaChange, intencion, onCrearCliente, onCrearVehiculo, onCrearAviso }: Props) {
  const movil = useMovil();
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

  // Mantiene la ficha abierta al día con lo que llega por Realtime (el
  // mecánico marcando tareas desde su Portal) — `ordenes` es la fuente de
  // verdad que App.tsx ya actualiza en vivo; `selected` es solo una
  // instantánea local que si no, se queda congelada hasta que algo más
  // fuerce un re-render. Cuando ambos ya apuntan al mismo objeto esto no
  // provoca renders de más: `setSelected` con la misma referencia no hace nada.
  useEffect(() => {
    if (!selected) return;
    const actualizado = ordenes.find(o => o.id === selected.id);
    if (actualizado) setSelected(actualizado);
  }, [ordenes, selected]);


  const [isCreating, setIsCreating] = useState(false);
  const [guardandoOT, setGuardandoOT] = useState(false);
  const [createTipo, setCreateTipo] = useState<'presupuesto' | 'recibido'>('presupuesto');
  const [altaRapida, setAltaRapida] = useState<{ modo: 'cliente' | 'vehiculo'; texto: string } | null>(null);
  const [programandoAviso, setProgramandoAviso] = useState(false);
  const [otForm, setOTForm] = useState<OTForm>(EMPTY_OT_FORM);
  const [formLineas, setFormLineas] = useState<LineaOT[]>([]);
  const [newLinea, setNewLinea] = useState<LineaForm>(EMPTY_LINEA);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [presupuestoPDF, setPresupuestoPDF] = useState<OrdenTrabajo | null>(null);
  // Firma en pantalla: qué firma se está pidiendo ahora.
  const [firmando, setFirmando] = useState<TipoFirma | null>(null);
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

  // Usado solo por el Tablero — la Lista tiene su propia búsqueda/paginación
  // en servidor (ver listaFilas más abajo), así que aquí ya no hace falta
  // el filtro por estado de los pills (que de todas formas nunca aplicaba
  // al Tablero: cada columna ya es su propio estado).
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return ordenes
      .filter(ot => {
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
  }, [ordenes, vehiculos, clientes, search]);

  // Búsqueda + paginación en servidor para la Lista — no depende del array
  // completo de `ordenes` para su propio contenido, pero se refresca cuando
  // ese array cambia de referencia (cualquier alta/edición/baja de OT en
  // esta pestaña ya lo actualiza) para no quedarse con una página obsoleta.
  const LISTA_PAGE_SIZE = 20;
  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const [listaPagina, setListaPagina] = useState(1);
  const [listaFilas, setListaFilas] = useState<OrdenListaRow[]>([]);
  const [listaTotal, setListaTotal] = useState(0);
  const [listaCargando, setListaCargando] = useState(true);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);

  useEffect(() => { setListaPagina(1); }, [searchDebounced, filterEstado]);

  useEffect(() => {
    if (vista !== 'lista') return;
    setListaCargando(true);
    buscarOrdenes({
      termino: searchDebounced,
      estado: filterEstado === 'todas' ? null : filterEstado,
      limit: LISTA_PAGE_SIZE,
      offset: (listaPagina - 1) * LISTA_PAGE_SIZE,
    })
      .then(({ data, count }) => { setListaFilas(data); setListaTotal(count); })
      .catch(() => { setListaFilas([]); setListaTotal(0); })
      .finally(() => setListaCargando(false));
  }, [vista, searchDebounced, filterEstado, listaPagina, ordenes]);

  const abrirDetalleOT = async (id: string) => {
    setCargandoDetalleId(id);
    try {
      setSelected(await getOrden(id));
    } catch (err) {
      avisarError(err, 'No se pudo abrir la orden.');
    } finally {
      setCargandoDetalleId(null);
    }
  };

  const openCreate = (tipo: 'presupuesto' | 'recibido' = 'presupuesto') => {
    setCreateTipo(tipo);
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

  // Del botón «Nuevo» o del buscador global (nuevo diseño): abre la recepción de un coche o filtra por esa orden/matrícula.
  useEffect(() => {
    if (!intencion) return;
    if (intencion.tipo === 'nuevo') openCreate(intencion.modo ?? 'recibido');
    else setSearch(intencion.texto ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intencion?.n]);

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
    // El número real lo asigna createOrden (con reintento si choca con otra
    // creación simultánea) — este valor nunca llega a guardarse.
    const ot: OrdenTrabajo = {
      id: 'ot-' + Date.now(),
      numero: '',
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
      esCambioAceite: otForm.esCambioAceite,
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
    } catch (err) {
      // La ventana se queda abierta con todo lo escrito.
      setFormError(mensajeDeError(err, esPresupuesto ? 'No se pudo guardar el presupuesto.' : 'No se pudo guardar la orden.'));
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
    try {
      setSelected(await onUpdate(updated));
    } catch (err) {
      avisarError(err, `No se pudo pasar la orden a «${ESTADO_META[estado].label}».`);
    }
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
    try {
      setSelected(await onUpdate(updated));
      setRecepcionModal(null);
    } catch (err) {
      avisarError(err, 'No se pudo registrar la recepción del vehículo.');
    }
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
        for (const original of files) {
          // Se reduce en el móvil antes de subir: una foto de cámara pesa 3-8 MB y aquí basta con ~300 KB.
          const { blob, ext, tipo } = await comprimirImagen(original, OPCIONES_FOTO);
          const path = `${empresa.id}/${crypto.randomUUID()}.${ext}`;
          const { error } = await supabase.storage
            .from('fotos-recepcion')
            .upload(path, blob, { cacheControl: '3600', contentType: tipo });
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
    try {
      setSelected(await onUpdate(updated));
    } catch (err) {
      avisarError(err, 'No se pudo marcar el presupuesto como enviado.');
    }
  };

  const handleNotificarListo = async (ot: OrdenTrabajo) => {
    const updated: OrdenTrabajo = {
      ...ot,
      notificacionEnviada: true,
      fechaActualizacion: new Date().toISOString(),
      historial: [...(ot.historial ?? []), evento('Cliente notificado — vehículo listo para recoger')],
    };
    try {
      setSelected(await onUpdate(updated));
    } catch (err) {
      avisarError(err, 'No se pudo anotar el aviso al cliente.');
    }
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
      esCambioAceite: ot.esCambioAceite ?? false, // no se edita aquí: tiene su propio bloque en la ficha
    });
    setEditOTLineas([...ot.lineas]);
    setEditOTEditingLineaId(null);
    setEditOTNewLinea(EMPTY_LINEA);
    setIsEditing(true);
  };

  const handleEditSave = async (ot: OrdenTrabajo) => {
    const { subtotal, totalIva, total } = calcTotals(editOTLineas, editForm.ivaPct);
    // Las líneas realmente nuevas (no estaban ya en la OT) se marcan como
    // pendientes de avisar al cliente — persistido en la propia línea, no en
    // estado efímero de React: así sobrevive a recargar la página o cambiar
    // de pestaña antes de enviar el aviso. Solo aplica a una OT que ya es un
    // trabajo activo y cobrable — ni en fase de presupuesto (añadir líneas
    // ahí es solo terminar de armar el propio presupuesto) ni en una ya
    // cancelada o entregada (no tiene sentido avisar de un extra ahí).
    const idsOriginales = new Set(ot.lineas.map(l => l.id));
    const requiereAviso = !ESTADOS_SIN_AVISO_EXTRA.includes(ot.estado);
    const lineasFinal = requiereAviso
      ? editOTLineas.map(l => (idsOriginales.has(l.id) ? l : { ...l, notificadoCliente: false }))
      : editOTLineas;
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
      lineas: lineasFinal,
      subtotal, totalIva, total,
    };
    try {
      setSelected(await onUpdate(updated));
      setIsEditing(false);
    } catch (err) {
      // La edición se queda abierta con los cambios sin guardar.
      avisarError(err, 'No se pudieron guardar los cambios de la orden.');
    }
  };

  const handleMarcarLineasAvisadas = async (ot: OrdenTrabajo) => {
    const updated: OrdenTrabajo = {
      ...ot,
      lineas: ot.lineas.map(l => (l.notificadoCliente === false ? { ...l, notificadoCliente: true } : l)),
    };
    try {
      setSelected(await onUpdate(updated));
    } catch (err) {
      avisarError(err, 'No se pudo marcar el aviso como enviado.');
    }
  };

  const handleDeleteConfirmed = async () => {
    const id = confirmDelete;
    setConfirmDelete(null);
    if (!id) return;
    try {
      await onDelete(id);
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      avisarError(err, 'No se pudo eliminar la orden.');
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
    <>
    {/* Se envuelve solo la vista de lista/kanban (no el visor de presupuesto
        de abajo) para que al imprimir un presupuesto no salga también esto. */}
    <div className="flex flex-col gap-6 print:hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Wrench size={20} className="text-blue-600" /> Órdenes de Trabajo
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">{ordenes.length} activas o entregadas hace poco</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
          <>
          <button
            onClick={() => openCreate('presupuesto')}
            data-testid="taller-presupuesto"
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-2xl text-sm font-semibold transition"
          >
            <ClipboardList size={15} /> Nuevo presupuesto
          </button>
          <button
            onClick={() => openCreate('recibido')}
            data-testid="taller-recibir"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-2xl text-sm font-semibold transition shadow-sm"
          >
            <Plus size={15} /> Recibir un coche
          </button>
          </>
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
          <TableroTaller
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
        {listaCargando ? (
          <div className="py-16 text-center text-slate-400 text-sm">Cargando…</div>
        ) : listaFilas.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <ClipboardList size={36} className="mx-auto mb-3 opacity-20" />
            No hay órdenes de trabajo
          </div>
        ) : (
          <>
            {movil ? (
              <div className="u-tl-lista" style={{ padding: 12 }} data-testid="lista-ordenes-movil">
                {listaFilas.map(f => (
                  <TarjetaLista
                    key={f.id}
                    onClick={() => abrirDetalleOT(f.id)}
                    atenuada={cargandoDetalleId === f.id}
                    seleccionada={selected?.id === f.id}
                    titulo={<><span className="font-mono text-xs font-bold text-blue-700">{f.numero}</span><br />{f.vehiculoMarca} {f.vehiculoModelo} <span className="u-matri">{f.vehiculoMatricula}</span></>}
                    importe={f.total > 0 ? `${fmt2(f.total)}\u00a0€` : <span className="text-slate-300 font-normal text-xs">Por definir</span>}
                    lineas={[`${f.clienteNombre} ${f.clienteApellidos}`, `Recepción: ${f.fechaRecepcion}`]}
                    pie={<>
                      <BadgeEstado estado={f.estado} presupuestoEstado={f.presupuestoEstado} presupuestoAprobado={f.presupuestoAprobado} notificacionEnviada={f.notificacionEnviada} />
                      {(f.estado === 'recibido' || f.estado === 'en_reparacion') && f.tareasTotal > 0 && f.tareasHechas === f.tareasTotal && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 flex items-center gap-1"><Check size={9} /> Técnico terminó</span>
                      )}
                    </>}
                  />
                ))}
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
                  {listaFilas.map(f => (
                    <tr
                      key={f.id}
                      onClick={() => abrirDetalleOT(f.id)}
                      className={`cursor-pointer hover:bg-blue-50/40 transition ${selected?.id === f.id ? 'bg-blue-50/60' : ''} ${cargandoDetalleId === f.id ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{f.numero}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{f.vehiculoMarca} {f.vehiculoModelo}</div>
                        <div className="text-[11px] text-slate-400">{f.vehiculoMatricula}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{f.clienteNombre} {f.clienteApellidos}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{f.fechaRecepcion}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <BadgeEstado estado={f.estado} presupuestoEstado={f.presupuestoEstado} presupuestoAprobado={f.presupuestoAprobado} notificacionEnviada={f.notificacionEnviada} />
                          {(f.estado === 'recibido' || f.estado === 'en_reparacion') && f.tareasTotal > 0 && f.tareasHechas === f.tareasTotal && (
                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 flex items-center gap-1">
                              <Check size={9} /> Técnico terminó
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                        {f.total > 0 ? `${fmt2(f.total)} €` : <span className="text-slate-300 font-normal text-xs">Por definir</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight size={14} className="text-slate-300 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            <div className="px-4 py-3 border-t border-slate-100">
              <Pagination currentPage={listaPagina} totalItems={listaTotal} pageSize={LISTA_PAGE_SIZE} onPageChange={setListaPagina} />
            </div>
          </>
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
              {...ENTRADA_PANEL()}
              data-panel-lateral
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
                    title="Eliminar OT"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button onClick={() => setSelected(null)} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 transition">
                    <X size={16} />
                  </button>
                </div>
              </div>

              {(() => {
                const enTaller = selected.estado === 'recibido' || selected.estado === 'en_reparacion';
                const enviado = selected.presupuestoEstado === 'enviado';
                const aprobado = !!selected.aceptacionPresupuesto || selected.presupuestoAprobado === true;
                let aviso: { texto: string; onClick?: () => void; tono?: 'pendiente' | 'espera' | 'mal' } | undefined;
                if (enTaller && !aprobado) {
                  const ir = () => document.getElementById('bloque-presupuesto')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  if (!enviado) aviso = { texto: 'Falta enviar el presupuesto al cliente ↓', onClick: ir, tono: 'pendiente' };
                  else if (selected.presupuestoAprobado === false) aviso = { texto: 'El cliente rechazó el presupuesto ↓', onClick: ir, tono: 'mal' };
                  else aviso = { texto: 'Presupuesto enviado: esperando al cliente', onClick: ir, tono: 'espera' };
                }
                return <PasosOrden estado={selected.estado} onSiguiente={(e) => handleEstadoChange(selected, e)} aviso={aviso} />;
              })()}

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                {/* Vehicle + Client */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-2xl p-3 flex items-start gap-2">
                    <Car size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Vehículo</p>
                      <p className="text-sm font-semibold text-slate-800">{vehLabel(selected.vehiculoId)}</p>
                      {selected.estado !== 'presupuesto' && (
                        <p className="text-xs text-slate-400">{formatKm(selected.kilometrajeEntrada)} km entrada
                          {selected.kilometrajeSalida && ` · ${formatKm(selected.kilometrajeSalida)} km salida`}
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
                      const { total, hechas, terminado } = progresoTareas(selected);
                      if (total === 0) return null;
                      return terminado ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 flex items-center gap-1">
                          <Check size={9} /> Técnico terminó todas las tareas
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1">
                          <Wrench size={9} /> {hechas}/{total} tareas del técnico
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
                                {l.tipo === 'mano_de_obra' && l.duracionMin != null && (
                                  <span className="block text-[10px] text-slate-400 mt-0.5">
                                    Real {textoDuracion(l.duracionMin)} · Cobrado {textoHoras(l.cantidad)}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${l.tipo === 'mano_de_obra' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                  {TIPO_META[l.tipo].label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600">{l.cantidad}</td>
                              <td className="px-3 py-2 text-right font-mono">{fmt2(l.precioUnitario)} €</td>
                              <td className="px-3 py-2 text-right font-mono font-semibold">{fmt2(l.subtotal)} €</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Avance en el taller: lo que ha anotado el mecánico desde su Portal. */}
                {(() => {
                  const t = resumenTiempos(selected.lineas);
                  if (t.tareas === 0 || (t.hechas === 0 && t.conTiempo === 0)) return null;
                  return (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-1.5">
                      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Wrench size={11} /> Avance en el taller</p>
                      <p className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{t.hechas} de {t.tareas}</span> {t.tareas === 1 ? 'tarea hecha' : 'tareas hechas'}
                        {selected.tecnicoAsignado ? ` · ${selected.tecnicoAsignado}` : ''}
                      </p>
                      {t.conTiempo > 0 && (
                        <p className="text-xs text-slate-600">
                          Tiempo real registrado: <span className="font-semibold text-slate-800">{textoDuracion(t.minutosReales)}</span>
                          {t.conTiempo < t.tareas && ` (en ${t.conTiempo} de ${t.tareas} tareas)`}
                          {' · '}Horas cobradas: <span className="font-semibold text-slate-800">{textoHoras(t.horasCobradas)}</span>
                        </p>
                      )}
                    </div>
                  );
                })()}

                <CambioAceiteOrden
                  ot={selected}
                  vehiculo={vehiculos.find(v => v.id === selected.vehiculoId)}
                  onCambio={(fresca) => { setSelected(fresca); onRefrescada(fresca); }}
                />

                <InspeccionOrden
                  ot={selected}
                  retencionMeses={empresa.fotosRetencionMeses}
                  empresa={empresa}
                  clienteNombre={(() => { const c = clientes.find(x => x.id === selected.clienteId); return c ? `${c.nombre} ${c.apellidos}`.trim() : ''; })()}
                  clienteTelefono={clientes.find(x => x.id === selected.clienteId)?.telefono || undefined}
                  vehiculoDescripcion={(() => { const v = vehiculos.find(x => x.id === selected.vehiculoId); return v ? `${v.marca} ${v.modelo}${v.matricula ? ` (${v.matricula})` : ''}` : ''; })()}
                  onCambioOrden={(fresca) => { setSelected(fresca); onRefrescada(fresca); }}
                />

                <FirmasOrden ot={selected} onFirmar={setFirmando} />

                {/* El resumen de reparación (con las firmas) se imprime con el vehículo ya listo o entregado. */}
                {(selected.estado === 'listo' || selected.estado === 'entregado') && (
                  <button type="button" onClick={() => setPresupuestoPDF(selected)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                    <FileText size={14} /> Ver / imprimir resumen de reparación
                  </button>
                )}
                {onCrearAviso && (selected.estado === 'listo' || selected.estado === 'entregado') && (
                  <button type="button" onClick={() => setProgramandoAviso(true)} data-testid="orden-programar-aviso"
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer">
                    <BellPlus size={14} /> Recordarle algo más adelante (neumáticos, frenos…)
                  </button>
                )}

                {/* Totals */}
                {totalesSelected && selected.lineas.length > 0 && (
                  <div className="bg-slate-50 rounded-2xl p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span className="font-mono">{fmt2(totalesSelected.subtotal)} €</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>IVA ({selected.ivaPct}%)</span>
                      <span className="font-mono">{fmt2(totalesSelected.totalIva)} €</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-2 mt-1">
                      <span>Total</span>
                      <span className="font-mono text-base">{fmt2(totalesSelected.total)} €</span>
                    </div>
                  </div>
                )}

                {selected.notas && (
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1">Notas</p>
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">{selected.notas}</p>
                  </div>
                )}

                {/* Presupuesto del cliente (antes de recibir el coche, o con el coche ya dentro), avisos y línea de tiempo */}
                {(selected.estado === 'presupuesto' || selected.estado === 'recibido' || selected.estado === 'en_reparacion') && (
                  <BloquePresupuesto
                    selected={selected} clientes={clientes} vehiculos={vehiculos} empresa={empresa}
                    onCambio={(fresca) => { setSelected(fresca); onRefrescada(fresca); }}
                    onVerPdf={setPresupuestoPDF}
                    onMarcarEnviado={handleEnviarPresupuesto}
                  />
                )}
                {selected.estado === 'listo' && (
                  <BloqueAvisoListo selected={selected} clientes={clientes} vehiculos={vehiculos} empresa={empresa} onMarcarNotificado={handleNotificarListo} />
                )}
                {selected.tecnicoAsignado && (selected.estado === 'recibido' || selected.estado === 'en_reparacion') && (
                  <BloqueAvisoTecnico selected={selected} tecnicos={tecnicos} vehiculos={vehiculos} generando={generandoPortalTecnico} onAsegurarPortal={asegurarPortalTecnico} />
                )}
                <BloqueLineasNuevas selected={selected} clientes={clientes} vehiculos={vehiculos} empresa={empresa} onMarcarAvisadas={handleMarcarLineasAvisadas} />
                {selected.historial && selected.historial.length > 0 && <HistorialOrden historial={selected.historial} />}

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

      {altaRapida && onCrearCliente && onCrearVehiculo && (
        <AltaRapida
          modo={altaRapida.modo}
          clientes={clientes}
          textoInicial={altaRapida.texto}
          clienteIdInicial={altaRapida.modo === 'vehiculo' ? otForm.clienteId : ''}
          onCrearCliente={onCrearCliente}
          onCrearVehiculo={onCrearVehiculo}
          onCerrar={() => setAltaRapida(null)}
          onListo={({ clienteId, vehiculoId }) => {
            setOTForm(f => ({ ...f, ...(clienteId ? { clienteId } : {}), ...(vehiculoId ? { vehiculoId } : {}) }));
            setAltaRapida(null);
          }}
        />
      )}

      {programandoAviso && onCrearAviso && selected && (
        <NuevoAviso
          empresa={empresa} clientes={clientes} vehiculos={vehiculos}
          clienteIdInicial={selected.clienteId} vehiculoIdInicial={selected.vehiculoId} ordenId={selected.id}
          onGuardar={async (a) => { await onCrearAviso(a); setProgramandoAviso(false); }}
          onCerrar={() => setProgramandoAviso(false)}
        />
      )}

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
              {...ENTRADA_PANEL()}
              data-panel-lateral
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
                              <td className="px-3 py-1.5 text-right font-mono">{fmt2(l.precioUnitario)} €</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmt2(l.subtotal)} €</td>
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
                    return <div className="flex-1 text-right text-sm"><span className="text-slate-400">Base: {fmt2(t.subtotal)} € · IVA: {fmt2(t.totalIva)} € · </span><strong className="text-slate-800 font-mono">{fmt2(t.total)} €</strong></div>;
                  })()}
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Notas internas</label>
                  <textarea rows={2} value={editForm.notas}
                    onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                </div>

                <div className="flex justify-end gap-2 dlg-pie">
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
                <div className="grid grid-cols-2 gap-3" role="group" aria-label="Qué vas a hacer">
                  <button type="button"
                    onClick={() => setCreateTipo('recibido')}
                    aria-pressed={createTipo === 'recibido'}
                    className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition text-left ${createTipo === 'recibido' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className="font-bold mb-0.5">🔑 Recibir el coche</div>
                    <div className="text-xs font-normal opacity-70">El coche entra ahora al taller</div>
                  </button>
                  <button type="button"
                    onClick={() => setCreateTipo('presupuesto')}
                    aria-pressed={createTipo === 'presupuesto'}
                    className={`py-3 px-4 rounded-2xl border-2 text-sm font-semibold transition text-left ${createTipo === 'presupuesto' ? 'border-violet-500 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                  >
                    <div className="font-bold mb-0.5">📋 Solo presupuesto</div>
                    <div className="text-xs font-normal opacity-70">El coche aún no entra al taller</div>
                  </button>
                </div>

                {/* Vehículo (se busca por matrícula, marca, modelo o dueño) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo *</label>
                  <SearchableSelect
                    options={vehiculos.map(v => {
                      const dueno = clientes.find(c => c.vehiculosAsociados?.includes(v.id));
                      return { value: v.id, label: `${v.marca} ${v.modelo} · ${v.matricula}`, sublabel: dueno ? `${dueno.nombre} ${dueno.apellidos}` : 'Sin cliente asociado' };
                    })}
                    value={otForm.vehiculoId}
                    onChange={(vehId) => {
                      const dueno = clientes.find(c => c.vehiculosAsociados?.includes(vehId));
                      setOTForm(f => ({ ...f, vehiculoId: vehId, clienteId: dueno?.id ?? '' }));
                    }}
                    placeholder="Buscar por matrícula, marca o cliente…"
                    emptyMessage="Ningún vehículo coincide"
                    required
                    onCreateNew={onCrearVehiculo && onCrearCliente ? (texto) => setAltaRapida({ modo: 'vehiculo', texto }) : undefined}
                    createLabel="Crear vehículo"
                  />
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
                      <SearchableSelect
                        options={clientes.map(c => ({ value: c.id, label: `${c.nombre} ${c.apellidos}`, sublabel: [c.telefono, c.nifNiePasaporte].filter(Boolean).join(' · ') }))}
                        value={otForm.clienteId}
                        onChange={(id) => setOTForm(f => ({ ...f, clienteId: id }))}
                        placeholder="Buscar cliente por nombre, teléfono o documento…"
                        emptyMessage="Ningún cliente coincide"
                        required
                        onCreateNew={onCrearCliente ? (texto) => setAltaRapida({ modo: 'cliente', texto }) : undefined}
                        createLabel="Crear cliente"
                      />
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

                {/* Cambio de aceite: activa el check list de filtros y el próximo cambio en la orden. */}
                <label className="flex items-center gap-2.5 px-3 py-2.5 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition">
                  <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={otForm.esCambioAceite}
                    onChange={e => setOTForm(f => ({ ...f, esCambioAceite: e.target.checked }))} />
                  <span className="text-sm text-slate-700 flex items-center gap-1.5"><Droplet size={14} className="text-blue-600" /> Es un cambio de aceite</span>
                  <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">Añade el check list de filtros y el próximo cambio</span>
                </label>

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
                              <td className="px-3 py-1.5 text-right font-mono">{fmt2(l.precioUnitario)} €</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{fmt2(l.subtotal)} €</td>
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
                        <span className="text-slate-400">Base: {fmt2(t.subtotal)} € · IVA: {fmt2(t.totalIva)} € · </span>
                        <strong className="text-slate-800 font-mono">{fmt2(t.total)} €</strong>
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

                <div className="flex justify-end gap-2 dlg-pie">
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
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-5 dlg-b">
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
                <div className="flex justify-end gap-2 dlg-pie">
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
    </div>

      <AnimatePresence>
        {presupuestoPDF && <VisorPresupuesto key={presupuestoPDF.id} ot={presupuestoPDF} empresa={empresa} clientes={clientes} vehiculos={vehiculos} onClose={() => setPresupuestoPDF(null)} />}
      </AnimatePresence>

      {firmando && selected && (
        <FirmaOrdenModal
          tipo={firmando}
          ot={selected}
          clienteNombre={cliLabel(selected.clienteId)}
          vehiculoDescripcion={vehLabel(selected.vehiculoId)}
          onCancelar={() => setFirmando(null)}
          onFirmada={() => {
            const id = selected.id;
            setFirmando(null);
            getOrden(id)
              .then((fresca) => { setSelected(fresca); onRefrescada(fresca); avisarOk('Firma guardada.'); })
              .catch((err) => avisarError(err, 'La firma se guardó, pero no se pudo actualizar la pantalla. Cierra y vuelve a abrir la orden.'));
          }}
        />
      )}

      {crearProductoRapido && (
        <CrearProductoRapidoModal
          nombreInicial={crearProductoRapido.nombreInicial}
          onClose={() => setCrearProductoRapido(null)}
          onCreado={(p) => { crearProductoRapido.aplicar(p); setCrearProductoRapido(null); }}
          onCreateProducto={onCreateProducto}
        />
      )}
    </>
  );
}
