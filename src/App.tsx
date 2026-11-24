import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import { Sentry } from './lib/sentry';
import type { Session } from '@supabase/supabase-js';
import { fetchPerfil, signOut, mfaPendiente } from './lib/auth';
import { llegaDeInvitacion, errorDeEnlace } from './lib/invitacion';
import { mensajeDeError, mensajeSoloLectura, textoDeError } from './lib/errores';
import { avisar, avisarError, escucharAvisos, type Aviso } from './lib/avisos';
import { getSuscripcion, type Suscripcion } from './lib/data/suscripcion';
import { listVehiculos, createVehiculo, updateVehiculo, deleteVehiculo, guardarAceite, NuevoVehiculo, AceiteVehiculo } from './lib/data/vehiculos';
import { listClientes, createCliente, updateCliente, deleteCliente, anonymizeCliente, addInteraccion, setPortalToken, asociarVehiculo, NuevoCliente } from './lib/data/clientes';
import { listOrdenesTablero, createOrden, updateOrden, deleteOrden, getOrden, anotarProximoCambio } from './lib/data/ordenes';
import { avisoDelMecanico } from './utils/avisoMecanico';
import { listAlertas, forzarRecordatorio, descartarAlerta, registrarAvisoAlerta } from './lib/data/alertas';
import { listAvisos, crearAviso, descartarAviso, registrarEnvioAviso, type NuevoAviso } from './lib/data/avisos';
import { listNotificaciones, registrarNotificacionManual } from './lib/data/notificaciones';
import { configDeEmpresa, construirAvisos, descripcionVehiculo, hoyLocal, tipoEventoDe, type ItemAviso } from './utils/avisos';
import { createFactura, updateFactura, deleteFactura, emitirFactura, cambiarEstadoFactura } from './lib/data/facturas';
import { listPagosCercanos } from './lib/data/compras';
import { avisoPagos, hoyIso, sumarDias, type AvisoPagos } from './utils/compras';
import { listProductos, createProducto, updateProducto, deleteProducto, registrarMovimiento, NuevoMovimiento } from './lib/data/productos';
import { listCitas, createCita, updateCita, deleteCita } from './lib/data/citas';
import { getEmpresa, updateEmpresa } from './lib/data/empresa';
import { Vehiculo, Cliente, Alerta, AvisoCliente, NotificacionCliente, InteraccionCliente, AlertaTipo, Perfil, Factura, ModuloId, OrdenTrabajo, OTEstado, Empresa, Producto, Cita } from './types';
import Cargando from './components/Cargando';
import { lazyConReintento } from './lib/lazy';
import { derivarMarca, normalizarHex } from './ui/colorMarca';
import { esOscuro, guardarTema, leerTema, type Tema } from './ui/tema';
import type { Intencion } from './ui/navegacion';
import type { IrA } from './ui/Marco';
import LoginScreen from './components/LoginScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import SuscripcionBanner from './components/SuscripcionBanner';
import type { TabId as PestanaEmpresa } from './components/CompanySettingsPanel';

// Cada pestaña y cada ventana grande es un trozo aparte: quien entra a Inicio no descarga el taller,
// las facturas ni las gráficas hasta que las abre (o hasta que la aplicación las precarga en un
// momento libre, ver `precargarPantallas`).
const cargarVehiculos = () => import('./components/VehiclesTab');
const cargarTaller = () => import('./components/OrdenesTrabajoTab');
const cargarClientes = () => import('./components/CrmTab');
const cargarRentabilidad = () => import('./components/AnalyticsTab');
const cargarAlertas = () => import('./ui/AvisosTab');
const cargarFacturas = () => import('./components/FacturasTab');
const cargarInventario = () => import('./components/InventarioTab');
const cargarAgenda = () => import('./components/AgendaTab');
const cargarCompras = () => import('./components/ComprasTab');
const VehiclesTab = lazyConReintento(cargarVehiculos);
const OrdenesTrabajoTab = lazyConReintento(cargarTaller);
const CrmTab = lazyConReintento(cargarClientes);
const AnalyticsTab = lazyConReintento(cargarRentabilidad);
const AvisosTab = lazyConReintento(cargarAlertas);
const FacturasTab = lazyConReintento(cargarFacturas);
const InventarioTab = lazyConReintento(cargarInventario);
const AgendaTab = lazyConReintento(cargarAgenda);
const ComprasTab = lazyConReintento(cargarCompras);
// El marco del nuevo diseño (y sus estilos) es un trozo aparte: quien usa la interfaz actual no lo descarga.
const Marco = lazyConReintento(() => import('./ui/Marco'));
const Hoy = lazyConReintento(() => import('./ui/Hoy'));
const MfaChallenge = lazyConReintento(() => import('./components/MfaChallenge'));
const SeguridadModal = lazyConReintento(() => import('./components/SeguridadModal'));
const SuscripcionPanel = lazyConReintento(() => import('./components/SuscripcionPanel'));
const CompanySettingsPanel = lazyConReintento(() => import('./components/CompanySettingsPanel'));
const AdminPanel = lazyConReintento(() => import('./components/AdminPanel'));
const SuperAdminPanel = lazyConReintento(() => import('./components/SuperAdminPanel'));

