import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { contrastText } from './utils/color';
import { supabase } from './lib/supabase';
import { fetchPerfil, signOut } from './lib/auth';
import { listVehiculos, createVehiculo, updateVehiculo, deleteVehiculo, NuevoVehiculo } from './lib/data/vehiculos';
import { listClientes, createCliente, updateCliente, deleteCliente, addInteraccion, NuevoCliente } from './lib/data/clientes';
import { listOrdenes, createOrden, updateOrden, deleteOrden } from './lib/data/ordenes';
import { listAlertas, createAlerta, resolveAlerta } from './lib/data/alertas';
import { listNotificaciones, createNotificacion, deleteNotificacion } from './lib/data/notificaciones';
import { listFacturas, createFactura, updateFactura, deleteFactura } from './lib/data/facturas';
import { Vehiculo, Cliente, Alerta, NotificacionCliente, InteraccionCliente, AlertaTipo, Perfil, Factura, ModuloId, OrdenTrabajo } from './types';
import VehiclesTab from './components/VehiclesTab';
import OrdenesTrabajoTab from './components/OrdenesTrabajoTab';
import CrmTab from './components/CrmTab';
import AnalyticsTab from './components/AnalyticsTab';
import AlertsNotificationsTab from './components/AlertsNotificationsTab';
import FacturasTab from './components/FacturasTab';
import LoginScreen from './components/LoginScreen';
import AdminPanel from './components/AdminPanel';
import {
  Car, Wrench, Users, BarChart2, Bell, Shield, Phone, Mail, Globe, Menu, X, Settings, FileText, LogOut
} from 'lucide-react';
import CompanySettingsPanel from './components/CompanySettingsPanel';
import { EmpresaConfig, getEmpresaConfig, saveEmpresaConfig } from './data/mockData';

