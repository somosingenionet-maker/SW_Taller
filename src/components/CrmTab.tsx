import { useState, useMemo } from 'react';
import { Cliente, InteraccionCliente, Vehiculo, OrdenTrabajo, Empresa } from '../types';
import {
  Users, UserPlus, Search, Mail, Phone, MapPin, CreditCard, Clock, MessageSquare, Plus, Trash2, X, Check, Save, Download, PenTool, Car
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import { formatDate } from '../utils/dateFormat';
import { downloadCsv } from '../utils/csvExport';

interface CrmTabProps {
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  ordenesTrabajo: OrdenTrabajo[];
  empresa: Empresa;
  onAddCliente: (input: Omit<Cliente, 'id' | 'fechaRegistro' | 'interacciones'>) => Promise<Cliente>;
  onUpdateCliente: (cliente: Cliente) => Promise<Cliente>;
  onDeleteCliente: (id: string) => void | Promise<void>;
  onAddInteraccion: (clienteId: string, input: { tipo: InteraccionCliente['tipo']; notas: string }) => Promise<InteraccionCliente>;
}

export default function CrmTab({
  clientes,
  vehiculos,
  ordenesTrabajo,
  empresa,
  onAddCliente,
  onUpdateCliente,
  onDeleteCliente,
  onAddInteraccion
}: CrmTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  // IDs de vehículos ya asignados a algún cliente
  const vehiculosAsignadosGlobal = useMemo(
    () => new Set(clientes.flatMap(c => c.vehiculosAsociados ?? [])),
    [clientes]
  );
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // New interaction form state
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);
  const [newInteractionTipo, setNewInteractionTipo] = useState<'llamada' | 'email' | 'visita' | 'whatsapp'>('llamada');
  const [newInteractionNotes, setNewInteractionNotes] = useState('');

  // Client form states
  const [formData, setFormData] = useState<Omit<Cliente, 'id' | 'fechaRegistro' | 'interacciones'>>({
    nombre: '',
    apellidos: '',
    nifNiePasaporte: '',
    correo: '',
    telefono: '',
    direccion: '',
    ciudad: empresa.ciudad ?? '',
    pais: 'España',
    vehiculosAsociados: []
  });

  const [editFormData, setEditFormData] = useState<Cliente | null>(null);
  const [addFormError, setAddFormError] = useState('');
  const [vehiculoSearch, setVehiculoSearch] = useState('');
  const [vehiculoSearchEdit, setVehiculoSearchEdit] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; clienteId: string }>({ isOpen: false, clienteId: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 8;

  // Filters
  const filteredClientes = clientes
    .filter(cli =>
      cli.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.apellidos.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.nifNiePasaporte.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.correo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cli.telefono.includes(searchTerm)
    )
    .sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro));

  const pagedClientes = filteredClientes.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleOpenAdd = () => {
    setFormData({
      nombre: '',
      apellidos: '',
      nifNiePasaporte: '',
      correo: '',
      telefono: '',
      direccion: '',
      ciudad: empresa.ciudad ?? '',
      pais: 'España',
      vehiculosAsociados: []
    });
    setVehiculoSearch('');
    setIsAddingOpen(true);
  };

  const toggleVehiculo = (vid: string, current: string[]) =>
    current.includes(vid) ? current.filter(id => id !== vid) : [...current, vid];

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.apellidos || !formData.nifNiePasaporte) {
      setAddFormError('Por favor complete Nombre, Apellidos y Documento (DNI/NIE/Pasaporte).');
      return;
    }
    setAddFormError('');
    const creado = await onAddCliente(formData);
    setIsAddingOpen(false);
    setSelectedCliente(creado);
  };

  const handleEditClick = (cli: Cliente) => {
    setEditFormData({ ...cli });
    setVehiculoSearchEdit('');
    setIsEditing(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editFormData) {
      const actualizado = await onUpdateCliente(editFormData);
      setIsEditing(false);
      if (selectedCliente?.id === editFormData.id) {
        setSelectedCliente(actualizado);
      }
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmDelete({ isOpen: true, clienteId: id });
  };

  const handleDeleteConfirm = async () => {
    const { clienteId } = confirmDelete;
    setConfirmDelete({ isOpen: false, clienteId: '' });
    if (selectedCliente?.id === clienteId) setSelectedCliente(null);
    await onDeleteCliente(clienteId);
  };

  const handleAddInteractionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCliente || !newInteractionNotes) return;

    const creada = await onAddInteraccion(selectedCliente.id, {
      tipo: newInteractionTipo,
      notas: newInteractionNotes,
    });

    // Refleja la nueva interacción en la ficha abierta.
    setSelectedCliente({
      ...selectedCliente,
      interacciones: [creada, ...selectedCliente.interacciones],
    });
    setNewInteractionNotes('');
    setIsAddingInteraction(false);
  };

  const handleExportCsv = () => {
    const headers = ['Nombre', 'Apellidos', 'NIF/NIE/Pasaporte', 'Correo', 'Teléfono', 'Dirección', 'Fecha Registro'];
    const rows = clientes.map(c => [c.nombre, c.apellidos, c.nifNiePasaporte, c.correo, c.telefono, c.direccion, c.fechaRegistro]);
    downloadCsv(`thivox_clientes_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  return (
    <div className="space-y-6" id="crm-tab-root">
      
      {/* Top Banner Stats */}
      {(() => {
        const hoy = new Date();
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        const estadosAbiertos: OrdenTrabajo['estado'][] = ['recibido', 'presupuesto', 'en_reparacion', 'listo'];
        const clientesConOTAbierta = new Set(
          ordenesTrabajo.filter(ot => estadosAbiertos.includes(ot.estado)).map(ot => ot.clienteId)
        ).size;
        const nuevosEsteMes = clientes.filter(c => c.fechaRegistro >= inicioMes).length;
        return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-50 rounded-xl text-blue-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Clientes</p>
            <h3 className="text-2xl font-bold text-slate-800">{clientes.length}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Con OT Abierta</p>
            <h3 className="text-2xl font-bold text-slate-800">{clientesConOTAbierta}</h3>
            <p className="text-[10px] text-slate-400">vehículos en taller ahora</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-50 rounded-xl text-green-600">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Nuevos Este Mes</p>
            <h3 className="text-2xl font-bold text-slate-800">{nuevosEsteMes}</h3>
            <p className="text-[10px] text-slate-400">altas en {hoy.toLocaleString('es-ES', { month: 'long' })}</p>
          </div>
        </div>
      </div>
        );
      })()}

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Customer List Card */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 font-display" />
                Clientes Registrados (CRM)
              </h2>
              <p className="text-xs text-slate-400">Directorio de contacto e identificación fiscal</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleExportCsv}
                className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Exportar clientes a CSV"
              >
                <Download className="w-4 h-4" /> CSV
              </button>
              <button
                onClick={handleOpenAdd}
                id="btn-add-cliente"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl transition duration-150 flex items-center gap-1.5 focus:outline-none cursor-pointer font-sans"
              >
              <UserPlus className="w-4 h-4" />
              Nuevo Cliente
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
              placeholder="Buscar por nombre, documento (NIF/NIE) o email..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 focus:bg-white transition font-sans"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm table-auto border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-2">Cliente</th>
                  <th className="py-3 px-2">Identificación</th>
                  <th className="py-3 px-2">Teléfono</th>
                  <th className="py-3 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-700">
                {filteredClientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center">
                      <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-400 font-sans">
                        {searchTerm ? 'Ningún cliente coincide con la búsqueda.' : 'No hay clientes registrados. Pulse «Nuevo Cliente» para empezar.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  pagedClientes.map((cli) => (
                    <tr 
                      key={cli.id} 
                      className={`hover:bg-slate-50/70 transition cursor-pointer ${selectedCliente?.id === cli.id ? 'bg-blue-50/40 border-l-2 border-blue-600 font-medium' : ''}`}
                      onClick={() => setSelectedCliente(cli)}
                      id={`cli-row-${cli.id}`}
                    >
                      <td className="py-3.5 px-2">
                        <div>
                          <div className="font-bold text-slate-800">{cli.nombre} {cli.apellidos}</div>
                          <div className="text-xs text-slate-400 font-medium">{cli.correo}</div>
                        </div>
                      </td>
                      <td className="py-3.5 px-2 font-mono text-xs text-slate-600">
                        {cli.nifNiePasaporte}
                      </td>
                      <td className="py-3.5 px-2 text-xs text-slate-600 whitespace-nowrap font-mono">
                        {cli.telefono}
                      </td>
                      <td className="py-3.5 px-2 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleEditClick(cli)}
                          title="Editar ficha"
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition"
                        >
                          <PenTool className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(cli.id)}
                          title="Borrar ficha"
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
              totalItems={filteredClientes.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* Selected Customer Interactions timeline & renting logs */}
        <div className="lg:col-span-5 text-slate-700">
          {selectedCliente ? (
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-6" id={`crm-detail-${selectedCliente.id}`}>
              <div className="flex justify-between items-start border-b border-slate-50 pb-4">
                <div>
                  <span className="text-xs text-blue-600 font-bold uppercase tracking-widest font-display">Información de Cliente</span>
                  <h3 className="text-xl font-extrabold text-slate-800 font-display">{selectedCliente.nombre} {selectedCliente.apellidos}</h3>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">ID Cliente: {selectedCliente.id}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEditClick(selectedCliente)}
                    title="Editar ficha"
                    className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition"
                  >
                    <PenTool className="w-4 h-4" />
                  </button>
                  <button
                  onClick={() => setSelectedCliente(null)}
                  title="Cerrar panel"
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                >
                  <X className="w-4 h-4" />
                </button>
                </div>
              </div>

              {/* Specs detailed contact cards */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs">
                  <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 mr-1 block text-[10px] uppercase font-bold">Documento de Identidad</span>
                    <span className="font-mono font-bold text-slate-700">{selectedCliente.nifNiePasaporte}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 mr-1 block text-[10px] uppercase font-bold">Correo Electrónico</span>
                    <a href={`mailto:${selectedCliente.correo}`} className="text-blue-600 hover:underline font-semibold">{selectedCliente.correo}</a>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-slate-400 mr-1 block text-[10px] uppercase font-bold">Móvil / WhatsApp</span>
                    <span className="font-semibold text-slate-700">{selectedCliente.telefono}</span>
                  </div>
                </div>

                {selectedCliente.direccion && (
                  <div className="flex items-center gap-3 text-xs">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-slate-400 mr-1 block text-[10px] uppercase font-bold">Domicilio de Facturación</span>
                      <span className="font-semibold text-slate-700">{selectedCliente.direccion}{selectedCliente.ciudad ? `, ${selectedCliente.ciudad}` : ''}</span>
                      {selectedCliente.pais && <span className="text-slate-500"> · {selectedCliente.pais}</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* Vehículos asociados */}
              {(selectedCliente.vehiculosAsociados ?? []).length > 0 && (
                <div className="pt-4 border-t border-slate-50">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Car className="w-4 h-4 text-blue-600" />
                    Vehículos Asociados
                  </h4>
                  <div className="space-y-1.5">
                    {(selectedCliente.vehiculosAsociados ?? []).map(vid => {
                      const v = vehiculos.find(vv => vv.id === vid);
                      if (!v) return null;
                      return (
                        <div key={vid} className="flex items-center gap-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                          <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-700">{v.marca} {v.modelo}</span>
                          <span className="font-mono text-slate-400 ml-auto">{v.matricula}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Interactions Timeline */}
              <div className="space-y-4 pt-4 border-t border-slate-50">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    Historial de Interacciones CRM
                  </h4>
                  <button
                    onClick={() => setIsAddingInteraction(!isAddingInteraction)}
                    className="p-1 px-2 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-bold hover:bg-blue-100 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Añadir Nota
                  </button>
                </div>

                {/* Interaction log input form */}
                {isAddingInteraction && (
                  <form onSubmit={handleAddInteractionSubmit} className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3" id="add-interaction-form">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-blue-800 uppercase">Registrar conversación</span>
                      <button 
                        type="button" 
                        onClick={() => setIsAddingInteraction(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-1">
                      {(['llamada', 'email', 'visita', 'whatsapp'] as const).map(tipo => (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => setNewInteractionTipo(tipo)}
                          className={`text-[9px] py-1 capitalize font-bold rounded border ${
                            newInteractionTipo === tipo ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'
                          }`}
                        >
                          {tipo}
                        </button>
                      ))}
                    </div>

                    <div>
                      <textarea
                        rows={2}
                        required
                        value={newInteractionNotes}
                        onChange={e => setNewInteractionNotes(e.target.value)}
                        placeholder="Detalles sobre lo tratado con el cliente..."
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white font-medium text-slate-700"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-bold hover:bg-blue-700 flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Guardar Interacción
                      </button>
                    </div>
                  </form>
                )}

                <div className="overflow-y-auto max-h-[220px] space-y-3 pr-1" id="crm-interactions-timeline">
                  {selectedCliente.interacciones.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">
                      No se han registrado interacciones con este cliente.
                    </div>
                  ) : (
                    selectedCliente.interacciones.map((int) => (
                      <div key={int.id} className="p-3 bg-slate-50 border-l border-slate-200 rounded-r-xl space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            int.tipo === 'registro_contrato' ? 'bg-slate-100 text-slate-600' :
                            int.tipo === 'whatsapp' ? 'bg-emerald-100 text-emerald-800' :
                            int.tipo === 'llamada' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {int.tipo.replace('_', ' ')}
                          </span>
                          <span className="text-slate-400 font-bold">{formatDate(int.fecha)}</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed font-semibold">{int.notas}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div className="bg-white p-12 rounded-2xl border border-slate-100 shadow-sm text-center flex flex-col items-center justify-center space-y-3 text-slate-400 h-full min-h-[400px]">
              <div className="p-4 bg-slate-50 rounded-full border border-slate-100">
                <Users className="w-10 h-10 text-slate-300" />
              </div>
              <h4 className="text-sm font-bold text-slate-700">Ficha de Cliente y CRM</h4>
              <p className="text-xs max-w-xs">
                Seleccione un cliente del directorio para visualizar sus datos de contacto completos e historial de llamadas o visitas anotadas.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: ADD CLIENT */}
      <AnimatePresence>
        {isAddingOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh]"
              id="add-client-modal"
            >
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2 font-display">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                  Alta de Ficha de Cliente
                </h3>
                <button 
                  onClick={() => setIsAddingOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="p-6 space-y-4 font-sans overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Nombre *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.nombre}
                      onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                      placeholder="e.g. Pilar"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Apellidos *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.apellidos}
                      onChange={e => setFormData({ ...formData, apellidos: e.target.value })}
                      placeholder="e.g. Ramos Ortiz"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">DNI/NIE/Pasaporte *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.nifNiePasaporte}
                      onChange={e => setFormData({ ...formData, nifNiePasaporte: e.target.value.toUpperCase() })}
                      placeholder="e.g. 12345678W o NIE"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Teléfono Móvil *</label>
                    <input
                      type="tel"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.telefono}
                      onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                      placeholder="e.g. +34 600 000 000"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Correo Electrónico</label>
                  <input
                    type="email"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.correo}
                    onChange={e => setFormData({ ...formData, correo: e.target.value })}
                    placeholder="e.g. pilar.ramos@gmail.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Domicilio Fiscal</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.direccion}
                    onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                    placeholder="Calle, número, piso, código postal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Ciudad</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.ciudad ?? ''}
                    onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                    placeholder="Madrid, Barcelona..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">País</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={formData.pais ?? 'España'}
                    onChange={e => setFormData({ ...formData, pais: e.target.value })}
                    placeholder="España, Francia..."
                  />
                </div>

                {/* Vehículos asociados */}
                {vehiculos.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vehículos asociados</label>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar por matrícula, marca o modelo..."
                        value={vehiculoSearch}
                        onChange={e => setVehiculoSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {vehiculos
                        .filter(v => !vehiculosAsignadosGlobal.has(v.id))
                        .filter(v => `${v.marca} ${v.modelo} ${v.matricula}`.toLowerCase().includes(vehiculoSearch.toLowerCase()))
                        .map(v => {
                          const checked = (formData.vehiculosAsociados ?? []).includes(v.id);
                          return (
                            <label key={v.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setFormData({ ...formData, vehiculosAsociados: toggleVehiculo(v.id, formData.vehiculosAsociados ?? []) })}
                                className="rounded"
                              />
                              <Car className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-blue-600' : 'text-slate-400'}`} />
                              <span className="text-xs font-semibold text-slate-700">{v.marca} {v.modelo}</span>
                              <span className="font-mono text-[10px] text-slate-400 ml-auto">{v.matricula}</span>
                            </label>
                          );
                        })}
                      {vehiculos.filter(v => !vehiculosAsignadosGlobal.has(v.id) && `${v.marca} ${v.modelo} ${v.matricula}`.toLowerCase().includes(vehiculoSearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">Sin resultados para «{vehiculoSearch}»</p>
                      )}
                    </div>
                  </div>
                )}

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
                    <Check className="w-4 h-4" /> Crear Ficha CRM
                  </button>
                </div>
              </form>
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        title="Borrar ficha de cliente"
        message="¿Está totalmente seguro de borrar esta ficha de cliente? Se eliminará su historial de interacciones del CRM."
        confirmLabel="Sí, borrar"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete({ isOpen: false, clienteId: '' })}
      />

      {/* MODAL: EDIT CLIENT */}
      <AnimatePresence>
        {isEditing && editFormData && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden max-h-[90vh]"
              id="edit-client-modal"
            >
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-extrabold text-slate-800 flex items-center gap-2 font-display">
                  <Save className="w-5 h-5 text-blue-600" />
                  Editar Información de Ficha
                </h3>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-1 hover:bg-slate-200 rounded-md transition text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="p-6 space-y-4 font-sans overflow-y-auto flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Nombre *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.nombre}
                      onChange={e => setEditFormData({ ...editFormData, nombre: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Apellidos *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.apellidos}
                      onChange={e => setEditFormData({ ...editFormData, apellidos: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">DNI/NIE/Pasaporte *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.nifNiePasaporte}
                      onChange={e => setEditFormData({ ...editFormData, nifNiePasaporte: e.target.value.toUpperCase() })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase">Teléfono Móvil *</label>
                    <input
                      type="text"
                      className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={editFormData.telefono}
                      onChange={e => setEditFormData({ ...editFormData, telefono: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Correo Electrónico</label>
                  <input
                    type="email"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editFormData.correo}
                    onChange={e => setEditFormData({ ...editFormData, correo: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Domicilio Fiscal</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editFormData.direccion}
                    onChange={e => setEditFormData({ ...editFormData, direccion: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">Ciudad</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editFormData.ciudad ?? ''}
                    onChange={e => setEditFormData({ ...editFormData, ciudad: e.target.value })}
                    placeholder="Madrid, Barcelona..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase">País</label>
                  <input
                    type="text"
                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editFormData.pais ?? 'España'}
                    onChange={e => setEditFormData({ ...editFormData, pais: e.target.value })}
                    placeholder="España, Francia..."
                  />
                </div>

                {vehiculos.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Vehículos asociados</label>
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar por matrícula, marca o modelo..."
                        value={vehiculoSearchEdit}
                        onChange={e => setVehiculoSearchEdit(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {vehiculos
                        .filter(v => {
                          const propioDelCliente = (editFormData.vehiculosAsociados ?? []).includes(v.id);
                          const asignadoAOtro = vehiculosAsignadosGlobal.has(v.id) && !propioDelCliente;
                          return !asignadoAOtro;
                        })
                        .filter(v => `${v.marca} ${v.modelo} ${v.matricula}`.toLowerCase().includes(vehiculoSearchEdit.toLowerCase()))
                        .map(v => {
                          const checked = (editFormData.vehiculosAsociados ?? []).includes(v.id);
                          return (
                            <label key={v.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition ${checked ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 hover:border-slate-200'}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => setEditFormData({ ...editFormData, vehiculosAsociados: toggleVehiculo(v.id, editFormData.vehiculosAsociados ?? []) })}
                                className="rounded"
                              />
                              <Car className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-blue-600' : 'text-slate-400'}`} />
                              <span className="text-xs font-semibold text-slate-700">{v.marca} {v.modelo}</span>
                              <span className="font-mono text-[10px] text-slate-400 ml-auto">{v.matricula}</span>
                            </label>
                          );
                        })}
                      {vehiculos.filter(v => {
                        const propio = (editFormData.vehiculosAsociados ?? []).includes(v.id);
                        return !(vehiculosAsignadosGlobal.has(v.id) && !propio) && `${v.marca} ${v.modelo} ${v.matricula}`.toLowerCase().includes(vehiculoSearchEdit.toLowerCase());
                      }).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">Sin resultados para «{vehiculoSearchEdit}»</p>
                      )}
                    </div>
                  </div>
                )}

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
                    <Save className="w-4 h-4" /> Guardar Ficha
                  </button>
                </div>
              </form>
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
