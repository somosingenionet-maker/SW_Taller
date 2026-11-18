import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CreditCard, LogOut, Menu, Moon, Palette, Plus, Search, Settings, Shield, ShieldCheck, Sun, SunMoon } from 'lucide-react';
import type { Cliente, Empresa, ModuloId, OrdenTrabajo, Perfil, Vehiculo } from '../types';
import { derivarMarca, normalizarHex } from './colorMarca';
import { atajosMovil, construirMenu, opcionesNuevo, type AccionNuevo, type ResultadoBusqueda } from './navegacion';
import { Icono } from './iconos';
import { Boton, Ventana } from './componentes';
import Buscador from './Buscador';
import ColorYAspecto from './ColorYAspecto';
import type { Tema } from './tema';

/** Lo que el marco le pide a la aplicación: ir a una pestaña, opcionalmente con una orden («nuevo» o «buscar») para ella. */
export type IrA = (tab: ModuloId, orden?: { tipo: 'nuevo' | 'buscar'; texto?: string; modo?: 'recibido' | 'presupuesto' }) => void;

interface Props {
  empresa: Empresa;
  usuario: Perfil;
  modulos: ModuloId[];
  activo: ModuloId;
  onIr: IrA;
  alertasActivas: number;
  pagos: { n: number; vencidas: boolean };
  datos: { clientes: Cliente[]; vehiculos: Vehiculo[]; ordenes: OrdenTrabajo[] };
  /** Franjas de aviso (suscripción, pago recibido…) que se muestran arriba del contenido. */
  avisos?: ReactNode;
  /** El taller (tablero) pide más ancho. */
  amplio?: boolean;
  mostrarSuscripcion: boolean;
  onSeguridad: () => void;
  onSuscripcion: () => void;
  onAdmin: () => void;
  onConfiguracion: () => void;
  onGuardarColor: (hex: string) => Promise<void>;
  /** Aspecto elegido por la persona y si se está pintando en oscuro ahora mismo. */
  tema: Tema;
  oscuro: boolean;
  onTema: (t: Tema) => void;
  onCerrarSesion: () => void;
  children: ReactNode;
}

function usePopover() {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);
  return { abierto, setAbierto, ref };
}

const ASPECTOS: [Tema, string, typeof Sun][] = [['claro', 'Claro', Sun], ['oscuro', 'Oscuro', Moon], ['auto', 'Auto', SunMoon]];

const ACCION_A_ORDEN: Record<AccionNuevo, string> = { ot: 'taller', presupuesto: 'taller', cita: 'citas', cliente: 'clientes', vehiculo: 'vehiculos', factura: 'facturas', compra: 'compras' };