type TabId = ModuloId;

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<Perfil | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('vehiculos');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [empresaConfig, setEmpresaConfig] = useState<EmpresaConfig>(getEmpresaConfig);

  // States
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [notificaciones, setNotificaciones] = useState<NotificacionCliente[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);

  // Sesión con Supabase Auth: comprueba la sesión al montar y escucha cambios.
  useEffect(() => {
    let mounted = true;

    const aplicarSesion = async (userId: string | undefined) => {
      if (!userId) {
        if (mounted) setCurrentUser(null);
        return;
      }
      const perfil = await fetchPerfil(userId);
      if (!mounted) return;
      if (!perfil) {
        await signOut();
        setCurrentUser(null);
        return;
      }
      if (!perfil.activo) {
        await signOut();
        setCurrentUser(null);
        setAuthError('Tu cuenta está desactivada. Contacta con el administrador.');
        return;
      }
      setAuthError(null);
      setCurrentUser(perfil);
    };

    supabase.auth.getSession().then(({ data }) => {
      aplicarSesion(data.session?.user.id).finally(() => {
        if (mounted) setAuthChecked(true);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicarSesion(session?.user.id);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Datos desde Supabase.
  const recargarVehiculos = useCallback(async () => {
    setVehiculos(await listVehiculos());
  }, []);
  const recargarClientes = useCallback(async () => {
    setClientes(await listClientes());
  }, []);
  const recargarOrdenes = useCallback(async () => {
    setOrdenesTrabajo(await listOrdenes());
  }, []);
  const recargarAlertas = useCallback(async () => {
    setAlertas(await listAlertas());
  }, []);
  const recargarNotificaciones = useCallback(async () => {
    setNotificaciones(await listNotificaciones());
  }, []);
  const recargarFacturas = useCallback(async () => {
    setFacturas(await listFacturas());
  }, []);

  // Datos de Supabase: se cargan cuando hay sesión (la RLS requiere estar
  // autenticado). Al cerrar sesión se limpian.
  useEffect(() => {
    if (currentUser) {
      recargarVehiculos();
      recargarClientes();
      recargarOrdenes();
      recargarAlertas();
      recargarNotificaciones();
      recargarFacturas();
    } else {
      setVehiculos([]);
      setClientes([]);
      setOrdenesTrabajo([]);
      setAlertas([]);
      setNotificaciones([]);
      setFacturas([]);
    }
  }, [currentUser, recargarVehiculos, recargarClientes, recargarOrdenes, recargarAlertas, recargarNotificaciones, recargarFacturas]);

  // Set default tab based on user modules
  useEffect(() => {
    if (currentUser) {
      const mods = currentUser.modulos;
      if (mods.length > 0 && !mods.includes(activeTab as ModuloId)) {
        setActiveTab(mods[0]);
      }
    }
  }, [currentUser]);

  const handleLogout = useCallback(() => {
    // signOut dispara onAuthStateChange, que limpia currentUser.
    signOut();
  }, []);

  // Active modules computed from user
  const activeModulos = useMemo(() => currentUser?.modulos ?? [], [currentUser]);

  // Sync utilities
  const handleAddVehiculo = useCallback(async (input: NuevoVehiculo) => {
    const creado = await createVehiculo(input);
    await recargarVehiculos();

    // Alerta de ITV automática al dar de alta el vehículo.
    if (creado.itvVencimiento) {
      await createAlerta({
        vehiculoId: creado.id,
        tipo: 'itv',
        descripcion: `Inspección Técnica obligatoria (ITV) programada para el vencimiento: ${creado.itvVencimiento}.`,
        estado: 'pendiente',
        fechaLimite: creado.itvVencimiento,
      });
      await recargarAlertas();
    }
  }, [recargarVehiculos, recargarAlertas]);

  const handleUpdateVehiculo = useCallback(async (editado: Vehiculo) => {
    await updateVehiculo(editado);
    await recargarVehiculos();
  }, [recargarVehiculos]);

  const handleDeleteVehiculo = useCallback(async (id: string) => {
    await deleteVehiculo(id);
    await recargarVehiculos();
  }, [recargarVehiculos]);

  const handleAddCliente = useCallback(async (input: NuevoCliente) => {
    const creado = await createCliente(input);
    await recargarClientes();
    return creado;
  }, [recargarClientes]);

  const handleUpdateCliente = useCallback(async (editado: Cliente) => {
    const actualizado = await updateCliente(editado);
    await recargarClientes();
    return actualizado;
  }, [recargarClientes]);

  const handleDeleteCliente = useCallback(async (id: string) => {
    await deleteCliente(id);
    await recargarClientes();
  }, [recargarClientes]);

  const handleAddInteraccion = useCallback(async (cliId: string, input: { tipo: InteraccionCliente['tipo']; notas: string }) => {
    const creada = await addInteraccion(cliId, input);
    await recargarClientes();
    return creada;
  }, [recargarClientes]);

  const handleResolveAlerta = useCallback(async (id: string) => {
    await resolveAlerta(id);
    await recargarAlertas();
  }, [recargarAlertas]);

  const handleAddNotificacion = useCallback(async (notif: NotificacionCliente) => {
    await createNotificacion(notif);
    await recargarNotificaciones();

    // La interacción asociada se registra también en el cliente.
    await addInteraccion(notif.clienteId, {
      tipo: notif.tipoEnvio === 'whatsapp' ? 'whatsapp' : notif.tipoEnvio === 'email' ? 'email' : 'llamada',
      notas: `Notificación enviada por [${notif.tipoEnvio.toUpperCase()}]: "${notif.mensaje.slice(0, 85)}..."`,
    });
    await recargarClientes();
  }, [recargarNotificaciones, recargarClientes]);

  const handleDeleteNotificacion = useCallback(async (id: string) => {
    await deleteNotificacion(id);
    await recargarNotificaciones();
  }, [recargarNotificaciones]);

  const handleTriggerAutoRenew = useCallback(async (vehId: string, tipo: AlertaTipo, nuevaFechaOrKm: string) => {
    const veh = vehiculos.find(v => v.id === vehId);
    if (!veh) return;
    let updatedVeh = { ...veh };
    if (tipo === 'itv') updatedVeh.itvVencimiento = nuevaFechaOrKm;
    else if (tipo === 'seguro') updatedVeh.seguroVencimiento = nuevaFechaOrKm;
    else if (tipo === 'impuesto') updatedVeh.impuestoVencimiento = nuevaFechaOrKm;
    else if (tipo === 'mantenimiento') {
      updatedVeh.kilometraje = Math.max(veh.kilometraje, Number(nuevaFechaOrKm) - 15000);
    }
    await handleUpdateVehiculo(updatedVeh);
  }, [vehiculos, handleUpdateVehiculo]);

  // Factura handlers (Supabase)
  const handleAddFactura = useCallback(async (f: Factura) => {
    await createFactura(f);
    await recargarFacturas();
  }, [recargarFacturas]);

  const handleUpdateFactura = useCallback(async (f: Factura) => {
    await updateFactura(f);
    await recargarFacturas();
  }, [recargarFacturas]);

  const handleDeleteFactura = useCallback(async (id: string) => {
    await deleteFactura(id);
    await recargarFacturas();
  }, [recargarFacturas]);

  // OT handlers (Supabase)
  const handleAddOT = useCallback(async (ot: OrdenTrabajo) => {
    await createOrden(ot);
    await recargarOrdenes();
  }, [recargarOrdenes]);

  const handleUpdateOT = useCallback(async (ot: OrdenTrabajo) => {
    await updateOrden(ot);
    await recargarOrdenes();
  }, [recargarOrdenes]);

  const handleDeleteOT = useCallback(async (id: string) => {
    await deleteOrden(id);
    await recargarOrdenes();
  }, [recargarOrdenes]);

  const handleSaveEmpresa = useCallback((config: EmpresaConfig) => {
    setEmpresaConfig(config);
    saveEmpresaConfig(config);
  }, []);

  const activeAlertsCount = useMemo(() => alertas.filter(a => a.estado === 'activa').length, [alertas]);

  const brandColor = empresaConfig.brandColor;
  const brandText = contrastText(brandColor);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-color', brandColor);
    root.style.setProperty('--brand-text-color', brandText);
  }, [brandColor, brandText]);

  // Wait until auth is checked
  if (!authChecked) return null;

  // Show login if no user
  if (!currentUser) {
    return <LoginScreen authError={authError} />;
  }

  const tabDefs: { id: ModuloId; label: string; icon: React.ReactNode; emoji: string }[] = (
    [
      { id: 'vehiculos' as ModuloId, label: 'Vehículos', icon: <Car className="w-4 h-4" />, emoji: '🚗' },
      { id: 'clientes' as ModuloId, label: 'Clientes', icon: <Users className="w-4 h-4" />, emoji: '👥' },
      { id: 'taller' as ModuloId, label: 'Taller', icon: <Wrench className="w-4 h-4" />, emoji: '🔧' },
      { id: 'alertas' as ModuloId, label: 'Alertas', icon: <Bell className="w-4 h-4" />, emoji: '🔔' },
      { id: 'rentabilidad' as ModuloId, label: 'Rentabilidad', icon: <BarChart2 className="w-4 h-4" />, emoji: '📈' },
      { id: 'facturas' as ModuloId, label: 'Facturas', icon: <FileText className="w-4 h-4" />, emoji: '🧾' },
    ] as { id: ModuloId; label: string; icon: React.ReactNode; emoji: string }[]
  ).filter(t => activeModulos.includes(t.id));

  return (
    <div
      className="min-h-screen bg-slate-50 font-sans flex flex-col antialiased"
      style={{ '--brand': brandColor, '--brand-text': brandText } as React.CSSProperties}
    >

      {/* PROFESSIONAL UPPER BAR */}
      <header
        className="shadow-md print:hidden shrink-0"
        style={{
          backgroundColor: brandColor,
          backgroundImage: `
            radial-gradient(ellipse at 20% 50%, ${brandText === '#ffffff' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} 0%, transparent 60%),
            radial-gradient(ellipse at 80% 20%, ${brandText === '#ffffff' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'} 0%, transparent 50%),
            repeating-linear-gradient(
              -45deg,
              transparent,
              transparent 6px,
              ${brandText === '#ffffff' ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'} 6px,
              ${brandText === '#ffffff' ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)'} 7px
            )
          `,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black tracking-tighter text-lg shadow-md shrink-0 overflow-hidden"
              style={{ backgroundColor: `${brandColor}33`, color: brandText }}
            >
              {empresaConfig.logoBase64 ? (
                <img src={empresaConfig.logoBase64} alt="logo" className="w-full h-full object-contain" />
              ) : (
                empresaConfig.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'E'
              )}
            </div>
            <div>
              <h1 className="text-md sm:text-lg font-display font-bold tracking-tight flex items-center gap-2" style={{ color: brandText }}>
                {empresaConfig.nombre}
                <span
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-widest"
                  style={{ backgroundColor: `${brandText === '#ffffff' ? '#ffffff' : '#000000'}22`, color: brandText, border: `1px solid ${brandText}44` }}
                >
                  FLOTAS Y CRM
                </span>
              </h1>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `${brandText}99` }}>{empresaConfig.tagline}</p>
            </div>
          </div>

          {/* Contact info + user/logout */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs p-2.5 px-4 rounded-xl font-medium"
              style={{ backgroundColor: `${brandText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: brandText }}
            >
              {empresaConfig.correo && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" style={{ color: brandText }} />
                  <span>{empresaConfig.correo}</span>
                </div>
              )}
              {empresaConfig.telefono && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" style={{ color: brandText }} />
                  <span>{empresaConfig.telefono}</span>
                </div>
              )}
              {empresaConfig.web && (
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" style={{ color: brandText }} />
                  <span>{empresaConfig.web}</span>
                </div>
              )}
            </div>

            {/* User pill + logout */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ backgroundColor: `${brandText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: brandText }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{ backgroundColor: brandText, color: brandColor }}
                >
                  {currentUser.nombre[0].toUpperCase()}
                </div>
                <span className="text-xs font-semibold hidden sm:block">{currentUser.nombre}</span>
                {currentUser.rol === 'admin' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${brandText}22`, color: brandText }}>ADMIN</span>
                )}
              </div>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="p-2 rounded-xl transition cursor-pointer"
                style={{ backgroundColor: `${brandText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: brandText }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* NAVIGATION TABS SUBBAR */}
      <nav className="bg-white border-b border-slate-200/80 shadow-3xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">

            {/* Nav Links Desktop */}
            <div className="hidden md:flex space-x-1 py-1.5 overflow-x-auto w-full">
              {tabDefs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition duration-150 flex items-center gap-1.5 cursor-pointer relative shrink-0 ${
                    activeTab === tab.id ? 'bg-blue-50 text-blue-700 border border-blue-200/40 shadow-3xs' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.icon} {tab.label}
                  {tab.id === 'alertas' && activeAlertsCount > 0 && (
                    <span className="absolute top-1 right-2 px-1.5 py-0.5 text-[8px] bg-rose-500 text-white font-extrabold rounded-full leading-none animate-pulse">
                      {activeAlertsCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Mobile menu triggers */}
            <div className="flex md:hidden items-center justify-between w-full">
              <span className="text-xs font-bold text-slate-700 capitalize">
                Módulo: <span className="text-blue-700 font-extrabold">{activeTab.replace('_', ' ')}</span>
              </span>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 hover:bg-slate-50 text-slate-600 rounded-lg"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>

            {/* Actions right */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {currentUser.rol === 'admin' && (
                <button
                  onClick={() => setAdminPanelOpen(true)}
                  title="Panel de administración"
                  className="p-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer border border-blue-200"
                >
                  <Shield className="w-3.5 h-3.5" /> Admin
                </button>
              )}
              <button
                onClick={() => setSettingsOpen(true)}
                title="Configuración de empresa"
                className="p-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-800 rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer border border-slate-200"
              >
                <Settings className="w-3.5 h-3.5" /> Empresa
              </button>
            </div>

          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-2 space-y-1 block shrink-0">
            {tabDefs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-slate-700 block hover:bg-slate-50 flex justify-between"
              >
                <span>{tab.emoji} {tab.label}</span>
                {tab.id === 'alertas' && activeAlertsCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-500 text-white font-bold text-[9px] rounded-full">{activeAlertsCount}</span>
                )}
              </button>
            ))}
            <div className="pt-2 border-t border-slate-100 space-y-1">
              {currentUser.rol === 'admin' && (
                <button onClick={() => { setAdminPanelOpen(true); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-blue-700 block hover:bg-blue-50">
                  🛡️ Panel de Administración
                </button>
              )}
              <button onClick={() => { setSettingsOpen(true); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-slate-700 block hover:bg-slate-50">
                ⚙️ Configuración de empresa
              </button>
              <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs font-bold rounded-lg text-slate-600 block hover:bg-slate-50">
                🚪 Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* CORE WORKSPACE */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto">
        {activeTab === 'vehiculos' && (
          <VehiclesTab
            vehiculos={vehiculos}
            ordenesTrabajo={ordenesTrabajo}
            onAddVehiculo={handleAddVehiculo}
            onUpdateVehiculo={handleUpdateVehiculo}
            onDeleteVehiculo={handleDeleteVehiculo}
          />
        )}

        {activeTab === 'taller' && (
          <OrdenesTrabajoTab
            ordenes={ordenesTrabajo}
            vehiculos={vehiculos}
            clientes={clientes}
            onAdd={handleAddOT}
            onUpdate={handleUpdateOT}
            onDelete={handleDeleteOT}
          />
        )}

        {activeTab === 'clientes' && (
          <CrmTab
            clientes={clientes}
            vehiculos={vehiculos}
            ordenesTrabajo={ordenesTrabajo}
            onAddCliente={handleAddCliente}
            onUpdateCliente={handleUpdateCliente}
            onDeleteCliente={handleDeleteCliente}
            onAddInteraccion={handleAddInteraccion}
          />
        )}

        {activeTab === 'rentabilidad' && (
          <AnalyticsTab
            ordenesTrabajo={ordenesTrabajo}
            clientes={clientes}
          />
        )}

        {activeTab === 'alertas' && (
          <AlertsNotificationsTab
            alertas={alertas}
            notificaciones={notificaciones}
            clientes={clientes}
            vehiculos={vehiculos}
            onAddNotificacion={handleAddNotificacion}
            onResolveAlerta={handleResolveAlerta}
            onDeleteNotificacion={handleDeleteNotificacion}
            onTriggerAutoRenew={handleTriggerAutoRenew}
          />
        )}

        {activeTab === 'facturas' && (
          <FacturasTab
            facturas={facturas}
            clientes={clientes}
            vehiculos={vehiculos}
            ordenesTrabajo={ordenesTrabajo}
            onAddFactura={handleAddFactura}
            onUpdateFactura={handleUpdateFactura}
            onDeleteFactura={handleDeleteFactura}
          />
        )}
      </main>

      {settingsOpen && (
        <CompanySettingsPanel
          config={empresaConfig}
          onSave={handleSaveEmpresa}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {adminPanelOpen && (
        <AdminPanel
          currentUser={currentUser}
          onClose={() => setAdminPanelOpen(false)}
        />
      )}

      {/* FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-800 text-center py-4 text-xs text-slate-500 print:hidden shrink-0 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <p>© 2026 inGenio Datos y Comunicaciones. Reservados todos los derechos. Entorno Privado de Backoffice.</p>
        </div>
      </footer>
    </div>
  );
}
