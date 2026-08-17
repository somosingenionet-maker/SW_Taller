import { useState } from 'react';
import { Alerta, NotificacionCliente, Cliente, Vehiculo, AlertaTipo } from '../types';
import {
  Check, MessageSquare, AlertTriangle, Send, Mail, Phone, Calendar, RefreshCw, CheckCircle2, Clock
} from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { formatDate } from '../utils/dateFormat';

interface AlertsNotificationsTabProps {
  alertas: Alerta[];
  notificaciones: NotificacionCliente[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  onForzarRecordatorio: (alertaId: string) => Promise<void>;
  onRenovarMantenimiento: (alertaId: string, nuevoKilometrajeLimite: number) => void;
  onDeleteNotificacion: (id: string) => void;
  onTriggerAutoRenew: (vehiculoId: string, tipo: Exclude<AlertaTipo, 'mantenimiento'>, nuevaFecha: string) => void;
}

// Mismas ventanas que usa la Edge Function enviar-recordatorios — solo para
// mostrar el estado aquí; el filtrado real de qué se envía vive en el servidor.
const DIAS_AVISO_VENCIMIENTO = 14;
const KM_AVISO_MANTENIMIENTO = 500;

function estaDentroDeVentana(alerta: Alerta, vehiculo?: Vehiculo): boolean {
  if (alerta.tipo === 'mantenimiento') {
    if (alerta.kilometrajeLimite == null || !vehiculo) return false;
    return alerta.kilometrajeLimite - vehiculo.kilometraje <= KM_AVISO_MANTENIMIENTO;
  }
  if (!alerta.fechaLimite) return false;
  const limite = new Date();
  limite.setDate(limite.getDate() + DIAS_AVISO_VENCIMIENTO);
  return new Date(alerta.fechaLimite) <= limite;
}

export default function AlertsNotificationsTab({
  alertas,
  notificaciones,
  clientes,
  vehiculos,
  onForzarRecordatorio,
  onRenovarMantenimiento,
  onDeleteNotificacion,
  onTriggerAutoRenew
}: AlertsNotificationsTabProps) {
  const [selectedTipoFilter, setSelectedTipoFilter] = useState<string>('all');
  const [confirmAlerta, setConfirmAlerta] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [forzandoId, setForzandoId] = useState<string | null>(null);
  const [forzarError, setForzarError] = useState<{ id: string; mensaje: string } | null>(null);

  const handleResolveAlertClick = (alerta: Alerta) => {
    const today = new Date();
    let title = '';
    let message = '';
    let onConfirm = () => {};

    if (alerta.tipo === 'itv') {
      const nuevaFecha = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];
      title = 'Confirmar ITV realizada';
      message = `La fecha de vencimiento técnico de la ITV se actualizará a ${nuevaFecha} (+1 año) y se cerrará esta alerta.`;
      onConfirm = () => { onTriggerAutoRenew(alerta.vehiculoId, 'itv', nuevaFecha); };
    } else if (alerta.tipo === 'seguro') {
      const nuevaFecha = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];
      title = 'Confirmar renovación de seguro';
      message = `El vencimiento de la póliza de seguro se actualizará a ${nuevaFecha} (+1 año) y se cerrará esta alerta.`;
      onConfirm = () => { onTriggerAutoRenew(alerta.vehiculoId, 'seguro', nuevaFecha); };
    } else if (alerta.tipo === 'impuesto') {
      const nuevaFecha = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];
      title = 'Confirmar pago de impuesto de circulación';
      message = `La fecha del impuesto de circulación se actualizará a ${nuevaFecha} (+1 año) y se cerrará esta alerta.`;
      onConfirm = () => { onTriggerAutoRenew(alerta.vehiculoId, 'impuesto', nuevaFecha); };
    } else if (alerta.tipo === 'mantenimiento') {
      const targetVeh = vehiculos.find(v => v.id === alerta.vehiculoId);
      const nextMaintKm = (targetVeh ? targetVeh.kilometraje : 0) + 15000;
      title = 'Confirmar mantenimiento realizado';
      message = `La alerta de kilometraje se pospondrá 15.000 km (próxima revisión recomendada: ${nextMaintKm.toLocaleString()} km).`;
      onConfirm = () => { onRenovarMantenimiento(alerta.id, nextMaintKm); };
    }

    setConfirmAlerta({ isOpen: true, title, message, onConfirm });
  };

  const handleForzarClick = async (alerta: Alerta) => {
    setForzarError(null);
    setForzandoId(alerta.id);
    try {
      await onForzarRecordatorio(alerta.id);
    } catch (err) {
      setForzarError({ id: alerta.id, mensaje: err instanceof Error ? err.message : 'No se pudo enviar el recordatorio.' });
    } finally {
      setForzandoId(null);
    }
  };

  // Filter alerts
  const filteredAlertas = alertas.filter(al => {
    if (selectedTipoFilter === 'all') return true;
    return al.tipo === selectedTipoFilter;
  });

  const activas = alertas.filter(al => al.estado !== 'atendida');
  const totalEnviados = activas.filter(al => al.recordatorioEnviadoEn).length;
  const totalPendientes = activas.length - totalEnviados;

  return (
    <div className="space-y-6 text-slate-700" id="alerts-notifications-tab-root">

      {/* Resumen del monitor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Alertas activas</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{activas.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recordatorio enviado</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{totalEnviados}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recordatorio pendiente</p>
          <p className={`text-2xl font-bold mt-1 ${totalPendientes > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{totalPendientes}</p>
        </div>
      </div>

      {/* Monitor de alertas y recordatorios */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Alertas Preventivas del Sistema de Flotas
          </h2>
          <p className="text-xs text-slate-400">Monitor de recordatorios automáticos de ITV, seguros, impuesto y mantenimiento</p>
        </div>

        {/* Quick tab alerts selector */}
        <div className="flex gap-2 p-1 border-slate-100 border text-xs bg-slate-50/40 rounded-lg w-full sm:w-fit">
          {['all', 'itv', 'seguro', 'impuesto', 'mantenimiento'].map(tipo => (
            <button
              key={tipo}
              onClick={() => setSelectedTipoFilter(tipo)}
              className={`flex-1 py-1 px-2.5 font-bold capitalize text-[10px] rounded transition-all cursor-pointer ${
                selectedTipoFilter === tipo ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tipo === 'all' ? 'Ver Todas' : tipo}
            </button>
          ))}
        </div>

        <div className="space-y-3.5 max-h-[560px] overflow-y-auto pr-1" id="active-alerts-scroller">
          {filteredAlertas.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 text-xs">
              <Check className="w-6 h-6 text-blue-500 mx-auto mb-2" />
              No se registran alertas preventivas activas en este momento.
            </div>
          ) : (
            filteredAlertas.map(al => {
              const veh = vehiculos.find(v => v.id === al.vehiculoId);
              const dentroDeVentana = estaDentroDeVentana(al, veh);
              return (
                <div
                  key={al.id}
                  id={`alert-card-${al.id}`}
                  className={`p-4 rounded-xl border transition-colors ${
                    al.estado === 'activa'
                      ? 'border-rose-200 bg-rose-50/40'
                      : al.estado === 'pendiente'
                      ? 'border-amber-200 bg-amber-50/30'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                          al.tipo === 'itv' ? 'bg-amber-100 text-amber-800' :
                          al.tipo === 'seguro' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {al.tipo}
                        </span>
                        {veh && (
                          <strong className="text-xs text-slate-800 font-bold">{veh.marca} ({veh.matricula})</strong>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{al.descripcion}</p>
                      {al.fechaLimite && (
                        <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" /> Vencimiento: {formatDate(al.fechaLimite)}
                        </div>
                      )}
                    </div>

                    {al.estado !== 'atendida' ? (
                      <button
                        onClick={() => handleResolveAlertClick(al)}
                        id={`btn-resolve-alert-${al.id}`}
                        className="w-full sm:w-auto px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold transition duration-150 self-end sm:self-center cursor-pointer flex items-center gap-1 shrink-0 font-sans"
                      >
                        <Check className="w-3.5 h-3.5" /> Atender Alerta
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">✓ Atendida</span>
                    )}
                  </div>

                  {al.estado !== 'atendida' && (
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200/60">
                      {al.recordatorioEnviadoEn ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Recordatorio enviado el {formatDate(al.recordatorioEnviadoEn)}
                        </span>
                      ) : dentroDeVentana ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Pendiente de envío automático
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" /> Aún no le toca
                        </span>
                      )}
                      <button
                        onClick={() => handleForzarClick(al)}
                        disabled={forzandoId === al.id}
                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50 cursor-pointer"
                      >
                        {forzandoId === al.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Enviar ahora
                      </button>
                    </div>
                  )}
                  {forzarError?.id === al.id && (
                    <p className="text-[10px] text-rose-600 mt-1.5">{forzarError.mensaje}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Dispatched history logs */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 font-display">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            Bandeja de Salida (Registro de Comunicaciones Despachadas)
          </h3>
          <p className="text-[11px] text-slate-400">Mensajes enviados a los titulares para recordatorios ITV/mantenimientos</p>
        </div>

        <div className="space-y-2 max-h-[220px] overflow-y-auto">
          {notificaciones.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">Ninguna notificación despachada registrada.</div>
          ) : (
            [...notificaciones].reverse().map(not => {
              const cli = clientes.find(c => c.id === not.clienteId);
              return (
                <div key={not.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 hover:bg-slate-100/50 transition">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span className="flex items-center gap-1">
                      {not.tipoEnvio === 'email' ? <Mail className="w-3 h-3 text-blue-500" /> : not.tipoEnvio === 'whatsapp' ? <MessageSquare className="w-3 h-3 text-emerald-500" /> : <Phone className="w-3 h-3 text-amber-500" />}
                      {cli ? `${cli.nombre} ${cli.apellidos}` : 'Cliente desconocido'} ({not.tipoEnvio.toUpperCase()})
                      {not.origen === 'automatico' && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-extrabold uppercase">Automático</span>
                      )}
                    </span>
                    <span>{formatDate(not.fechaEnvio)}</span>
                  </div>
                  {not.asunto && <strong className="text-slate-800 text-xs block font-bold">{not.asunto}</strong>}
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold whitespace-pre-line">{not.mensaje}</p>

                  <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1">
                    <span>Filtro evento: {not.tipoEvento.replace('_', ' ')}</span>
                    <button
                      onClick={() => onDeleteNotificacion(not.id)}
                      className="text-slate-400 hover:text-rose-600 text-[10px] shrink-0"
                    >
                      Eliminar Registro
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmAlerta.isOpen}
        title={confirmAlerta.title}
        message={confirmAlerta.message}
        confirmLabel="Sí, confirmar"
        variant="info"
        onConfirm={() => { confirmAlerta.onConfirm(); setConfirmAlerta(prev => ({ ...prev, isOpen: false })); }}
        onCancel={() => setConfirmAlerta(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