/** El marco del nuevo diseño: menú por tareas con texto (barra inferior en el móvil), buscador Ctrl K, botón «Nuevo» y menú de la cuenta. */
export default function Marco(p: Props) {
  const { empresa, usuario, modulos, activo, onIr } = p;
  const esAdmin = usuario.rol === 'admin';
  const menu = useMemo(() => construirMenu(modulos), [modulos]);
  const atajos = useMemo(() => atajosMovil(modulos), [modulos]);
  const nuevos = useMemo(() => opcionesNuevo(modulos), [modulos]);
  const [buscando, setBuscando] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);
  const [colorAbierto, setColorAbierto] = useState(false);
  const nuevo = usePopover();
  const cuenta = usePopover();
  const permitidos = useMemo(() => ({ taller: modulos.includes('taller'), vehiculos: modulos.includes('vehiculos'), clientes: modulos.includes('clientes') }), [modulos]);

  // Ctrl K / ⌘ K abre el buscador desde cualquier pantalla.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscando((b) => !b); }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  const elegirBusqueda = useCallback((r: ResultadoBusqueda) => { setBuscando(false); onIr(r.modulo, { tipo: 'buscar', texto: r.busqueda }); }, [onIr]);
  const insignia = (id: ModuloId): { n: number; clase: string; etiqueta: string } | null => {
    if (id === 'alertas' && p.alertasActivas > 0) return { n: p.alertasActivas, clase: 'alerta', etiqueta: `${p.alertasActivas} activas` };
    if (id === 'compras' && p.pagos.n > 0) return { n: p.pagos.n, clase: p.pagos.vencidas ? 'alerta' : 'aviso', etiqueta: `${p.pagos.n} pagos a proveedores pendientes` };
    return null;
  };

  const marca = useMemo(() => derivarMarca(normalizarHex(empresa.brandColor) ?? '#E8590C', p.oscuro), [empresa.brandColor, p.oscuro]);
  const iniciales = (usuario.nombre || '?').trim()[0]?.toUpperCase() ?? '?';

  const botonNav = (id: ModuloId, etiqueta: string, cerrar?: boolean) => {
    const ins = insignia(id);
    return (
      <button key={id} type="button" className="u-nav" aria-current={activo === id ? 'page' : undefined} aria-label={ins ? `${etiqueta}, ${ins.etiqueta}` : undefined}
        onClick={() => { onIr(id); if (cerrar) setMasAbierto(false); }} data-testid={`nav-${id}`}>
        <Icono id={menu.flatMap((s) => s.items).find((i) => i.id === id)!.icono} />
        {etiqueta}
        {ins && <span className={`u-n ${ins.clase}`} data-testid={id === 'compras' ? 'contador-pagos' : undefined} aria-hidden="true">{ins.n}</span>}
      </button>
    );
  };

  const itemCuenta = (icono: ReactNode, texto: string, accion: () => void, extra = '') => (
    <button type="button" role="menuitem" className={extra} onClick={() => { cuenta.setAbierto(false); setMasAbierto(false); accion(); }}>{icono}{texto}</button>
  );

  return (
    <div className="u-app" style={{ '--u-brand': marca.boton, '--u-on-brand': marca.sobreBoton, '--u-brand-ink': marca.tinta } as React.CSSProperties} data-testid="marco-nuevo">
      <nav className="u-rail" aria-label="Menú principal">
        <div className="u-logo"><span className="u-logo-marca" aria-hidden="true" />Doonty</div>
        <div className="u-taller" title={empresa.nombre}>{empresa.nombre}</div>
        {menu.map((s) => (
          <div key={s.titulo} role="group" aria-label={s.titulo}>
            <div className="u-seccion" aria-hidden="true">{s.titulo}</div>
            {s.items.map((i) => botonNav(i.id, i.etiqueta))}
          </div>
        ))}
        <div className="u-crece" />
      </nav>

      <div className="u-col">
        <div className={`u-top${p.amplio ? ' amplio' : ''}`}>
          <button type="button" className="u-buscar" onClick={() => setBuscando(true)} aria-label="Buscar matrícula, cliente u orden" data-testid="abrir-buscador">
            <Search aria-hidden="true" style={{ width: 18, height: 18, flex: 'none' }} />
            <span>Buscar matrícula, cliente u orden</span>
            <kbd aria-hidden="true">Ctrl K</kbd>
          </button>

          {nuevos.length > 0 && (
            <div className="u-rel" ref={nuevo.ref}>
              <Boton variante="principal" onClick={() => { cuenta.setAbierto(false); nuevo.setAbierto(!nuevo.abierto); }} aria-haspopup="menu" aria-expanded={nuevo.abierto} aria-label="Nuevo" data-testid="boton-nuevo">
                <Plus /><span className="u-texto">Nuevo</span>
              </Boton>
              {nuevo.abierto && (
                <div className="u-menu" role="menu" aria-label="Crear">
                  {nuevos.map((o) => (
                    <button key={o.accion} type="button" role="menuitem" onClick={() => { nuevo.setAbierto(false); onIr(ACCION_A_ORDEN[o.accion] as ModuloId, { tipo: 'nuevo', modo: o.accion === 'presupuesto' ? 'presupuesto' : 'recibido' }); }} data-testid={`nuevo-${o.accion}`}>
                      <Icono id={o.accion === 'ot' ? 'taller' : o.accion === 'presupuesto' ? 'facturas' : o.accion === 'cita' ? 'citas' : o.accion === 'cliente' ? 'clientes' : o.accion === 'vehiculo' ? 'vehiculos' : o.accion === 'factura' ? 'facturas' : 'compras'} />{o.etiqueta}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="u-rel" ref={cuenta.ref}>
            <Boton soloIcono onClick={() => { nuevo.setAbierto(false); cuenta.setAbierto(!cuenta.abierto); }} aria-haspopup="menu" aria-expanded={cuenta.abierto} aria-label="Mi cuenta" data-testid="menu-cuenta">
              <span className="u-avatar" aria-hidden="true">{iniciales}</span>
            </Boton>
            {cuenta.abierto && (
              <div className="u-menu" role="menu" aria-label="Mi cuenta">
                <div className="u-quien"><b>{usuario.nombre}</b>{esAdmin ? 'Administrador' : 'Equipo'} · {empresa.nombre}</div>
                <hr />
                {itemCuenta(<ShieldCheck />, 'Seguridad de la cuenta', p.onSeguridad)}
                {esAdmin && p.mostrarSuscripcion && itemCuenta(<CreditCard />, 'Suscripción', p.onSuscripcion)}
                {esAdmin && itemCuenta(<Shield />, 'Panel de administración', p.onAdmin)}
                {esAdmin && itemCuenta(<Settings />, 'Configuración de empresa', p.onConfiguracion)}
                {esAdmin && itemCuenta(<Palette />, 'Color y aspecto', () => setColorAbierto(true))}
                <hr />
                <div className="u-aspecto" role="group" aria-label="Aspecto">
                  {ASPECTOS.map(([id, texto, Ico]) => (
                    <button key={id} type="button" aria-pressed={p.tema === id} onClick={() => p.onTema(id)} data-testid={`tema-${id}`}><Ico aria-hidden="true" />{texto}</button>
                  ))}
                </div>
                <hr />
                {itemCuenta(<LogOut />, 'Cerrar sesión', p.onCerrarSesion)}
              </div>
            )}
          </div>
        </div>

        <div className="u-scroll">
          <div className={`u-contenido${p.amplio ? ' amplio' : ''}`}>
            {p.avisos && <div className="u-avisos">{p.avisos}</div>}
            <main>{p.children}</main>
            <footer className="u-pie">
              © 2026 Doonty — Desarrollado por <a href="https://www.somosingenio.net" target="_blank" rel="noopener noreferrer">InGenio</a>. Reservados todos los derechos.
              {' · '}<a href="/privacidad">Privacidad</a>{' · '}<a href="/terminos">Términos</a>{' · '}<a href="/declaracion-responsable">Declaración responsable</a>{' · '}<a href="/encargo-de-tratamiento">Encargo de tratamiento</a>
            </footer>
          </div>
        </div>
      </div>

      <nav className="u-tab" aria-label="Menú principal (móvil)">
        {atajos.map((i) => (
          <button key={i.id} type="button" aria-current={activo === i.id ? 'page' : undefined} onClick={() => onIr(i.id)} data-testid={`tab-${i.id}`}>
            <Icono id={i.icono} />{i.etiqueta}
          </button>
        ))}
        <button type="button" onClick={() => setMasAbierto(true)} aria-haspopup="dialog" data-testid="tab-mas"><Menu />Más</button>
      </nav>

      {masAbierto && (
        <Ventana titulo="Menú" onCerrar={() => setMasAbierto(false)}>
          {menu.map((s) => (
            <div key={s.titulo}>
              <div className="u-seccion">{s.titulo}</div>
              {s.items.map((i) => botonNav(i.id, i.etiqueta, true))}
            </div>
          ))}
          <div className="u-seccion">Mi cuenta</div>
          <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); p.onSeguridad(); }}><ShieldCheck />Seguridad de la cuenta</button>
          {esAdmin && p.mostrarSuscripcion && <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); p.onSuscripcion(); }}><CreditCard />Suscripción</button>}
          {esAdmin && <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); p.onAdmin(); }}><Shield />Panel de administración</button>}
          {esAdmin && <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); p.onConfiguracion(); }}><Settings />Configuración de empresa</button>}
          {esAdmin && <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); setColorAbierto(true); }}><Palette />Color y aspecto</button>}
          <div className="u-aspecto" role="group" aria-label="Aspecto">
            {ASPECTOS.map(([id, texto, Ico]) => (
              <button key={id} type="button" aria-pressed={p.tema === id} onClick={() => p.onTema(id)}><Ico aria-hidden="true" />{texto}</button>
            ))}
          </div>
          <button type="button" className="u-nav" onClick={() => { setMasAbierto(false); p.onCerrarSesion(); }}><LogOut />Cerrar sesión</button>
        </Ventana>
      )}

      {buscando && <Buscador datos={p.datos} permitidos={permitidos} onElegir={elegirBusqueda} onCerrar={() => setBuscando(false)} />}
      {colorAbierto && <ColorYAspecto colorActual={empresa.brandColor} onGuardar={p.onGuardarColor} onCerrar={() => setColorAbierto(false)} />}
    </div>
  );
}

