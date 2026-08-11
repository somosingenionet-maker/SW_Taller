import { useState, useMemo } from 'react';
import { Vehiculo, OrdenTrabajo, OTEstado } from '../types';
import {
  Car, Search, Plus, Wrench, Calendar, Shield, CreditCard, PenTool, Trash2, X, Check, Save, Download, ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import { formatDate } from '../utils/dateFormat';
import { downloadCsv } from '../utils/csvExport';

interface VehiclesTabProps {
  vehiculos: Vehiculo[];
  ordenesTrabajo?: OrdenTrabajo[];
  onAddVehiculo: (input: Omit<Vehiculo, 'id' | 'fechaRegistro'>) => void | Promise<void>;
  onUpdateVehiculo: (vehiculo: Vehiculo) => void | Promise<void>;
  onDeleteVehiculo: (id: string) => void | Promise<void>;
}

const OT_ESTADO_LABEL: Record<OTEstado, string> = {
  presupuesto: 'Presupuesto',
  recibido: 'Recibido',
  en_reparacion: 'En reparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

const OT_ESTADO_COLOR: Record<OTEstado, string> = {
  presupuesto: 'bg-violet-100 text-violet-700',
  recibido: 'bg-slate-100 text-slate-600',
  en_reparacion: 'bg-orange-100 text-orange-700',
  listo: 'bg-cyan-100 text-cyan-700',
  entregado: 'bg-teal-100 text-teal-700',
  cancelado: 'bg-rose-100 text-rose-600',
};

export default function VehiclesTab({
  vehiculos,
  ordenesTrabajo = [],
  onAddVehiculo,
  onUpdateVehiculo,
  onDeleteVehiculo
}: VehiclesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVehiculo, setSelectedVehiculo] = useState<Vehiculo | null>(null);
  const [expandedOtId, setExpandedOtId] = useState<string | null>(null);
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [formData, setFormData] = useState<Omit<Vehiculo, 'id' | 'fechaRegistro'>>({
    marca: '',
    modelo: '',
    matricula: '',
    bastidor: '',
    kilometraje: '' as unknown as number,
    itvVencimiento: '',
    seguroVencimiento: '',
    impuestoVencimiento: ''
  });

  const [editFormData, setEditFormData] = useState<Vehiculo | null>(null);
  const [addFormError, setAddFormError] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; vehiculoId: string }>({ isOpen: false, vehiculoId: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  // Filter vehicles
  const filteredVehiculos = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return vehiculos
      .filter(veh =>
        veh.marca.toLowerCase().includes(term) ||
        veh.modelo.toLowerCase().includes(term) ||
        veh.matricula.toLowerCase().includes(term) ||
        veh.bastidor.toLowerCase().includes(term)
      )
      .sort((a, b) => b.id.localeCompare(a.id));
  }, [vehiculos, searchTerm]);

  const pagedVehiculos = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredVehiculos.slice(start, start + PAGE_SIZE);
  }, [filteredVehiculos, currentPage]);

  // Statistics
  const totalVehiculos = useMemo(() => vehiculos.length, [vehiculos]);
  const DIAS_ALERTA = 30;
  const { itvAlerta, seguroAlerta } = useMemo(() => {
    const hoy = new Date();
    const limite = new Date(hoy.getTime() + DIAS_ALERTA * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return {
      itvAlerta: vehiculos.filter(v => v.itvVencimiento <= limite).length,
      seguroAlerta: vehiculos.filter(v => v.seguroVencimiento <= limite).length,
    };
  }, [vehiculos]);

  const handleOpenAdd = () => {
    setFormData({
      marca: '',
      modelo: '',
      matricula: '',
      bastidor: '',
      kilometraje: '' as unknown as number,
      itvVencimiento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      seguroVencimiento: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      impuestoVencimiento: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
    setIsAddingOpen(true);
  };

  const handleAddSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!formData.marca || !formData.modelo || !formData.matricula) {
      setAddFormError('Por favor, rellene de forma correcta la Marca, Modelo y Matrícula.');
      return;
    }
    setAddFormError('');
    onAddVehiculo({
      ...formData,
      kilometraje: Number(formData.kilometraje)
    });
    setIsAddingOpen(false);
  };

  const handleEditClick = (veh: Vehiculo) => {
    setEditFormData({ ...veh });
    setIsEditing(true);
  };

  const handleEditSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (editFormData) {
      onUpdateVehiculo({
        ...editFormData,
        kilometraje: Number(editFormData.kilometraje)
      });
      setIsEditing(false);
      // Update selected interactive vehicle view if open
      if (selectedVehiculo?.id === editFormData.id) {
        setSelectedVehiculo(editFormData);
      }
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmDialog({ isOpen: true, vehiculoId: id });
  };

  const handleDeleteConfirm = () => {
    onDeleteVehiculo(confirmDialog.vehiculoId);
    if (selectedVehiculo?.id === confirmDialog.vehiculoId) setSelectedVehiculo(null);
    setConfirmDialog({ isOpen: false, vehiculoId: '' });
  };

  const handleExportCsv = () => {
    const headers = ['Marca', 'Modelo', 'Matrícula', 'Bastidor', 'Km', 'ITV Vencimiento', 'Seguro Vencimiento', 'Impuesto Vencimiento', 'Fecha Registro'];
    const rows = vehiculos.map(v => [v.marca, v.modelo, v.matricula, v.bastidor, String(v.kilometraje), v.itvVencimiento, v.seguroVencimiento, v.impuestoVencimiento, v.fechaRegistro]);
    downloadCsv(`inGenio_flota_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  return (
    <div className="space-y-6" id="vehicles-tab-root">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="vehicles-metrics-banner">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4" id="metric-vehiculos">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Vehículos</p>
            <h3 className="text-2xl font-bold text-slate-800">{totalVehiculos}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4" id="metric-itv">
          <div className={`p-3 rounded-xl ${itvAlerta > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">ITV Próxima o Vencida</p>
            <h3 className={`text-2xl font-bold ${itvAlerta > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{itvAlerta}</h3>
            <p className="text-[10px] text-slate-400">en los próximos 30 días</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4" id="metric-seguro">
          <div className={`p-3 rounded-xl ${seguroAlerta > 0 ? 'bg-rose-50 text-rose-500' : 'bg-slate-50 text-slate-400'}`}>
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Seguro Próximo o Vencido</p>
            <h3 className={`text-2xl font-bold ${seguroAlerta > 0 ? 'text-rose-500' : 'text-slate-800'}`}>{seguroAlerta}</h3>
            <p className="text-[10px] text-slate-400">en los próximos 30 días</p>
          </div>
        </div>
      </div>

      {/* Main split dashboard list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Vehicles list */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-600" />
                Flota de Vehículos
              </h2>
              <p className="text-xs text-slate-400">Fichas técnicas centralizadas de Backoffice</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCsv}
                className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Exportar flota a CSV"
              >
                <Download className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={handleOpenAdd}
                id="btn-add-vehiculo"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition duration-150 flex items-center gap-1.5 focus:outline-none cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Alta Vehículo
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por marca, modelo, matrícula o bastidor..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              id="search-vehiculos"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-auto border-collapse" id="vehicles-table">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-2">Vehículo</th>
                  <th className="py-3 px-2">Matrícula</th>
                  <th className="py-3 px-2">Kilometraje</th>
                  <th className="py-3 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pagedVehiculos.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center">
                      <Car className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-400">
                        {searchTerm ? 'Ningún vehículo coincide con la búsqueda.' : 'No hay vehículos registrados. Pulse «Alta Vehículo» para empezar.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  pagedVehiculos.map((veh) => (
                    <tr 
                      key={veh.id} 
                      id={`veh-row-${veh.id}`}
                      className={`hover:bg-slate-50/70 transition cursor-pointer ${selectedVehiculo?.id === veh.id ? 'bg-blue-50/40 border-l-2 border-blue-600 font-medium' : ''}`}
                      onClick={() => setSelectedVehiculo(veh)}
                    >
                      <td className="py-3.5 px-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{veh.marca} {veh.modelo}</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">{veh.bastidor}</div>
                        </div>
                      </td>
                      <td className="py-3.5 px-2">
                        <span className="inline-block px-2.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-700 font-mono text-xs font-semibold rounded-md">
                          {veh.matricula}
                        </span>
                      </td>
                      <td className="py-3.5 px-2 font-mono text-slate-600 text-xs">
                        {veh.kilometraje.toLocaleString()} km
                      </td>
                      <td className="py-3.5 px-2 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditClick(veh)}
                          id={`btn-edit-${veh.id}`}
                          title="Editar"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition"
                        >
                          <PenTool className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(veh.id)}
                          id={`btn-delete-${veh.id}`}
                          title="Eliminar"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-md transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalItems={filteredVehiculos.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* Selected Vehicle Detail - Tech Specs + Maintenance Book */}
        <div className="lg:col-span-5">
          {selectedVehiculo ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6" id={`detail-panel-${selectedVehiculo.id}`}>
              <div className="flex justify-between items-start border-b border-slate-50 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-600 font-bold uppercase tracking-widest">Ficha Técnica Activa</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-800 font-display">{selectedVehiculo.marca} {selectedVehiculo.modelo}</h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">Bastidor: {selectedVehiculo.bastidor}</p>
                </div>
                <button
                  onClick={() => setSelectedVehiculo(null)}
                  title="Cerrar panel"
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Car className="w-3 h-3 text-blue-500" /> Matrícula
                  </div>
                  <div className="font-mono font-bold text-slate-700 mt-1">{selectedVehiculo.matricula}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Wrench className="w-3 h-3 text-blue-500" /> Kilometraje
                  </div>
                  <div className="font-mono font-bold text-slate-700 mt-1">{selectedVehiculo.kilometraje.toLocaleString()} km</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-amber-500" /> Vencimiento ITV
                  </div>
                  <div className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
                    {formatDate(selectedVehiculo.itvVencimiento)}
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                    <Shield className="w-3 h-3 text-red-500" /> Seguro
                  </div>
                  <div className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
                    {formatDate(selectedVehiculo.seguroVencimiento)}
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                  </div>
                </div>

                <div className="col-span-2 p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-teal-500" /> Impuesto de Circulación
                    </div>
                    <div className="text-xs font-semibold text-slate-700 mt-1">Próxima renovación: {formatDate(selectedVehiculo.impuestoVencimiento)}</div>
                  </div>
                  <span className="text-[10px] text-slate-300 font-mono">Alta: {formatDate(selectedVehiculo.fechaRegistro)}</span>
                </div>
              </div>

              {/* Historial de Órdenes de Trabajo */}
              {(() => {
                const otsVehiculo = ordenesTrabajo
                  .filter(ot => ot.vehiculoId === selectedVehiculo.id)
                  .sort((a, b) => b.fechaActualizacion.localeCompare(a.fechaActualizacion));
                return (
                  <div className="bg-slate-50/60 rounded-xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-bold text-slate-700">Historial de visitas al taller</span>
                      </div>
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{otsVehiculo.length} visitas</span>
                    </div>
                    {otsVehiculo.length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-3">Sin órdenes de trabajo registradas</p>
                    ) : (
                      <div className="space-y-2">
                        {otsVehiculo.map(ot => {
                          const isOpen = expandedOtId === ot.id;
                          return (
                            <div key={ot.id} className="bg-white rounded-lg border border-slate-100 overflow-hidden">
                              {/* Cabecera clicable */}
                              <button
                                onClick={() => setExpandedOtId(isOpen ? null : ot.id)}
                                className="w-full text-left p-3 hover:bg-slate-50 transition"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs font-mono font-bold text-slate-400 shrink-0">{ot.numero}</span>
                                    <span className="text-xs text-slate-700 truncate">{ot.descripcionProblema}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${OT_ESTADO_COLOR[ot.estado]}`}>
                                      {OT_ESTADO_LABEL[ot.estado]}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{isOpen ? '▲' : '▼'}</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                                  <span>{formatDate(ot.fechaRecepcion)}</span>
                                  <span className="font-semibold text-slate-600">{ot.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</span>
                                </div>
                              </button>

                              {/* Historial expandido */}
                              {isOpen && (
                                <div className="border-t border-slate-100 px-3 pb-3 pt-2 bg-slate-50/50">
                                  <p className="text-[10px] font-semibold text-slate-400 uppercase mb-2">Historial de la OT</p>
                                  {ot.historial.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">Sin eventos registrados</p>
                                  ) : (
                                    <div className="relative pl-4">
                                      <div className="absolute left-1.5 top-1 bottom-1 w-px bg-slate-200" />
                                      {ot.historial.map((ev, idx) => {
                                        const prev = ot.historial[idx - 1];
                                        let diffLabel = '';
                                        if (prev) {
                                          const ms = new Date(ev.fecha).getTime() - new Date(prev.fecha).getTime();
                                          const mins = Math.round(ms / 60000);
                                          if (mins < 60) diffLabel = `${mins}m después`;
                                          else if (mins < 1440) diffLabel = `${Math.round(mins / 60)}h después`;
                                          else diffLabel = `${Math.round(mins / 1440)}d después`;
                                        }
                                        return (
                                          <div key={idx} className="mb-2 last:mb-0">
                                            {diffLabel && (
                                              <p className="text-[9px] text-slate-300 ml-2 mb-0.5">↓ {diffLabel}</p>
                                            )}
                                            <div className="flex items-start gap-2">
                                              <div className="w-2 h-2 rounded-full bg-blue-400 border-2 border-white shadow-sm mt-0.5 shrink-0 -ml-3" />
                                              <div>
                                                <p className="text-xs text-slate-700 leading-snug">{ev.descripcion}</p>
                                                <p className="text-[10px] text-slate-400">
                                                  {new Date(ev.fecha).toLocaleDateString('es-ES')} · {new Date(ev.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center space-y-3 text-slate-400 h-full min-h-[400px]">
              <div className="p-4 bg-slate-50 rounded-full border border-slate-100">
                <Car className="w-10 h-10 text-slate-300" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Ficha Técnica e Historial Detallado</h4>
              <p className="text-xs max-w-xs">
                Seleccione un coche de la lista de la izquierda para ver su ficha técnica centralizada, libro de mantenimiento cronológico y alertas asociadas.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD VEHICLE */}
      <AnimatePresence>
        {isAddingOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
              id="add-vehicle-modal"
            >
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2 font-display">
                  <Car className="w-5 h-5 text-blue-600" />
                  Alta de Nuevo Vehículo
                </h3>
                <button 
                  onClick={() => setIsAddingOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Marca *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.marca}
                      onChange={e => setFormData({ ...formData, marca: e.target.value })}
                      placeholder="e.g. Toyota"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Modelo *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.modelo}
                      onChange={e => setFormData({ ...formData, modelo: e.target.value })}
                      placeholder="e.g. Auris"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Matrícula *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.matricula}
                      onChange={e => setFormData({ ...formData, matricula: e.target.value.toUpperCase() })}
                      placeholder="e.g. 1234-XYZ"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Número de Bastidor (VIN)</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.bastidor}
                      onChange={e => setFormData({ ...formData, bastidor: e.target.value.toUpperCase() })}
                      placeholder="17 caracteres alfanuméricos"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Kilometraje actual (km)</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.kilometraje === ('' as unknown as number) ? '' : formData.kilometraje}
                    onChange={e => setFormData({ ...formData, kilometraje: e.target.value === '' ? '' as unknown as number : Number(e.target.value) })}
                    placeholder="0"
                    required
                    min="0"
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-display">Fechas de Control de Alertas</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. ITV</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.itvVencimiento}
                        onChange={e => setFormData({ ...formData, itvVencimiento: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. Seguro</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.seguroVencimiento}
                        onChange={e => setFormData({ ...formData, seguroVencimiento: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. Impuestos</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.impuestoVencimiento}
                        onChange={e => setFormData({ ...formData, impuestoVencimiento: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                {addFormError && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 font-medium">{addFormError}</p>
                )}
                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => { setIsAddingOpen(false); setAddFormError(''); }}
                    className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-slate-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Guardar Nuevo
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Eliminar vehículo"
        message="¿Está completamente seguro de eliminar este vehículo? Se borrará su ficha técnica e historial de mantenimiento."
        confirmLabel="Sí, eliminar"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, vehiculoId: '' })}
      />

      {/* MODAL: EDIT VEHICLE */}
      <AnimatePresence>
        {isEditing && editFormData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
              id="edit-vehicle-modal"
            >
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-slate-800">
                <h3 className="font-extrabold flex items-center gap-2 font-display">
                  <PenTool className="w-5 h-5 text-blue-600" />
                  Editar Vehículo
                </h3>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Marca *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.marca}
                      onChange={e => setEditFormData({ ...editFormData, marca: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Modelo *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.modelo}
                      onChange={e => setEditFormData({ ...editFormData, modelo: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Matrícula *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.matricula}
                      onChange={e => setEditFormData({ ...editFormData, matricula: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Número de Bastidor (VIN)</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.bastidor || ''}
                      onChange={e => setEditFormData({ ...editFormData, bastidor: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Kilometraje actual (km)</label>
                  <input
                    type="number"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editFormData.kilometraje}
                    onChange={e => setEditFormData({ ...editFormData, kilometraje: Number(e.target.value) })}
                    required
                    min="0"
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-display">Fechas de Control de Alertas</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. ITV</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editFormData.itvVencimiento}
                        onChange={e => setEditFormData({ ...editFormData, itvVencimiento: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. Seguro</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editFormData.seguroVencimiento}
                        onChange={e => setEditFormData({ ...editFormData, seguroVencimiento: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase">Vto. Impuesto</label>
                      <input
                        type="date"
                        className="w-full mt-1 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={editFormData.impuestoVencimiento}
                        onChange={e => setEditFormData({ ...editFormData, impuestoVencimiento: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition text-slate-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center gap-1 cursor-pointer"
                  >
                    <Save className="w-4 h-4" /> Guardar Cambios
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
