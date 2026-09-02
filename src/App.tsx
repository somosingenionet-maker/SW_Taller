import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { contrastText } from './utils/color';
import { supabase } from './lib/supabase';
import { fetchPerfil, signOut } from './lib/auth';
import { listVehiculos, createVehiculo, updateVehiculo, deleteVehiculo, NuevoVehiculo } from './lib/data/vehiculos';
import { listClientes, createCliente, updateCliente, deleteCliente, addInteraccion, NuevoCliente } from './lib/data/clientes';
import { listOrdenes, createOrden, updateOrden, deleteOrden } from './lib/data/ordenes';
import { listAlertas, renovarAlertaMantenimiento, forzarRecordatorio } from './lib/data/alertas';
import { listNotificaciones, deleteNotificacion } from './lib/data/notificaciones';
import { listFacturas, createFactura, updateFactura, deleteFactura, emitirFactura, cambiarEstadoFactura } from './lib/data/facturas';
import { listProductos, createProducto, updateProducto, deleteProducto, registrarMovimiento, NuevoMovimiento } from './lib/data/productos';
import { listCitas, createCita, updateCita, deleteCita } from './lib/data/citas';
import { getEmpresa, updateEmpresa } from './lib/data/empresa';
import { Vehiculo, Cliente, Alerta, NotificacionCliente, InteraccionCliente, AlertaTipo, Perfil, Factura, ModuloId, OrdenTrabajo, Empresa, Producto, Cita } from './types';
import VehiclesTab from './components/VehiclesTab';
import OrdenesTrabajoTab from './components/OrdenesTrabajoTab';
import CrmTab from './components/CrmTab';
import AnalyticsTab from './components/AnalyticsTab';
import AlertsNotificationsTab from './components/AlertsNotificationsTab';
import FacturasTab from './components/FacturasTab';
import InventarioTab from './components/InventarioTab';
import AgendaTab from './components/AgendaTab';
import LoginScreen from './components/LoginScreen';
import AdminPanel from './components/AdminPanel';
import SuperAdminPanel from './components/SuperAdminPanel';
import {
  Car, Wrench, Users, BarChart2, Bell, Shield, Phone, Mail, Globe, Menu, X, Settings, FileText, LogOut, Package, CalendarClock
} from 'lucide-react';
import CompanySettingsPanel from './components/CompanySettingsPanel';

