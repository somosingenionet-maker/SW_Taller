import { useMemo } from 'react';
import { Cita, Cliente, Vehiculo, OrdenTrabajo, Alerta, Factura, Perfil, ModuloId } from '../types';
import {
  CalendarClock, Wrench, Bell, Euro, AlertTriangle, Users, Car, ArrowRight, ClipboardList,
} from 'lucide-react';

interface Props {
  currentUser: Perfil;
  citas: Cita[];
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  ordenesTrabajo: OrdenTrabajo[];
  alertas: Alerta[];
  facturas: Factura[];
  modulos: ModuloId[];
  brandColor: string;
  onNavigate: (tab: ModuloId) => void;
}

const fmtMoney = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

const OT_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto', recibido: 'Recibido', en_reparacion: 'En reparación',
  listo: 'Listo para entregar', entregado: 'Entregado', cancelado: 'Cancelado',
};

export default function HomeTab({
  currentUser, citas, clientes, vehiculos, ordenesTrabajo, alertas, facturas, modulos, brandColor, onNavigate,
}: Props) {
  const puede = (m: ModuloId) => modulos.includes(m);

  const hoyStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fechaLarga = useMemo(() => {
    const s = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }, []);

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const vehiculoPorId = useMemo(() => new Map(vehiculos.map(v => [v.id, v])), [vehiculos]);

  const citasHoy = useMemo(
    () => citas
      .filter(c => (c.estado === 'pendiente' || c.estado === 'confirmada') && c.fechaHora.slice(0, 10) === hoyStr)
      .sort((a, b) => a.fechaHora.localeCompare(b.fechaHora)),
    [citas, hoyStr]
  );
  const ahoraIso = new Date().toISOString();
  const proximaCita = citasHoy.find(c => c.fechaHora >= ahoraIso) ?? citasHoy[0];

  const otsEnCurso = useMemo(
    () => ordenesTrabajo
      .filter(o => o.estado === 'recibido' || o.estado === 'en_reparacion')
      .sort((a, b) => a.fechaRecepcion.localeCompare(b.fechaRecepcion)),
    [ordenesTrabajo]
  );
  const otsListas = useMemo(() => ordenesTrabajo.filter(o => o.estado === 'listo'), [ordenesTrabajo]);

  const alertasPendientes = useMemo(() => alertas.filter(a => a.estado !== 'atendida'), [alertas]);
  const alertasVencidas = useMemo(
    () => alertasPendientes.filter(a => a.fechaLimite && a.fechaLimite < hoyStr),
    [alertasPendientes, hoyStr]
  );

  const mesActual = hoyStr.slice(0, 7);
  const facturasDelMes = useMemo(
    () => facturas.filter(f => (f.estado === 'emitida' || f.estado === 'pagada') && f.fecha.slice(0, 7) === mesActual),
    [facturas, mesActual]
  );
  const totalFacturadoMes = facturasDelMes.reduce((s, f) => s + f.total, 0);

  const facturasVencidas = useMemo(() => facturas.filter(f => f.estado === 'vencida'), [facturas]);
  const totalVencido = facturasVencidas.reduce((s, f) => s + f.total, 0);

  const brandSoft = `${brandColor}17`;

  const showAgenda = puede('citas');
  const showTaller = puede('taller');
  const showKpis = puede('citas') || puede('taller') || puede('alertas') || puede('facturas');

  return (
    <div className="pb-6">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {saludo()}, {currentUser.nombre.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-slate-500">{fechaLarga}</p>
        </div>
      </div>

      {puede('facturas') && facturasVencidas.length > 0 && (
        <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-4 py-3 mb-5 text-sm font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Tienes {facturasVencidas.length} factura{facturasVencidas.length !== 1 ? 's' : ''} vencida
            {facturasVencidas.length !== 1 ? 's' : ''} sin cobrar ({fmtMoney(totalVencido)} €)
          </span>
          <button onClick={() => onNavigate('facturas')} className="ml-auto font-extrabold underline underline-offset-2 whitespace-nowrap cursor-pointer">
            Ver facturas →
          </button>
        </div>
      )}

      {showKpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-5">
          {puede('citas') && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Citas de hoy</span>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-blue-50 text-blue-600">
                  <CalendarClock className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900">{citasHoy.length}</div>
              <p className="text-xs text-slate-500">
                {proximaCita
                  ? <>Próxima a las <b className="text-slate-700">{new Date(proximaCita.fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</b></>
                  : 'Sin citas programadas'}
              </p>
            </div>
          )}
          {puede('taller') && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">En el taller ahora</span>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-amber-50 text-amber-600">
                  <Wrench className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900">{otsEnCurso.length}</div>
              <p className="text-xs text-slate-500">
                {otsListas.length > 0 ? <><b className="text-slate-700">{otsListas.length}</b> listo{otsListas.length !== 1 ? 's' : ''} para entregar</> : 'Ninguno listo todavía'}
              </p>
            </div>
          )}
          {puede('alertas') && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Alertas pendientes</span>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-rose-50 text-rose-600">
                  <Bell className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900">{alertasPendientes.length}</div>
              <p className="text-xs text-slate-500">
                {alertasVencidas.length > 0 ? <><b className="text-slate-700">{alertasVencidas.length}</b> ya vencida{alertasVencidas.length !== 1 ? 's' : ''}</> : 'Todo al día'}
              </p>
            </div>
          )}
          {puede('facturas') && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Facturado este mes</span>
                <span className="w-6 h-6 rounded-lg flex items-center justify-center bg-green-50 text-green-600">
                  <Euro className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="text-2xl font-black text-slate-900">{fmtMoney(totalFacturadoMes)} €</div>
              <p className="text-xs text-slate-500">
                <b className="text-slate-700">{facturasDelMes.length}</b> factura{facturasDelMes.length !== 1 ? 's' : ''} emitida{facturasDelMes.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {(showAgenda || showTaller) && (
        <div className={`grid grid-cols-1 ${showAgenda && showTaller ? 'lg:grid-cols-2' : ''} gap-3.5 mb-6`}>
          {showAgenda && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
                <h2 className="text-sm font-extrabold text-slate-800">Agenda de hoy</h2>
                <button onClick={() => onNavigate('citas')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer">
                  Ver agenda <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="px-2.5 pb-2.5">
                {citasHoy.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-6">No hay citas programadas para hoy.</p>
                )}
                {citasHoy.map(c => {
                  const cliente = c.clienteId ? clientePorId.get(c.clienteId) : undefined;
                  const nombre = cliente ? `${cliente.nombre} ${cliente.apellidos}` : (c.contactoNombre || 'Sin nombre');
                  return (
                    <div key={c.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50">
                      <div className="w-14 shrink-0 text-center text-xs font-extrabold rounded-lg py-1.5" style={{ backgroundColor: brandSoft, color: brandColor }}>
                        {new Date(c.fechaHora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{nombre}{c.vehiculoDescripcion ? ` — ${c.vehiculoDescripcion}` : ''}</p>
                        <p className="text-[11px] text-slate-500 truncate">{c.motivo}</p>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${c.estado === 'confirmada' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {c.estado === 'confirmada' ? 'Confirmada' : 'Pendiente'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showTaller && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
                <h2 className="text-sm font-extrabold text-slate-800">En el taller ahora</h2>
                <button onClick={() => onNavigate('taller')} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer">
                  Ver taller <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="px-2.5 pb-2.5">
                {otsEnCurso.length === 0 && (
                  <p className="text-center text-xs text-slate-400 py-6">No hay vehículos en el taller ahora mismo.</p>
                )}
                {otsEnCurso.map(o => {
                  const v = vehiculoPorId.get(o.vehiculoId);
                  const dias = Math.floor((Date.now() - new Date(o.fechaRecepcion).getTime()) / 86400000);
                  const diasTxt = dias <= 0 ? 'hoy' : `hace ${dias} día${dias !== 1 ? 's' : ''}`;
                  return (
                    <div key={o.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-50">
                      <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                        <Car className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{v ? `${v.marca} ${v.modelo} · ${v.matricula}` : o.numero}</p>
                        <p className="text-[11px] text-slate-400">Recibido {diasTxt}</p>
                      </div>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${o.estado === 'en_reparacion' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                        {OT_LABEL[o.estado]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Acciones rápidas</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {puede('citas') && (
          <button onClick={() => onNavigate('citas')} className="flex flex-col items-start gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm hover:border-slate-300 hover:shadow-md transition text-left cursor-pointer">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandSoft, color: brandColor }}>
              <CalendarClock className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-800">Nueva cita</span>
          </button>
        )}
        {puede('taller') && (
          <button onClick={() => onNavigate('taller')} className="flex flex-col items-start gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm hover:border-slate-300 hover:shadow-md transition text-left cursor-pointer">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandSoft, color: brandColor }}>
              <ClipboardList className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-800">Nueva orden de trabajo</span>
          </button>
        )}
        {puede('clientes') && (
          <button onClick={() => onNavigate('clientes')} className="flex flex-col items-start gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm hover:border-slate-300 hover:shadow-md transition text-left cursor-pointer">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandSoft, color: brandColor }}>
              <Users className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-800">Nuevo cliente</span>
          </button>
        )}
        {puede('vehiculos') && (
          <button onClick={() => onNavigate('vehiculos')} className="flex flex-col items-start gap-2 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 shadow-sm hover:border-slate-300 hover:shadow-md transition text-left cursor-pointer">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: brandSoft, color: brandColor }}>
              <Car className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold text-slate-800">Nuevo vehículo</span>
          </button>
        )}
      </div>
    </div>
  );
}