/** Las pantallas por módulo, para precargarlas en un momento libre y que abrir una pestaña sea instantáneo. */
const PANTALLAS_POR_MODULO: Partial<Record<ModuloId, () => Promise<unknown>>> = {
  taller: cargarTaller, clientes: cargarClientes, vehiculos: cargarVehiculos, citas: cargarAgenda,
  facturas: cargarFacturas, alertas: cargarAlertas, inventario: cargarInventario, rentabilidad: cargarRentabilidad, compras: cargarCompras,
};

type TabId = ModuloId;

export default function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<Perfil | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(errorDeEnlace);
  // true mientras dura el flujo de "restablecer contraseña" (enlace del email de recuperación).
  // También se muestra al llegar desde el enlace de invitación del alta (hay que elegir contraseña).
  const [passwordRecovery, setPasswordRecovery] = useState(llegaDeInvitacion);
  // true si la contraseña fue correcta pero falta el código de la verificación en dos pasos.
  const [mfaRequerido, setMfaRequerido] = useState(false);
  const [seguridadOpen, setSeguridadOpen] = useState(false);
  // Suscripción (prueba / pago / solo lectura) y regreso desde la página de pago de Stripe.
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [suscripcionOpen, setSuscripcionOpen] = useState(false);
  // Aviso emergente (error o confirmación) de cualquier pantalla. `soloLectura`: el servidor rechazó
  // el guardado porque la prueba o la suscripción ha terminado — se ofrece suscribirse.
  const [aviso, setAviso] = useState<(Aviso & { soloLectura: boolean }) | null>(null);
  // Resultado visible tras volver de pagar: confirmado, o la activación tarda más de lo normal.
  const [pagoMensaje, setPagoMensaje] = useState<'confirmado' | 'lento' | null>(null);
  const [pagoVolviendo, setPagoVolviendo] = useState(() => new URLSearchParams(window.location.search).get('suscripcion') === 'ok');

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>('inicio');
  // Orden que el botón «Nuevo» o el buscador global dan a una pestaña al llegar a ella.
  const [intencion, setIntencion] = useState<Intencion | undefined>(undefined);
  // Aspecto claro / oscuro / automático (por persona). «Automático» sigue la preferencia del sistema.
  const [tema, setTema] = useState<Tema>(leerTema);
  const [sistemaOscuro, setSistemaOscuro] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const alCambiar = (e: MediaQueryListEvent) => setSistemaOscuro(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  const oscuro = esOscuro(tema, sistemaOscuro);
  const cambiarTema = useCallback((t: Tema) => { guardarTema(t); setTema(t); }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Pestaña con la que se abre Empresa: la guía de primeros pasos enlaza directo a cada una.
  const [settingsTab, setSettingsTab] = useState<PestanaEmpresa | undefined>(undefined);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  // States
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [avisosPersonalizados, setAvisosPersonalizados] = useState<AvisoCliente[]>([]);
  const [notificaciones, setNotificaciones] = useState<NotificacionCliente[]>([]);
  // Alcance acotado (listOrdenesTablero: activas + entregadas de los
  // últimos 30 días) — SOLO para el Tablero/Kanban de Taller, el único
  // consumidor que queda de este estado compartido. Agenda/Vehículos/CRM/
  // Facturas ya tienen su propia consulta puntual (ver lib/data/ordenes.ts)
  // y no reciben este array — así no crece con el histórico de la empresa.
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  // Copias siempre al día para los oyentes de tiempo real (se registran una vez y no ven el estado nuevo).
  const ordenesRef = useRef<OrdenTrabajo[]>([]);
  const vehiculosRef = useRef<Vehiculo[]>([]);
  ordenesRef.current = ordenesTrabajo;
  vehiculosRef.current = vehiculos;
  const [productos, setProductos] = useState<Producto[]>([]);
  const [citas, setCitas] = useState<Cita[]>([]);

  // Sesión con Supabase Auth: comprueba la sesión al montar y escucha cambios.
  useEffect(() => {
    let mounted = true;

    const aplicarSesion = async (session: Session | null) => {
      const userId = session?.user.id;
      if (!userId) {
        if (mounted) { setCurrentUser(null); setMfaRequerido(false); }
        return;
      }
      // Con la verificación en dos pasos activada, la sesión solo con contraseña no sirve:
      // la base de datos tampoco le devolvería datos. Se pide el código antes de cargar nada.
      if (mfaPendiente(session)) {
        if (mounted) { setCurrentUser(null); setMfaRequerido(true); }
        return;
      }
      if (mounted) setMfaRequerido(false);
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

    supabase.auth.getSession().then(async ({ data }) => {
      let sesion = data.session;
      if (sesion) {
        // El usuario guardado en el navegador puede no conocer un factor activado después
        // en otro dispositivo: se refresca antes de decidir si hace falta el código.
        const { data: u } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        if (u.user) sesion = { ...sesion, user: u.user };
      }
      aplicarSesion(sesion).finally(() => {
        if (mounted) setAuthChecked(true);
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // El enlace del email de recuperación abre una sesión temporal y
      // dispara este evento — hay que mostrar la pantalla de "nueva
      // contraseña" en vez de entrar directo al panel con la contraseña
      // antigua todavía activa.
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      aplicarSesion(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Avisos emergentes: los que lanzan las pantallas (lib/avisos) y, como red de seguridad, cualquier
  // promesa rechazada que nadie capturó — ninguna acción debe fallar sin que el usuario lo vea.
  useEffect(() => {
    const mostrar = (a: Aviso) => setAviso({ ...a, soloLectura: mensajeSoloLectura(a.mensaje) !== null });
    const alRechazar = (e: PromiseRejectionEvent) => {
      const soloLectura = mensajeSoloLectura(e.reason);
      if (soloLectura) {
        e.preventDefault();
        mostrar({ tipo: 'error', mensaje: soloLectura });
        return;
      }
      // Peticiones canceladas a propósito o rechazos sin texto: no son un fallo que contar al usuario.
      if ((e.reason as { name?: string } | null)?.name === 'AbortError' || !textoDeError(e.reason).trim()) return;
      mostrar({ tipo: 'error', mensaje: mensajeDeError(e.reason, 'No se pudo completar la acción.') });
    };
    const dejarDeEscuchar = escucharAvisos(mostrar);
    window.addEventListener('unhandledrejection', alRechazar);
    return () => { dejarDeEscuchar(); window.removeEventListener('unhandledrejection', alRechazar); };
  }, []);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.tipo === 'ok' ? 5_000 : 12_000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Estado de la suscripción. Tras volver de pagar, el webhook de Stripe tarda unos segundos en
  // activarla: se consulta cada pocos segundos hasta verla activa (máx. ~40 s).
  useEffect(() => {
    if (!currentUser || currentUser.rol === 'super_admin') { setSuscripcion(null); return; }
    let vivo = true;
    let intentos = 0;
    const consultar = () => getSuscripcion()
      .then((s) => {
        if (!vivo) return;
        setSuscripcion(s);
        if (pagoVolviendo && s?.estado !== 'activa' && ++intentos < 12) setTimeout(consultar, 3500);
        else if (pagoVolviendo) {
          setPagoMensaje(s?.estado === 'activa' ? 'confirmado' : 'lento');
          if (s?.estado === 'activa') setTimeout(() => setPagoMensaje(null), 10_000);
          setPagoVolviendo(false);
          window.history.replaceState(null, '', window.location.pathname);
        }
      })
      .catch((err) => console.error('Error cargando la suscripción', err));
    void consultar();
    return () => { vivo = false; };
  }, [currentUser, pagoVolviendo]);

  // Datos de la propia empresa: se cargan tras autenticar (multi-tenant, sin
  // marca genérica antes de login — la pantalla de login es de la plataforma).
  useEffect(() => {
    if (currentUser?.empresaId) {
      getEmpresa(currentUser.empresaId).then(setEmpresa).catch((err) => console.error('Error cargando la empresa', err));
    } else {
      setEmpresa(null);
    }
  }, [currentUser]);

  // Contexto de usuario para Sentry — así un error reportado dice quién y de
  // qué empresa lo sufrió, en vez de ser un evento anónimo. No-op si no hay
  // VITE_SENTRY_DSN configurado (ver src/lib/sentry.ts).
  useEffect(() => {
    Sentry.setUser(currentUser ? { id: currentUser.id, email: currentUser.email, empresa_id: currentUser.empresaId ?? undefined } : null);
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
    setOrdenesTrabajo(await listOrdenesTablero());
  }, []);
  const recargarAlertas = useCallback(async () => {
    setAlertas(await listAlertas());
  }, []);
  const recargarAvisos = useCallback(async () => {
    setAvisosPersonalizados(await listAvisos());
  }, []);
  const recargarNotificaciones = useCallback(async () => {
    setNotificaciones(await listNotificaciones());
  }, []);
  const recargarProductos = useCallback(async () => {
    setProductos(await listProductos());
  }, []);
  const recargarCitas = useCallback(async () => {
    setCitas(await listCitas());
  }, []);

  // Datos de Supabase: se cargan cuando hay sesión (la RLS requiere estar
  // autenticado). Al cerrar sesión se limpian.
  // `datosListos`: ya llegó la primera carga de clientes, vehículos y órdenes (la guía de primeros
  // pasos espera a esto para no enseñar pasos «pendientes» que en realidad ya están hechos).
  const [datosListos, setDatosListos] = useState(false);
  // Pagos a proveedores que ya vencieron o vencen esta semana (aviso de Inicio y contador de la pestaña Compras).
  const [pagosProv, setPagosProv] = useState<AvisoPagos | null>(null);
  const [comprasVista, setComprasVista] = useState<'compras' | 'porpagar'>('compras');
  useEffect(() => {
    if (currentUser) {
      void Promise.allSettled([recargarVehiculos(), recargarClientes(), recargarOrdenes()]).then(() => setDatosListos(true));
      recargarAlertas();
      recargarAvisos().catch(() => undefined);
      recargarNotificaciones();
      recargarProductos();
      recargarCitas();
    } else {
      setDatosListos(false);
      setVehiculos([]);
      setClientes([]);
      setOrdenesTrabajo([]);
      setAlertas([]);
      setAvisosPersonalizados([]);
      setNotificaciones([]);
      setProductos([]);
      setCitas([]);
    }
  }, [currentUser, recargarVehiculos, recargarClientes, recargarOrdenes, recargarAlertas, recargarAvisos, recargarNotificaciones, recargarProductos, recargarCitas]);

  // Realtime: el mecánico marca tareas desde su Portal (sin pasar por esta
  // sesión ni por este usuario) — sin esto, el progreso solo se vería tras
  // recargar o reabrir la OT. Se actualiza en el sitio, sin refetch completo:
  // solo la línea concreta que cambió, dentro de la OT que la contiene.
  // También se escucha ordenes_trabajo porque la propia Edge Function
  // portal-mecanico adelanta la OT de "recibido" a "en_reparacion" en
  // cuanto el técnico marca su primera tarea — sin esto el tablero/lista
  // se quedarían mostrando la columna/estado viejo hasta recargar.
  useEffect(() => {
    if (!currentUser) return;
    const canal = supabase
      .channel('lineas_ot-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lineas_ot' },
        (payload) => {
          const nueva = payload.new as { id: string; ot_id: string; completado: boolean; duracion_min: number | null };
          setOrdenesTrabajo(prev => prev.map(ot =>
            ot.id === nueva.ot_id
              ? { ...ot, lineas: ot.lineas.map(l => (l.id === nueva.id ? { ...l, completado: nueva.completado, duracionMin: nueva.duracion_min ?? undefined } : l)) }
              : ot
          ));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ordenes_trabajo' },
        (payload) => {
          const nueva = payload.new as { id: string; estado: OTEstado; updated_at: string; mecanico_actualizado_en: string | null };
          setOrdenesTrabajo(prev => prev.map(ot =>
            ot.id === nueva.id ? { ...ot, estado: nueva.estado, fechaActualizacion: nueva.updated_at } : ot
          ));
          // Si el cambio lo hizo el mecánico desde su Portal, se relee esa orden entera (tareas,
          // tiempos e historial con sus notas) y se avisa al taller de lo importante. Los cambios
          // del propio taller no pasan por aquí: no mueven `mecanico_actualizado_en`.
          const antes = ordenesRef.current.find(o => o.id === nueva.id);
          const marca = (f?: string | null) => (f ? new Date(f).getTime() : 0);
          if (antes && nueva.mecanico_actualizado_en && marca(nueva.mecanico_actualizado_en) !== marca(antes.mecanicoActualizadoEn)) {
            getOrden(nueva.id)
              .then((fresca) => {
                setOrdenesTrabajo(prev => prev.map(o => (o.id === fresca.id ? fresca : o)));
                // En un cambio de aceite el mecánico también escribe en la ficha del vehículo.
                if (fresca.esCambioAceite) void recargarVehiculos().catch(() => undefined);
                const mensaje = avisoDelMecanico(antes, fresca, vehiculosRef.current.find(v => v.id === fresca.vehiculoId));
                if (mensaje) avisar({ tipo: 'ok', mensaje });
              })
              .catch((err) => console.error('No se pudo refrescar la orden', err));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [currentUser]);

  // Cuando ya está todo cargado y el navegador respira, se bajan en segundo plano las pantallas a las
  // que este usuario puede entrar: así la primera visita a cada pestaña no espera a la red. Si falla
  // alguna (sin conexión) no pasa nada: se pedirá al abrirla.
  useEffect(() => {
    if (!currentUser || !datosListos) return;
    const precargar = () => {
      for (const modulo of currentUser.modulos) void PANTALLAS_POR_MODULO[modulo]?.().catch(() => undefined);
    };
    const idle = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const id = idle ? idle(precargar, { timeout: 4000 }) : window.setTimeout(precargar, 2000);
    return () => { if (!idle) window.clearTimeout(id); };
  }, [currentUser, datosListos]);

  // Corrige la pestaña activa si el usuario no tiene permiso sobre ella —
  // 'inicio' queda fuera de esta comprobación: no es un módulo con permiso
  // propio, es la pantalla de aterrizaje válida para cualquier usuario.
  useEffect(() => {
    if (currentUser) {
      const mods = currentUser.modulos;
      if (activeTab !== 'inicio' && mods.length > 0 && !mods.includes(activeTab as ModuloId)) {
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
    // El trigger de BD crea las alertas de itv/seguro/impuesto.
    await recargarAlertas();
  }, [recargarVehiculos, recargarAlertas]);

  // Alta rápida desde la orden de trabajo: el vehículo nace ya a nombre de su dueño, y las listas se refrescan para que la orden lo encuentre.
  const handleAltaRapidaVehiculo = useCallback(async (input: NuevoVehiculo, clienteId: string) => {
    const creado = await createVehiculo(input);
    try { await asociarVehiculo(clienteId, creado.id); } catch (err) { await recargarVehiculos(); throw err; }
    await Promise.all([recargarVehiculos(), recargarClientes(), recargarAlertas()]);
    return creado;
  }, [recargarVehiculos, recargarClientes, recargarAlertas]);

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

  const handleAnonymizeCliente = useCallback(async (id: string) => {
    const actualizado = await anonymizeCliente(id);
    await recargarClientes();
    return actualizado;
  }, [recargarClientes]);

  const handleAddInteraccion = useCallback(async (cliId: string, input: { tipo: InteraccionCliente['tipo']; notas: string }) => {
    const creada = await addInteraccion(cliId, input);
    await recargarClientes();
    return creada;
  }, [recargarClientes]);

  const handleSetPortalToken = useCallback(async (clienteId: string, token: string | null) => {
    const actualizado = await setPortalToken(clienteId, token);
    await recargarClientes();
    return actualizado;
  }, [recargarClientes]);

  // Acciones de Avisos. Los errores los enseña la propia pantalla (cada fila muestra el suyo), por eso aquí se dejan subir.
  const recargarTodoAvisos = useCallback(() => Promise.all([recargarAlertas(), recargarAvisos(), recargarNotificaciones()]).then(() => undefined), [recargarAlertas, recargarAvisos, recargarNotificaciones]);

  const handleEnviarCorreoAviso = useCallback(async (ref: { alertaId?: string; avisoId?: string }) => {
    await forzarRecordatorio(ref);
    await recargarTodoAvisos();
  }, [recargarTodoAvisos]);

  // WhatsApp asistido: primero se marca el aviso (si fallara el historial, es mejor que quede sin anotar que avisar dos veces), luego se anota en el historial.
  const handleAvisoManual = useCallback(async (item: ItemAviso, mensaje: string) => {
    if (!item.clienteId) throw new Error('El aviso no tiene cliente.');
    const alerta = item.alertaId ? alertas.find((a) => a.id === item.alertaId) : undefined;
    const personalizado = item.avisoId ? avisosPersonalizados.find((a) => a.id === item.avisoId) : undefined;
    if (alerta) await registrarAvisoAlerta(alerta, item.aviso ?? 'recordatorio');
    else if (personalizado) await registrarEnvioAviso(personalizado, 'whatsapp', hoyLocal());
    else throw new Error('No se encontró el aviso.');
    const veh = vehiculos.find((v) => v.id === item.vehiculoId);
    await registrarNotificacionManual({
      clienteId: item.clienteId, vehiculoId: item.vehiculoId, tipoEvento: tipoEventoDe(item), mensaje,
      asunto: `${item.motivo}${veh ? ` — ${descripcionVehiculo(veh)}` : ''}`,
    });
    await recargarTodoAvisos();
  }, [alertas, avisosPersonalizados, vehiculos, recargarTodoAvisos]);

  const handleDescartarAviso = useCallback(async (item: ItemAviso) => {
    if (item.alertaId) await descartarAlerta(item.alertaId);
    else if (item.avisoId) await descartarAviso(item.avisoId);
    await recargarTodoAvisos();
  }, [recargarTodoAvisos]);

  const handleCrearAviso = useCallback(async (a: NuevoAviso) => {
    await crearAviso(a);
    await recargarAvisos();
  }, [recargarAvisos]);

  // Renovar ITV/seguro/impuesto = poner la nueva fecha en el vehículo; el disparador de la base reabre la alerta con el ciclo nuevo.
  const handleRenovarVencimiento = useCallback(async (vehId: string, tipo: Exclude<AlertaTipo, 'aceite'>, nuevaFecha: string) => {
    const veh = vehiculos.find((v) => v.id === vehId);
    if (!veh) throw new Error('No se encontró el vehículo.');
    const actualizado = { ...veh };
    if (tipo === 'itv') actualizado.itvVencimiento = nuevaFecha;
    else if (tipo === 'seguro') actualizado.seguroVencimiento = nuevaFecha;
    else actualizado.impuestoVencimiento = nuevaFecha;
    await handleUpdateVehiculo(actualizado);
    await recargarAlertas();
  }, [vehiculos, handleUpdateVehiculo, recargarAlertas]);

  // Factura handlers (Supabase) — FacturasTab gestiona su propia carga
  // paginada; estos handlers solo escriben y dejan que el propio tab
  // refresque lo que esté viendo en ese momento.
  const handleAddFactura = useCallback(async (f: Factura) => {
    await createFactura(f);
  }, []);

  const handleUpdateFactura = useCallback(async (f: Factura) => {
    await updateFactura(f);
  }, []);

  const handleDeleteFactura = useCallback(async (id: string) => {
    await deleteFactura(id);
  }, []);

  const handleEmitirFactura = useCallback(async (id: string) => {
    await emitirFactura(id);
  }, []);

  const handleCambiarEstadoFactura = useCallback(async (id: string, estado: Factura['estado']) => {
    await cambiarEstadoFactura(id, estado);
  }, []);

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
  // updateOrden/createOrden ya devuelven la OT completa tal como quedó en el
  // servidor (con los ids reales de sus líneas) — un recargarOrdenes() detrás
  // repetía esa misma consulta para TODAS las órdenes de la empresa (con sus
  // líneas y su historial) solo para acabar usando el mismo dato que ya
  // teníamos. Esa segunda vuelta completa era la lentitud al arrastrar
  // tarjetas en el Kanban: se nota más cuanto más historial/líneas acumula
  // cada OT, así que solo iba a empeorar con el uso real. Ahora se actualiza
  // localmente solo la orden que cambió.
  const handleAddOT = useCallback(async (ot: OrdenTrabajo) => {
    const creada = await createOrden(ot);
    setOrdenesTrabajo(prev => [creada, ...prev]);
    // El servidor pasa el kilometraje de la orden a la ficha del vehículo: se relee para verlo al momento.
    if (creada.kilometrajeEntrada > 0 || creada.esCambioAceite) void recargarVehiculos().catch(() => undefined);
    return creada;
  }, [recargarVehiculos]);

  // El tablero del taller (5 columnas de ancho fijo) no cabe en el máximo
  // centrado normal y aparece con scroll horizontal aunque sobre espacio en
  // pantalla — mientras esa vista está activa, <main> usa un máximo mayor
  // (sigue centrado, solo más ancho) para que quepan las 5 columnas enteras.
  const [tallerVistaAmplia, setTallerVistaAmplia] = useState(false);

  const handleUpdateOT = useCallback(async (ot: OrdenTrabajo) => {
    const actualizada = await updateOrden(ot);
    setOrdenesTrabajo(prev => prev.map(o => (o.id === actualizada.id ? actualizada : o)));
    // …y, al entregar un cambio de aceite, anota el cambio en esa ficha.
    if (actualizada.kilometrajeEntrada > 0 || actualizada.esCambioAceite) void recargarVehiculos().catch(() => undefined);
    return actualizada;
  }, [recargarVehiculos]);

  // Cambio de aceite: interruptor, filtros y próximo cambio se guardan al momento desde la ficha de
  // la orden; aquí solo se refleja la orden ya guardada (y la ficha del vehículo si cambió).
  const handleOrdenRefrescada = useCallback((ot: OrdenTrabajo) => {
    setOrdenesTrabajo(prev => prev.map(o => (o.id === ot.id ? ot : o)));
    void recargarVehiculos().catch(() => undefined);
    void recargarAlertas().catch(() => undefined); // el próximo cambio mueve la alerta de aceite
  }, [recargarVehiculos, recargarAlertas]);

  // Desde Avisos: anota el próximo cambio de una orden de aceite ya hecha; la orden, el coche y la alerta se refrescan.
  const handleAnotarAceite = useCallback(async (ordenId: string, fecha: string, km: number | null) => {
    handleOrdenRefrescada(await anotarProximoCambio(ordenId, fecha, km));
  }, [handleOrdenRefrescada]);

  const handleGuardarAceite = useCallback(async (vehiculoId: string, datos: AceiteVehiculo) => {
    await guardarAceite(vehiculoId, datos);
    await recargarVehiculos();
    await recargarAlertas();
  }, [recargarVehiculos, recargarAlertas]);

  const handleDeleteOT = useCallback(async (id: string) => {
    await deleteOrden(id);
    setOrdenesTrabajo(prev => prev.filter(o => o.id !== id));
  }, []);

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

  const recargarPagos = useCallback(async () => {
    if (!currentUser?.modulos.includes('compras')) { setPagosProv(null); return; }
    try {
      const hoy = hoyIso();
      setPagosProv(avisoPagos(await listPagosCercanos(sumarDias(hoy, 7)), hoy));
    } catch { setPagosProv(null); }
  }, [currentUser]);
  useEffect(() => { void recargarPagos(); }, [recargarPagos]);
  const navegar = useCallback((tab: TabId, vista?: 'porpagar') => { setComprasVista(vista === 'porpagar' ? 'porpagar' : 'compras'); setActiveTab(tab); setIntencion(undefined); }, []);
  const irA = useCallback<IrA>((tab, orden) => { navegar(tab); if (orden) setIntencion({ ...orden, n: Date.now() }); }, [navegar]);
  const pagosAvisoCount = pagosProv ? pagosProv.vencidas.n + pagosProv.semana.n : 0;

  // La cola de avisos (vencimientos + personalizados): alimenta la pantalla Avisos, el contador del menú y «Hoy».
  const itemsAvisos = useMemo(
    () => (empresa ? construirAvisos({ alertas, personalizados: avisosPersonalizados, ordenes: ordenesTrabajo, clientes, vehiculos, config: configDeEmpresa(empresa), hoy: hoyLocal() }) : []),
    [empresa, alertas, avisosPersonalizados, ordenesTrabajo, clientes, vehiculos],
  );
  const avisosParaHoy = useMemo(() => itemsAvisos.filter((i) => i.fase === 'para_hoy').length, [itemsAvisos]);

  const brandColor = empresa?.brandColor ?? '#E8590C';

  useEffect(() => {
    const root = document.documentElement;
    if (oscuro) root.dataset.tema = 'oscuro'; else delete root.dataset.tema;
    // El color del taller se corrige para que el texto se lea (contraste mínimo 4,5:1). Va en la raíz para que también lo usen las ventanas que
    // cuelgan fuera del marco (ajustes, seguridad…) y las pantallas que aún leen --brand-color.
    const m = derivarMarca(normalizarHex(brandColor) ?? '#E8590C', oscuro);
    root.style.setProperty('--brand-color', m.boton);
    root.style.setProperty('--brand-text-color', m.sobreBoton);
    root.style.setProperty('--u-brand', m.boton);
    root.style.setProperty('--u-on-brand', m.sobreBoton);
    root.style.setProperty('--u-brand-ink', m.tinta);
  }, [brandColor, oscuro]);

  // Wait until auth is checked
  if (!authChecked) return null;

  // Enlace de recuperación de contraseña: pedir la nueva antes de entrar,
  // aunque la sesión temporal ya esté activa.
  if (passwordRecovery) {
    return <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />;
  }

  // Contraseña correcta pero falta el código de la verificación en dos pasos.
  if (mfaRequerido) return <Suspense fallback={<Cargando pantallaCompleta />}><MfaChallenge /></Suspense>;

  // Show login if no user
  if (!currentUser) {
    return <LoginScreen authError={authError} />;
  }

  // El super admin gestiona empresas clientes — no opera datos de negocio.
  if (currentUser.rol === 'super_admin') {
    return <Suspense fallback={<Cargando pantallaCompleta />}><SuperAdminPanel currentUser={currentUser} onLogout={handleLogout} onUserUpdated={recargarPerfil} /></Suspense>;
  }

  // Datos de la propia empresa aún cargando.
  if (!empresa) return null;

  // Las tres piezas del marco: franjas de aviso, contenido de la pestaña activa y ventanas/avisos superpuestos.
  const avisosPago = (
    <>
      {pagoVolviendo && <div role="status" className="u-aviso ok">¡Gracias! Estamos activando tu suscripción, tardará unos segundos…</div>}
      {pagoMensaje && (
        <div role="status" className={`u-aviso ${pagoMensaje === 'confirmado' ? 'ok' : 'aviso'}`}>
          <span>{pagoMensaje === 'confirmado'
            ? '¡Pago recibido! Tu suscripción está activa. Gracias por confiar en Doonty Motor.'
            : 'Hemos recibido tu pago, pero la activación tarda más de lo normal. Recarga la página en unos minutos; si sigue igual, escríbenos a send@doonty.com.'}</span>
          <button type="button" className="u-enlace" onClick={() => setPagoMensaje(null)} aria-label="Cerrar aviso">Cerrar</button>
        </div>
      )}
      {!pagoVolviendo && suscripcion && <SuscripcionBanner suscripcion={suscripcion} esAdmin={currentUser.rol === 'admin'} onAbrir={() => setSuscripcionOpen(true)} />}
    </>
  );

  const contenido = (
        <Suspense fallback={<Cargando />}>
        {activeTab === 'inicio' && (
          <Hoy
            currentUser={currentUser}
            citas={citas}
            clientes={clientes}
            vehiculos={vehiculos}
            avisos={itemsAvisos}
            modulos={activeModulos}
            empresa={empresa}
            ordenes={ordenesTrabajo}
            datosListos={datosListos}
            onIr={irA}
            onNavegar={navegar}
            pagosProveedores={pagosProv}
            onAbrirEmpresa={(pestana) => { setSettingsTab(pestana); setSettingsOpen(true); }}
          />
        )}

        {activeTab === 'citas' && (
          <AgendaTab
            intencion={intencion}
            citas={citas}
            vehiculos={vehiculos}
            clientes={clientes}
            onAddCita={handleAddCita}
            onUpdateCita={handleUpdateCita}
            onDeleteCita={handleDeleteCita}
            onCreateOT={handleAddOT}
            onAddCliente={handleAddCliente}
            nombreTaller={empresa.nombre}
          />
        )}

        {activeTab === 'vehiculos' && (
          <VehiclesTab
            intencion={intencion}
            vehiculos={vehiculos}
            clientes={clientes}
            onAddVehiculo={handleAddVehiculo}
            onUpdateVehiculo={handleUpdateVehiculo}
            onDeleteVehiculo={handleDeleteVehiculo}
            onGuardarAceite={handleGuardarAceite}
            onImportado={recargarVehiculos}
            empresa={empresa}
            onCrearAviso={handleCrearAviso}
          />
        )}

        {activeTab === 'taller' && (
          <OrdenesTrabajoTab
            intencion={intencion}
            ordenes={ordenesTrabajo}
            vehiculos={vehiculos}
            clientes={clientes}
            empresa={empresa}
            productos={productos}
            onAdd={handleAddOT}
            onCrearCliente={handleAddCliente}
            onCrearVehiculo={handleAltaRapidaVehiculo}
            onUpdate={handleUpdateOT}
            onDelete={handleDeleteOT}
            onRefrescada={handleOrdenRefrescada}
            onCreateProducto={handleAddProducto}
            onVistaAmpliaChange={setTallerVistaAmplia}
            onCrearAviso={handleCrearAviso}
          />
        )}

        {activeTab === 'clientes' && (
          <CrmTab
            intencion={intencion}
            clientes={clientes}
            vehiculos={vehiculos}
            empresa={empresa}
            onAddCliente={handleAddCliente}
            onUpdateCliente={handleUpdateCliente}
            onDeleteCliente={handleDeleteCliente}
            onAnonymizeCliente={handleAnonymizeCliente}
            onAddInteraccion={handleAddInteraccion}
            onSetPortalToken={handleSetPortalToken}
            onImportado={recargarClientes}
            avisos={itemsAvisos}
            notificaciones={notificaciones}
            onCrearAviso={handleCrearAviso}
          />
        )}

        {activeTab === 'rentabilidad' && (
          <AnalyticsTab
            clientes={clientes}
          />
        )}

        {activeTab === 'alertas' && (
          <AvisosTab
            empresa={empresa}
            esAdmin={currentUser.rol === 'admin'}
            items={itemsAvisos}
            alertas={alertas}
            personalizados={avisosPersonalizados}
            notificaciones={notificaciones}
            clientes={clientes}
            vehiculos={vehiculos}
            hoy={hoyLocal()}
            onEnviarCorreo={handleEnviarCorreoAviso}
            onAvisoManual={handleAvisoManual}
            onRenovar={handleRenovarVencimiento}
            onDescartar={handleDescartarAviso}
            onCrearAviso={handleCrearAviso}
            onAnotarAceite={handleAnotarAceite}
            onAbrirOrden={(numero) => irA('taller', { tipo: 'buscar', texto: numero })}
            onActivarAutomatico={async () => { try { await handleSaveEmpresa({ recordatoriosAutomaticosActivos: true }); } catch (err) { avisarError(err, 'No se pudo activar los envíos automáticos.'); } }}
            onAbrirAjustes={() => { setSettingsTab('recordatorios'); setSettingsOpen(true); }}
          />
        )}

        {activeTab === 'facturas' && (
          <FacturasTab
            intencion={intencion}
            clientes={clientes}
            vehiculos={vehiculos}
            empresa={empresa}
            onAddFactura={handleAddFactura}
            onUpdateFactura={handleUpdateFactura}
            onDeleteFactura={handleDeleteFactura}
            onEmitirFactura={handleEmitirFactura}
            onCambiarEstadoFactura={handleCambiarEstadoFactura}
            puedeVerCompras={activeModulos.includes('compras')}
          />
        )}

        {activeTab === 'compras' && (
          <ComprasTab productos={productos} onStockCambiado={recargarProductos} empresa={empresa} clientes={clientes} puedeFacturas={activeModulos.includes('facturas')} vistaInicial={comprasVista} onPagosCambiados={() => void recargarPagos()} intencion={intencion} />
        )}

        {activeTab === 'inventario' && (
          <InventarioTab
            productos={productos}
            onAddProducto={handleAddProducto}
            onUpdateProducto={handleUpdateProducto}
            onDeleteProducto={handleDeleteProducto}
            onRegistrarMovimiento={handleRegistrarMovimiento}
            onImportado={recargarProductos}
          />
        )}
        </Suspense>
  );

  const superpuestos = (
    <>
      {aviso && (
        <div
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`print:hidden fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[92%] max-w-lg rounded-2xl border shadow-xl px-4 py-3 text-xs font-semibold flex items-start gap-3 ${aviso.tipo === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          <span className="flex-1 break-words">{aviso.mensaje}</span>
          {aviso.soloLectura && currentUser.rol === 'admin' && (
            <button onClick={() => { setAviso(null); setSuscripcionOpen(true); }} className="shrink-0 px-3 py-1.5 rounded-xl bg-white border border-rose-200 font-bold hover:bg-rose-100 transition cursor-pointer">Suscribirme</button>
          )}
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="shrink-0 font-bold opacity-70 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      <Suspense fallback={null}>
      {seguridadOpen && <SeguridadModal onClose={() => setSeguridadOpen(false)} />}
      {suscripcionOpen && suscripcion && (
        <SuscripcionPanel suscripcion={suscripcion} esAdmin={currentUser.rol === 'admin'} empresa={empresa} onEmpresaActualizada={setEmpresa} onClose={() => setSuscripcionOpen(false)} />
      )}

      {settingsOpen && (
        <CompanySettingsPanel
          config={empresa}
          pestanaInicial={settingsTab}
          onSave={handleSaveEmpresa}
          onClose={() => { setSettingsOpen(false); setSettingsTab(undefined); }}
        />
      )}

      {adminPanelOpen && (
        <AdminPanel
          currentUser={currentUser}
          onClose={() => setAdminPanelOpen(false)}
        />
      )}
      </Suspense>
    </>
  );

  // El marco: menú con texto, buscador, «Nuevo» y menú de la cuenta; dentro, la pestaña activa.
  return (
    <>
      <Suspense fallback={<Cargando pantallaCompleta />}>
        <Marco
          empresa={empresa}
          usuario={currentUser}
          modulos={activeModulos}
          activo={activeTab}
          onIr={irA}
          alertasActivas={avisosParaHoy}
          pagos={{ n: pagosAvisoCount, vencidas: !!pagosProv && pagosProv.vencidas.n > 0 }}
          datos={{ clientes, vehiculos, ordenes: ordenesTrabajo }}
          avisos={avisosPago}
          amplio={activeTab === 'taller' && tallerVistaAmplia}
          mostrarSuscripcion={!!suscripcion && suscripcion.estado !== 'sin_limite'}
          onSeguridad={() => setSeguridadOpen(true)}
          onSuscripcion={() => setSuscripcionOpen(true)}
          onAdmin={() => setAdminPanelOpen(true)}
          onConfiguracion={() => setSettingsOpen(true)}
          tema={tema}
          oscuro={oscuro}
          onTema={cambiarTema}
          onCerrarSesion={handleLogout}
        >
          {contenido}
        </Marco>
      </Suspense>
      {superpuestos}
    </>
  );
}