type TabId = ModuloId;

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<Perfil | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('citas');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  // States
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [notificaciones, setNotificaciones] = useState<NotificacionCliente[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);

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
      if (perfil.empresaId) {
        const empresaDelUsuario = await getEmpresa(perfil.empresaId).catch(() => null);
        if (!empresaDelUsuario?.activo) {
          await signOut();
          setCurrentUser(null);
          setAuthError('Tu empresa está suspendida. Contacta con el proveedor del servicio.');
          return;
        }
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

  // Datos de la propia empresa: se cargan tras autenticar (multi-tenant, sin
  // marca genérica antes de login — la pantalla de login es de la plataforma).
  useEffect(() => {
    if (currentUser?.empresaId) {
      getEmpresa(currentUser.empresaId).then(setEmpresa).catch((err) => console.error('Error cargando la empresa', err));
    } else {
      setEmpresa(null);
    }
  }, [currentUser]);

  // Refresca el perfil del usuario logueado (p.ej. tras editar su propio nombre desde "Mi cuenta").
  const recargarPerfil = useCallback(async () => {
    if (!currentUser) return;
    const perfil = await fetchPerfil(currentUser.id);
    if (perfil) setCurrentUser(perfil);
  }, [currentUser]);

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
  const recargarProductos = useCallback(async () => {
    setProductos(await listProductos());
  }, []);
  const recargarCitas = useCallback(async () => {
    setCitas(await listCitas());
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
      recargarProductos();
      recargarCitas();
    } else {
      setVehiculos([]);
      setClientes([]);
      setOrdenesTrabajo([]);
      setAlertas([]);
      setNotificaciones([]);
      setFacturas([]);
      setProductos([]);
      setCitas([]);
    }
  }, [currentUser, recargarVehiculos, recargarClientes, recargarOrdenes, recargarAlertas, recargarNotificaciones, recargarFacturas, recargarProductos, recargarCitas]);

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
    await createVehiculo(input);
    await recargarVehiculos();
    // El trigger de BD crea las alertas de itv/seguro/impuesto/mantenimiento.
    await recargarAlertas();
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

  const handleRenovarMantenimiento = useCallback(async (alertaId: string, nuevoKilometrajeLimite: number) => {
    await renovarAlertaMantenimiento(alertaId, nuevoKilometrajeLimite);
    await recargarAlertas();
  }, [recargarAlertas]);

  const handleForzarRecordatorio = useCallback(async (alertaId: string) => {
    await forzarRecordatorio(alertaId);
    await recargarAlertas();
    await recargarNotificaciones();
  }, [recargarAlertas, recargarNotificaciones]);

  const handleDeleteNotificacion = useCallback(async (id: string) => {
    await deleteNotificacion(id);
    await recargarNotificaciones();
  }, [recargarNotificaciones]);

  const handleTriggerAutoRenew = useCallback(async (vehId: string, tipo: Exclude<AlertaTipo, 'mantenimiento'>, nuevaFecha: string) => {
    const veh = vehiculos.find(v => v.id === vehId);
    if (!veh) return;
    const updatedVeh = { ...veh };
    if (tipo === 'itv') updatedVeh.itvVencimiento = nuevaFecha;
    else if (tipo === 'seguro') updatedVeh.seguroVencimiento = nuevaFecha;
    else if (tipo === 'impuesto') updatedVeh.impuestoVencimiento = nuevaFecha;
    await handleUpdateVehiculo(updatedVeh);
    // El trigger de BD reabre/actualiza la alerta correspondiente.
    await recargarAlertas();
  }, [vehiculos, handleUpdateVehiculo, recargarAlertas]);

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

  const handleEmitirFactura = useCallback(async (id: string) => {
    await emitirFactura(id);
    await recargarFacturas();
  }, [recargarFacturas]);

  const handleCambiarEstadoFactura = useCallback(async (id: string, estado: Factura['estado']) => {
    await cambiarEstadoFactura(id, estado);
    await recargarFacturas();
  }, [recargarFacturas]);

  // Producto / inventario handlers (Supabase)
  const handleAddProducto = useCallback(async (p: Producto, stockInicial: number) => {
    const creado = await createProducto(p, stockInicial);
    await recargarProductos();
    return creado;
  }, [recargarProductos]);

  const handleUpdateProducto = useCallback(async (p: Producto) => {
    await updateProducto(p);
    await recargarProductos();
  }, [recargarProductos]);

  const handleDeleteProducto = useCallback(async (id: string) => {
    await deleteProducto(id);
    await recargarProductos();
  }, [recargarProductos]);

  const handleRegistrarMovimiento = useCallback(async (m: NuevoMovimiento) => {
    await registrarMovimiento(m);
    await recargarProductos();
  }, [recargarProductos]);

  // OT handlers (Supabase)
  const handleAddOT = useCallback(async (ot: OrdenTrabajo) => {
    const creada = await createOrden(ot);
    await recargarOrdenes();
    return creada;
  }, [recargarOrdenes]);

  const handleUpdateOT = useCallback(async (ot: OrdenTrabajo) => {
    const actualizada = await updateOrden(ot);
    await recargarOrdenes();
    return actualizada;
  }, [recargarOrdenes]);

  const handleDeleteOT = useCallback(async (id: string) => {
    await deleteOrden(id);
    await recargarOrdenes();
  }, [recargarOrdenes]);

  // Cita handlers (Supabase)
  const handleAddCita = useCallback(async (c: Omit<Cita, 'id'>) => {
    const creada = await createCita(c);
    await recargarCitas();
    return creada;
  }, [recargarCitas]);

  const handleUpdateCita = useCallback(async (id: string, cambios: Partial<Omit<Cita, 'id'>>) => {
    const actualizada = await updateCita(id, cambios);
    await recargarCitas();
    return actualizada;
  }, [recargarCitas]);

  const handleDeleteCita = useCallback(async (id: string) => {
    await deleteCita(id);
    await recargarCitas();
  }, [recargarCitas]);

  const handleSaveEmpresa = useCallback(async (config: Partial<Empresa>) => {
    if (!currentUser?.empresaId) return;
    setEmpresa(await updateEmpresa(currentUser.empresaId, config));
  }, [currentUser]);

  const activeAlertsCount = useMemo(() => alertas.filter(a => a.estado === 'activa').length, [alertas]);

  const brandColor = empresa?.brandColor ?? '#2563eb';
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

  // El super admin gestiona empresas clientes — no opera datos de negocio.
  if (currentUser.rol === 'super_admin') {
    return <SuperAdminPanel currentUser={currentUser} onLogout={handleLogout} onUserUpdated={recargarPerfil} />;
  }

  // Datos de la propia empresa aún cargando.
  if (!empresa) return null;

  const tabDefs: { id: ModuloId; label: string; icon: React.ReactNode; emoji: string }[] = (
    [
      { id: 'citas' as ModuloId, label: 'Agenda', icon: <CalendarClock className="w-4 h-4" />, emoji: '📅' },
      { id: 'inventario' as ModuloId, label: 'Inventario', icon: <Package className="w-4 h-4" />, emoji: '📦' },
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
      className="h-screen bg-slate-50 font-sans flex antialiased overflow-hidden print:h-auto print:overflow-visible print:block"
      style={{ '--brand': brandColor, '--brand-text': brandText } as React.CSSProperties}
    >

      {/* RIEL LATERAL — navegación por iconos (solo escritorio) */}
      <aside className="hidden md:flex flex-col items-center w-[76px] shrink-0 bg-white border-r border-slate-200/80 py-4 print:hidden">
        <div className="flex flex-col gap-1.5 items-center">
          {tabDefs.map(tab => (
            <div key={tab.id} className="group relative">
              <button
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className="relative w-11 h-11 rounded-2xl flex items-center justify-center transition cursor-pointer text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                style={activeTab === tab.id ? { backgroundColor: brandColor, color: brandText, boxShadow: `0 8px 16px -6px ${brandColor}99` } : undefined}
              >
                {tab.icon}
                {tab.id === 'alertas' && activeAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center border-2 border-white">
                    {activeAlertsCount}
                  </span>
                )}
              </button>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-50">
                {tab.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-1.5 items-center pt-3 mt-1 border-t border-slate-100 w-full">
          {currentUser.rol === 'admin' && (
            <div className="group relative">
              <button
                onClick={() => setAdminPanelOpen(true)}
                title="Panel de administración"
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition cursor-pointer"
              >
                <Shield className="w-[19px] h-[19px]" />
              </button>
              <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-50">
                Panel de administración
              </span>
            </div>
          )}
          <div className="group relative">
            <button
              onClick={() => setSettingsOpen(true)}
              title="Configuración de empresa"
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition cursor-pointer"
            >
              <Settings className="w-[19px] h-[19px]" />
            </button>
            <span className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-50">
              Configuración de empresa
            </span>
          </div>
        </div>
      </aside>

      {/* COLUMNA PRINCIPAL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible">

        {/* CABECERA */}
        <header
          className="shadow-md print:hidden shrink-0"
          style={{ backgroundImage: `linear-gradient(135deg, ${brandColor}, color-mix(in srgb, ${brandColor} 78%, black))` }}
        >
          <div className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">

            {/* Logo + Brand */}
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center font-black tracking-tighter text-lg shadow-md shrink-0 overflow-hidden"
                style={{ backgroundColor: `${brandColor}33`, color: brandText }}
              >
                {empresa.logoBase64 ? (
                  <img src={empresa.logoBase64} alt="logo" className="w-full h-full object-contain" />
                ) : (
                  empresa.nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'E'
                )}
              </div>
              <div>
                <h1 className="text-md sm:text-lg font-display font-bold tracking-tight flex items-center gap-2" style={{ color: brandText }}>
                  {empresa.nombre}
                  <span
                    className="hidden sm:inline text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest"
                    style={{ backgroundColor: `${brandText === '#ffffff' ? '#ffffff' : '#000000'}22`, color: brandText, border: `1px solid ${brandText}44` }}
                  >
                    FLOTAS Y CRM
                  </span>
                </h1>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `${brandText}99` }}>{empresa.tagline}</p>
              </div>
            </div>

            {/* User pill + logout */}
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 rounded-full px-3 py-2"
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
                className="p-2 rounded-full transition cursor-pointer"
                style={{ backgroundColor: `${brandText === '#ffffff' ? '#00000033' : '#ffffff33'}`, color: brandText }}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        {/* Barra móvil: módulo activo + menú (la navegación por iconos solo existe en escritorio) */}
        <nav className="md:hidden bg-white border-b border-slate-200/80 shadow-3xs print:hidden shrink-0">
          <div className="px-4 sm:px-6">
            <div className="flex justify-between items-center h-14">
              <span className="text-xs font-bold text-slate-700 capitalize">
                Módulo: <span className="text-blue-700 font-extrabold">{activeTab.replace('_', ' ')}</span>
              </span>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 hover:bg-slate-50 text-slate-600 rounded-xl"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="border-t border-slate-100 bg-white px-4 py-2 space-y-1 block">
              {tabDefs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setMobileMenuOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-slate-700 block hover:bg-slate-50 flex justify-between"
                >
                  <span>{tab.emoji} {tab.label}</span>
                  {tab.id === 'alertas' && activeAlertsCount > 0 && (
                    <span className="px-2 py-0.5 bg-rose-500 text-white font-bold text-[9px] rounded-full">{activeAlertsCount}</span>
                  )}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-100 space-y-1">
                {currentUser.rol === 'admin' && (
                  <button onClick={() => { setAdminPanelOpen(true); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-blue-700 block hover:bg-blue-50">
                    🛡️ Panel de Administración
                  </button>
                )}
                <button onClick={() => { setSettingsOpen(true); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-slate-700 block hover:bg-slate-50">
                  ⚙️ Configuración de empresa
                </button>
                <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-xs font-bold rounded-xl text-slate-600 block hover:bg-slate-50">
                  🚪 Cerrar sesión
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* CORE WORKSPACE */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 overflow-y-auto print:overflow-visible print:h-auto">
        {activeTab === 'citas' && (
          <AgendaTab
            citas={citas}
            vehiculos={vehiculos}
            clientes={clientes}
            ordenes={ordenesTrabajo}
            onAddCita={handleAddCita}
            onUpdateCita={handleUpdateCita}
            onDeleteCita={handleDeleteCita}
            onCreateOT={handleAddOT}
          />
        )}

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
            empresa={empresa}
            productos={productos}
            onAdd={handleAddOT}
            onUpdate={handleUpdateOT}
            onDelete={handleDeleteOT}
            onCreateProducto={handleAddProducto}
          />
        )}

        {activeTab === 'clientes' && (
          <CrmTab
            clientes={clientes}
            vehiculos={vehiculos}
            ordenesTrabajo={ordenesTrabajo}
            empresa={empresa}
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
            onForzarRecordatorio={handleForzarRecordatorio}
            onRenovarMantenimiento={handleRenovarMantenimiento}
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
            empresa={empresa}
            onAddFactura={handleAddFactura}
            onUpdateFactura={handleUpdateFactura}
            onDeleteFactura={handleDeleteFactura}
            onEmitirFactura={handleEmitirFactura}
            onCambiarEstadoFactura={handleCambiarEstadoFactura}
          />
        )}

        {activeTab === 'inventario' && (
          <InventarioTab
            productos={productos}
            onAddProducto={handleAddProducto}
            onUpdateProducto={handleUpdateProducto}
            onDeleteProducto={handleDeleteProducto}
            onRegistrarMovimiento={handleRegistrarMovimiento}
          />
        )}
      </main>

        {/* PIE — contacto de la empresa + copyright (antes vivía en la cabecera) */}
        <footer className="bg-slate-900 border-t border-slate-800 py-3.5 text-xs text-slate-400 print:hidden shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2.5">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {empresa.correo && (
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Mail className="w-3.5 h-3.5 text-slate-500" /> {empresa.correo}
                </span>
              )}
              {empresa.telefono && (
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-500" /> {empresa.telefono}
                </span>
              )}
              {empresa.web && (
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Globe className="w-3.5 h-3.5 text-slate-500" /> {empresa.web}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-center">
              © 2026 Tibox — Desarrollado por{' '}
              <a
                href="https://www.somosingenio.net"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-300 underline underline-offset-2 transition"
              >
                InGenio
              </a>
              . Reservados todos los derechos.
            </p>
          </div>
        </footer>
      </div>

      {settingsOpen && (
        <CompanySettingsPanel
          config={empresa}
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
    </div>
  );
}
