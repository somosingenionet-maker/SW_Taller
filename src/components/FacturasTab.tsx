import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Trash2, Edit2, X, Check, Receipt, Import, Printer, MessageCircle, Mail as MailIcon, Send, Download, ChevronDown, ChevronRight as ChevronRightIcon, FileText } from 'lucide-react';
import { Factura, LineaDocumento, Cliente, Vehiculo, Empresa } from '../types';
import {
  FacturasResumen, FacturaPeriodo, AgrupacionFacturas,
  getFacturasResumen, getFacturasPorPeriodo, listFacturasPaginado, rangoDeClavePeriodo, listFacturas,
} from '../lib/data/facturas';
import { listOrdenesFacturables, OrdenFacturable } from '../lib/data/ordenes';
import { formatDate } from '../utils/dateFormat';
import { downloadCsv } from '../utils/csvExport';
import ConfirmDialog from './ConfirmDialog';
import Pagination from './Pagination';
import QRCode from 'qrcode';

interface FacturasTabProps {
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  empresa: Empresa;
  onAddFactura: (f: Factura) => Promise<void>;
  onUpdateFactura: (f: Factura) => Promise<void>;
  onDeleteFactura: (id: string) => Promise<void>;
  onEmitirFactura: (id: string) => Promise<void>;
  onCambiarEstadoFactura: (id: string, estado: Factura['estado']) => Promise<void>;
}

const ESTADO_FACTURA_LABELS: Record<Factura['estado'], string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  pagada: 'Pagada',
  vencida: 'Vencida',
  cancelada: 'Cancelada',
};

const ESTADO_FACTURA_COLORS: Record<Factura['estado'], string> = {
  borrador: 'bg-slate-100 text-slate-600',
  emitida: 'bg-blue-100 text-blue-700',
  pagada: 'bg-green-100 text-green-700',
  vencida: 'bg-red-100 text-red-700',
  cancelada: 'bg-slate-200 text-slate-500',
};

// Transiciones administrativas válidas una vez emitida (debe reflejar el
// trigger emitir_y_proteger_factura en la migración SQL). El paso
// borrador -> emitida no está aquí: tiene su propia acción dedicada
// ("Emitir factura"), no pasa por este selector.
const TRANSICIONES_VALIDAS: Partial<Record<Factura['estado'], Factura['estado'][]>> = {
  emitida: ['pagada', 'vencida', 'cancelada'],
  vencida: ['pagada', 'cancelada'],
};

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un borrador todavía no tiene número real (se asigna al emitir) — no mostrar el marcador interno. */
const numeroMostrado = (f: Pick<Factura, 'numero' | 'estado'>) => f.estado === 'borrador' ? 'Borrador' : f.numero;

const calcLineTotals = (lines: LineaDocumento[], ivaPct: number) => {
  const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const totalIva = subtotal * (ivaPct / 100);
  return { subtotal, totalIva, total: subtotal + totalIva };
};

const genId = (prefix: string) => `${prefix}-${Date.now()}`;

type Agrupacion = AgrupacionFacturas | 'ninguna';

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Traduce la clave que devuelve getFacturasPorPeriodo (calculada en SQL) a una etiqueta legible. */
function labelDePeriodo(agrupacion: AgrupacionFacturas, clave: string): string {
  if (agrupacion === 'año') return clave;
  if (agrupacion === 'mes') {
    const [anio, mes] = clave.split('-');
    return `${MESES_LARGO[Number(mes) - 1]} ${anio}`;
  }
  const inicio = new Date(clave + 'T00:00:00');
  const fin = new Date(inicio);
  fin.setDate(fin.getDate() + 6);
  return `${inicio.getDate()} ${MESES_CORTO[inicio.getMonth()]} – ${fin.getDate()} ${MESES_CORTO[fin.getMonth()]} ${fin.getFullYear()}`;
}

/** Código QR de verificación VeriFactu, generado en el propio navegador (sin llamadas de red). */
function FacturaQR({ url }: { url: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(url, { width: 110, margin: 1 })
      .then((d) => { if (mounted) setDataUrl(d); })
      .catch(() => { /* si falla la generación, simplemente no se muestra el QR */ });
    return () => { mounted = false; };
  }, [url]);

  if (!dataUrl) return null;
  return <img src={dataUrl} alt="Código QR de verificación VeriFactu" className="w-[110px] h-[110px] shrink-0" />;
}

/**
 * Contenido imprimible de una factura — extraído para reutilizarse tanto en
 * el visor de una sola factura como en la descarga de un grupo entero
 * (varias seguidas, cada una en su propia página al imprimir).
 */
function FacturaPrintable({
  f, empresa, clientes, vehiculos, saltoDePagina,
}: {
  f: Factura; empresa: Empresa; clientes: Cliente[]; vehiculos: Vehiculo[];
  /** true si debe forzar salto de página después (para que la siguiente factura del grupo empiece en hoja nueva). */
  saltoDePagina?: boolean;
}) {
  // Una factura ya emitida siempre muestra el cliente tal como estaba al
  // emitirla (clienteSnapshot), no el registro actual — que puede haber
  // cambiado de dirección o haberse anonimizado después. Un borrador
  // todavía no tiene snapshot (se puede seguir editando, incluso cambiar
  // de cliente), así que ese caso sigue resolviéndose en vivo.
  const cli = f.clienteSnapshot ?? clientes.find(c => c.id === f.clienteId);
  const veh = vehiculos.find(v => v.id === f.vehiculoId);

  return (
    <div className={`max-w-3xl mx-auto my-8 bg-white shadow-xl rounded-2xl print:shadow-none print:rounded-none print:my-0 print:max-w-none ${saltoDePagina ? 'print:break-after-page' : ''}`}>
      <div className="p-10 space-y-6 text-slate-800 font-sans">
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FACTURA</p>
            <p className="text-2xl font-black font-mono text-blue-600">{numeroMostrado(f)}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_FACTURA_COLORS[f.estado]}`}>{ESTADO_FACTURA_LABELS[f.estado]}</span>
          </div>
        </div>

        <div className="flex justify-between text-xs text-slate-500 font-semibold border-b border-slate-100 pb-3">
          <span>Fecha emisión: {formatDate(f.fecha)}</span>
          <span>Fecha vencimiento: {formatDate(f.fechaVencimiento)}</span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1 text-xs">
            <p className="text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-100 pb-1">Emisor</p>
            <p className="font-bold text-slate-800">{empresa.nombre}</p>
            {empresa.razonSocial && <p className="text-slate-500">{empresa.razonSocial}</p>}
            {empresa.nif && <p className="text-slate-500 font-mono">NIF: {empresa.nif}</p>}
            {empresa.ciudad && <p className="text-slate-500">{empresa.ciudad}</p>}
            {empresa.correo && <p className="text-slate-500">{empresa.correo}</p>}
            {empresa.telefono && <p className="text-slate-500">{empresa.telefono}</p>}
          </div>
          <div className="space-y-1 text-xs">
            <p className="text-[10px] font-extrabold uppercase text-slate-400 border-b border-slate-100 pb-1">Cliente</p>
            {cli ? (
              <>
                <p className="font-bold text-slate-800">{cli.nombre} {cli.apellidos}</p>
                <p className="text-slate-500">DNI/NIE/Pasaporte: {cli.nifNiePasaporte}</p>
                {cli.correo && <p className="text-slate-500">{cli.correo}</p>}
                {cli.telefono && <p className="text-slate-500">{cli.telefono}</p>}
                {cli.direccion && <p className="text-slate-500">{cli.direccion}</p>}
                {(cli.ciudad || cli.pais) && <p className="text-slate-500">{[cli.ciudad, cli.pais].filter(Boolean).join(' · ')}</p>}
              </>
            ) : (
              <p className="text-rose-500 italic">Cliente no encontrado</p>
            )}
          </div>
        </div>

        {veh && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-1">
            <p className="text-[10px] font-extrabold uppercase text-slate-400 pb-1 border-b border-slate-200">Vehículo</p>
            <p className="font-bold text-slate-800">{veh.marca} {veh.modelo}</p>
            <p className="text-slate-500 font-mono">Matrícula: {veh.matricula} · Bastidor: {veh.bastidor}</p>
          </div>
        )}

        <div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="text-left px-3 py-2 font-bold rounded-tl-lg">Descripción</th>
                <th className="text-center px-3 py-2 font-bold w-16">Cant.</th>
                <th className="text-right px-3 py-2 font-bold w-24">P. Unit.</th>
                <th className="text-right px-3 py-2 font-bold w-24 rounded-tr-lg">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {f.lineas.map((l, i) => (
                <tr key={l.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="px-3 py-2 text-slate-700">{l.descripcion}</td>
                  <td className="px-3 py-2 text-center text-slate-600">{l.cantidad}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-600">{fmt(l.precioUnitario)} €</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">{fmt(l.subtotal)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-56 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-mono">{fmt(f.subtotal)} €</span></div>
            <div className="flex justify-between text-slate-600"><span>IVA ({f.ivaPct}%)</span><span className="font-mono">{fmt(f.totalIva)} €</span></div>
            <div className="flex justify-between font-extrabold text-slate-900 border-t border-slate-200 pt-1.5 text-sm"><span>TOTAL</span><span className="font-mono">{fmt(f.total)} €</span></div>
          </div>
        </div>

        {f.notas && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-slate-700">
            <p className="font-bold text-amber-700 mb-1 uppercase text-[10px]">Notas</p>
            <p>{f.notas}</p>
          </div>
        )}

        {empresa.facturaMostrarQr && f.qrUrl && (
          <div className="flex items-center gap-4 border-t border-slate-200 pt-4">
            <FacturaQR url={f.qrUrl} />
            <div className="text-[10px] text-slate-400 space-y-1 min-w-0">
              <p className="font-bold text-slate-500">Factura verificable — VeriFactu</p>
              {f.hash && <p className="font-mono break-all">Huella: {f.hash}</p>}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 text-[10px] text-slate-400 text-center">
          {empresa.nombre} · {empresa.correo} · {empresa.telefono}
        </div>
      </div>
    </div>
  );
}

// -------- Factura Modal --------
interface FacturaModalProps {
  factura: Factura | null;
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  onSave: (f: Factura) => void;
  onClose: () => void;
}

function FacturaModal({ factura, clientes, vehiculos, onSave, onClose }: FacturaModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const [clienteId, setClienteId] = useState(factura?.clienteId ?? '');
  const [vehiculoId, setVehiculoId] = useState(factura?.vehiculoId ?? '');
  const [fecha, setFecha] = useState(factura?.fecha ?? today);
  const [fechaVencimiento, setFechaVencimiento] = useState(factura?.fechaVencimiento ?? thirtyDays);
  const [lineas, setLineas] = useState<LineaDocumento[]>(factura?.lineas ?? []);
  const [ivaPct, setIvaPct] = useState(factura?.ivaPct ?? 21);
  const [notas, setNotas] = useState(factura?.notas ?? '');
  const [importarOpen, setImportarOpen] = useState(false);
  const [selectedOts, setSelectedOts] = useState<Set<string>>(new Set());
  const [otIds, setOtIds] = useState<string[]>(factura?.otIds ?? []);
  const [error, setError] = useState('');

  const clienteVehiculos = useMemo(() => {
    if (!clienteId) return [];
    const cli = clientes.find(c => c.id === clienteId);
    if (!cli || !cli.vehiculosAsociados?.length) return [];
    return vehiculos.filter(v => cli.vehiculosAsociados!.includes(v.id));
  }, [clienteId, clientes, vehiculos]);

  // OT del vehículo seleccionado, ya finalizadas (listo/entregado) y con
  // líneas — se piden solo al elegir el vehículo, no hace falta el
  // histórico completo de OTs de la empresa para este modal.
  const [vehOTs, setVehOTs] = useState<OrdenFacturable[]>([]);
  const [vehOTsCargando, setVehOTsCargando] = useState(false);
  useEffect(() => {
    if (!vehiculoId) { setVehOTs([]); return; }
    setVehOTsCargando(true);
    listOrdenesFacturables(vehiculoId).then(setVehOTs).catch(() => setVehOTs([])).finally(() => setVehOTsCargando(false));
  }, [vehiculoId]);

  const totals = useMemo(() => calcLineTotals(lineas, ivaPct), [lineas, ivaPct]);

  const addLine = () => {
    setLineas(prev => [...prev, { id: genId('linea'), descripcion: '', cantidad: 1, precioUnitario: 0, subtotal: 0 }]);
  };

  const updateLine = (id: string, field: keyof LineaDocumento, val: string | number) => {
    setLineas(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: val };
      updated.subtotal = updated.cantidad * updated.precioUnitario;
      return updated;
    }));
  };

  const removeLine = (id: string) => setLineas(prev => prev.filter(l => l.id !== id));

  const importarDesdetaller = () => {
    const nuevas: LineaDocumento[] = vehOTs
      .filter(ot => selectedOts.has(ot.id))
      .flatMap(ot => ot.lineas.map(l => ({
        id: genId('linea'),
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        subtotal: l.subtotal,
      })));
    setLineas(prev => [...prev, ...nuevas]);
    setOtIds(prev => Array.from(new Set([...prev, ...selectedOts])));
    setSelectedOts(new Set());
    setImportarOpen(false);
  };

  const handleSave = () => {
    if (!clienteId) { setError('Selecciona un cliente.'); return; }
    if (lineas.length === 0) { setError('Añade al menos una línea.'); return; }
    const { subtotal, totalIva, total } = totals;
    // Este modal solo crea o edita borradores — emitir es una acción aparte
    // (botón "Emitir factura" en la tabla) porque a partir de ahí la
    // factura queda inmutable. `numero` y `createdAt` son valores locales
    // sin efecto: el servidor los asigna al crear y nunca se reenvían al
    // editar (ver toRow() en lib/data/facturas.ts).
    const saved: Factura = {
      id: factura?.id ?? genId('fac'),
      numero: factura?.numero ?? '',
      createdAt: factura?.createdAt ?? new Date().toISOString(),
      clienteId,
      vehiculoId: vehiculoId || undefined,
      otIds,
      fecha,
      fechaVencimiento,
      estado: 'borrador',
      lineas,
      notas,
      subtotal,
      ivaPct,
      totalIva,
      total,
    };
    onSave(saved);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-modal-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-4 h-4 text-slate-300" />
            <span className="font-bold text-sm">
              {factura ? `Editar Factura ${numeroMostrado(factura)}` : 'Nueva Factura'}
            </span>
            {!factura && <span className="text-[10px] text-slate-400 font-medium">— el número se asigna al guardar</span>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-xl"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cliente *</label>
              <select value={clienteId} onChange={e => { setClienteId(e.target.value); setVehiculoId(''); }} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— Seleccionar —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre} {c.apellidos}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Vehículo (opcional)</label>
              <select value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" disabled={!clienteId}>
                <option value="">— Ninguno —</option>
                {clienteVehiculos.map(v => <option key={v.id} value={v.id}>{v.marca} {v.modelo} — {v.matricula}</option>)}
              </select>
              {clienteId && clienteVehiculos.length === 0 && (
                <p className="text-[11px] text-amber-600 mt-1">Este cliente no tiene vehículos asociados. Asócialos desde CRM &gt; Clientes.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha emisión</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha vencimiento</label>
              <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          {/* Líneas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700">Líneas *</label>
              <div className="flex gap-2">
                {vehiculoId && (
                  <button onClick={() => setImportarOpen(v => !v)} className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline">
                    <Import className="w-3.5 h-3.5" /> Importar del taller
                  </button>
                )}
                <button onClick={addLine} className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Añadir línea
                </button>
              </div>
            </div>

            {importarOpen && (
              <div className="mb-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
                <p className="text-[11px] font-bold text-slate-600 uppercase">Selecciona órdenes de trabajo a importar</p>
                {vehOTsCargando ? (
                  <p className="text-[11px] text-slate-400 italic">Cargando órdenes de trabajo…</p>
                ) : vehOTs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Este vehículo no tiene órdenes de trabajo finalizadas (listo/entregado) con líneas facturables.</p>
                ) : (
                  <>
                    {vehOTs.map(ot => (
                      <label key={ot.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-white rounded px-1 py-0.5">
                        <input type="checkbox" checked={selectedOts.has(ot.id)} onChange={e => {
                          const s = new Set(selectedOts);
                          e.target.checked ? s.add(ot.id) : s.delete(ot.id);
                          setSelectedOts(s);
                        }} />
                        <span>{ot.numero} · {ot.lineas.length} línea{ot.lineas.length !== 1 ? 's' : ''} — {fmt(ot.total)} €</span>
                      </label>
                    ))}
                    <button onClick={importarDesdetaller} disabled={selectedOts.size === 0} className="mt-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-xl disabled:opacity-40">
                      Importar seleccionadas
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              {lineas.map(l => (
                <div key={l.id} className="grid grid-cols-12 gap-1.5 items-center">
                  <input className="col-span-5 border border-slate-200 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Descripción" value={l.descripcion} onChange={e => updateLine(l.id, 'descripcion', e.target.value)} />
                  <input type="number" min="1" className="col-span-2 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Cant." value={l.cantidad} onChange={e => updateLine(l.id, 'cantidad', parseFloat(e.target.value) || 0)} />
                  <input type="number" min="0" step="0.01" className="col-span-2 border border-slate-200 rounded-xl px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Precio" value={l.precioUnitario} onChange={e => updateLine(l.id, 'precioUnitario', parseFloat(e.target.value) || 0)} />
                  <div className="col-span-2 text-right text-xs font-semibold text-slate-700 px-1">{fmt(l.subtotal)} €</div>
                  <button onClick={() => removeLine(l.id)} className="col-span-1 p-1 text-slate-300 hover:text-rose-500 transition"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {lineas.length === 0 && <p className="text-xs text-slate-400 italic py-2">Sin líneas. Añade una o importa del taller.</p>}
            </div>
          </div>

          {/* Totales */}
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} value={notas} onChange={e => setNotas(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-600">IVA %</label>
              <input type="number" min="0" max="100" value={ivaPct} onChange={e => setIvaPct(parseFloat(e.target.value) || 0)} className="w-16 border border-slate-200 rounded-xl px-2 py-1 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div className="bg-slate-50 rounded-2xl p-3 space-y-1.5 border border-slate-100">
              <div className="flex justify-between text-xs text-slate-600"><span>Subtotal</span><span className="font-semibold">{fmt(totals.subtotal)} €</span></div>
              <div className="flex justify-between text-xs text-slate-600"><span>IVA ({ivaPct}%)</span><span className="font-semibold">{fmt(totals.totalIva)} €</span></div>
              <div className="flex justify-between text-sm font-bold text-slate-800 border-t border-slate-200 pt-1.5"><span>Total</span><span>{fmt(totals.total)} €</span></div>
            </div>
          </div>

          {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-100 transition cursor-pointer">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition flex items-center gap-1.5 cursor-pointer">
            <Check className="w-3.5 h-3.5" /> Guardar factura
          </button>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 20;

// -------- Main FacturasTab --------
export default function FacturasTab({
  clientes, vehiculos, empresa,
  onAddFactura, onUpdateFactura, onDeleteFactura, onEmitirFactura, onCambiarEstadoFactura,
}: FacturasTabProps) {
  const [facturaModal, setFacturaModal] = useState<{ open: boolean; factura: Factura | null }>({ open: false, factura: null });
  const [viewingDoc, setViewingDoc] = useState<Factura | null>(null);
  const [confirmEmitir, setConfirmEmitir] = useState<Factura | null>(null);
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('ninguna');
  const [viewingGrupo, setViewingGrupo] = useState<{ label: string; facturas: Factura[] } | null>(null);
  const [descargandoGrupo, setDescargandoGrupo] = useState<string | null>(null);

  // Los totales (tarjetas KPI) y los grupos por período se calculan en el
  // servidor (RPC) — no dependen de traer todas las facturas al navegador.
  const [resumen, setResumen] = useState<FacturasResumen | null>(null);
  const [grupos, setGrupos] = useState<FacturaPeriodo[] | null>(null);
  // Vista agrupada: el grupo abierto es el único cuyas facturas se traen y
  // muestran — los demás solo enseñan su recuento/total hasta que se abren.
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);

  const [pagina, setPagina] = useState(1);
  const [filas, setFilas] = useState<Factura[]>([]);
  const [totalFilas, setTotalFilas] = useState(0);
  const [cargandoFilas, setCargandoFilas] = useState(true);

  const cargarResumen = useCallback(() => {
    getFacturasResumen().then(setResumen).catch(() => {});
  }, []);

  const cargarGrupos = useCallback((agr: Agrupacion) => {
    if (agr === 'ninguna') { setGrupos(null); return; }
    getFacturasPorPeriodo(agr).then(setGrupos).catch(() => setGrupos([]));
  }, []);

  const cargarFilas = useCallback((agr: Agrupacion, grupo: string | null, pag: number) => {
    if (agr !== 'ninguna' && !grupo) {
      setFilas([]);
      setTotalFilas(0);
      setCargandoFilas(false);
      return;
    }
    setCargandoFilas(true);
    const rangoFecha = agr !== 'ninguna' && grupo ? rangoDeClavePeriodo(agr, grupo) : undefined;
    listFacturasPaginado({ limit: PAGE_SIZE, offset: (pag - 1) * PAGE_SIZE, rangoFecha })
      .then(({ data, count }) => { setFilas(data); setTotalFilas(count); })
      .catch(() => { setFilas([]); setTotalFilas(0); })
      .finally(() => setCargandoFilas(false));
  }, []);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  useEffect(() => { cargarGrupos(agrupacion); }, [agrupacion, cargarGrupos]);
  useEffect(() => { cargarFilas(agrupacion, grupoAbierto, pagina); }, [agrupacion, grupoAbierto, pagina, cargarFilas]);

  const recargarTodo = () => {
    cargarResumen();
    cargarGrupos(agrupacion);
    cargarFilas(agrupacion, grupoAbierto, pagina);
  };

  const cambiarAgrupacion = (a: Agrupacion) => {
    setAgrupacion(a);
    setGrupoAbierto(null);
    setPagina(1);
  };

  const abrirGrupo = (clave: string) => {
    setGrupoAbierto(prev => (prev === clave ? null : clave));
    setPagina(1);
  };

  const nombreCliente = (id: string) => {
    const c = clientes.find(c => c.id === id);
    return c ? `${c.nombre} ${c.apellidos}` : id;
  };

  const nombreVehiculo = (id?: string) => {
    if (!id) return '—';
    const v = vehiculos.find(v => v.id === id);
    return v ? `${v.marca} ${v.modelo} (${v.matricula})` : id;
  };

  const handleExportCsv = async () => {
    const todas = await listFacturas();
    const sorted = [...todas].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const headers = ['Número', 'Cliente', 'Vehículo', 'Fecha', 'Vencimiento', 'Estado', 'Subtotal', 'IVA', 'Total'];
    const rows = sorted.map(f => [
      numeroMostrado(f), nombreCliente(f.clienteId), nombreVehiculo(f.vehiculoId), f.fecha, f.fechaVencimiento,
      ESTADO_FACTURA_LABELS[f.estado], fmt(f.subtotal), fmt(f.totalIva), fmt(f.total),
    ]);
    downloadCsv(`doonty_facturas_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
  };

  const handleDescargarGrupo = async (g: FacturaPeriodo) => {
    setDescargandoGrupo(g.clave);
    try {
      const rango = rangoDeClavePeriodo(agrupacion as AgrupacionFacturas, g.clave);
      const { data } = await listFacturasPaginado({ limit: g.cantidad, offset: 0, rangoFecha: rango });
      setViewingGrupo({ label: labelDePeriodo(agrupacion as AgrupacionFacturas, g.clave), facturas: data });
    } finally {
      setDescargandoGrupo(null);
    }
  };

  const handleSaveFactura = async (f: Factura) => {
    if (facturaModal.factura) await onUpdateFactura(f);
    else await onAddFactura(f);
    setFacturaModal({ open: false, factura: null });
    recargarTodo();
  };

  const handleEmitirConfirmado = async () => {
    if (confirmEmitir) {
      await onEmitirFactura(confirmEmitir.id);
      recargarTodo();
    }
    setConfirmEmitir(null);
  };

  const handleDelete = async (id: string) => {
    await onDeleteFactura(id);
    recargarTodo();
  };

  const handleCambiarEstado = async (id: string, estado: Factura['estado']) => {
    await onCambiarEstadoFactura(id, estado);
    recargarTodo();
  };

  /** Misma tabla tanto para la vista sin agrupar como para cada grupo (semana/mes/año). */
  const renderTablaFacturas = (lista: Factura[]) => (
    <table className="w-full text-sm">
      <thead className="bg-slate-50 border-b border-slate-100">
        <tr>
          {['Número', 'Cliente', 'Vehículo', 'Fecha', 'Vencimiento', 'Estado', 'Total', 'Acciones'].map(h => (
            <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {lista.map(f => {
          const esBorrador = f.estado === 'borrador';
          const transiciones = TRANSICIONES_VALIDAS[f.estado] ?? [];
          return (
            <tr key={f.id} className="hover:bg-slate-50 transition">
              <td className="px-4 py-3 font-bold text-slate-700 text-xs">{numeroMostrado(f)}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{nombreCliente(f.clienteId)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{nombreVehiculo(f.vehiculoId)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(f.fecha)}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{formatDate(f.fechaVencimiento)}</td>
              <td className="px-4 py-3">
                {transiciones.length > 0 ? (
                  <select
                    value={f.estado}
                    onChange={e => handleCambiarEstado(f.id, e.target.value as Factura['estado'])}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 ${ESTADO_FACTURA_COLORS[f.estado]}`}
                  >
                    <option value={f.estado}>{ESTADO_FACTURA_LABELS[f.estado]}</option>
                    {transiciones.map(k => (
                      <option key={k} value={k}>{ESTADO_FACTURA_LABELS[k]}</option>
                    ))}
                  </select>
                ) : (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_FACTURA_COLORS[f.estado]}`}>{ESTADO_FACTURA_LABELS[f.estado]}</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-bold text-slate-700">{fmt(f.total)} €</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => setViewingDoc(f)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition cursor-pointer" title="Ver / Descargar">
                    <Receipt className="w-3.5 h-3.5" />
                  </button>
                  {esBorrador && (
                    <button onClick={() => setConfirmEmitir(f)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer" title="Emitir factura">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => esBorrador && setFacturaModal({ open: true, factura: f })}
                    disabled={!esBorrador}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    title={esBorrador ? 'Editar' : 'Las facturas emitidas no se pueden editar (VeriFactu)'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => esBorrador && handleDelete(f.id)}
                    disabled={!esBorrador}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    title={esBorrador ? 'Eliminar' : 'Las facturas emitidas no se pueden eliminar (VeriFactu)'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
    {/* Se envuelve solo la vista de lista (no los visores/modales de abajo)
        para que al imprimir una factura no salga también esta pantalla. */}
    <div className="space-y-5 print:hidden">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FileText size={20} className="text-blue-600" /> Facturas
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">{resumen?.totalFacturas ?? '—'} facturas registradas</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-1">Total Facturas</p>
          <p className="text-2xl font-black text-slate-800">{resumen?.totalFacturas ?? '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-1">Facturas pagadas</p>
          <p className="text-2xl font-black text-green-600">{resumen?.facturasPagadas ?? '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-1">Pendiente de cobro</p>
          <p className="text-2xl font-black text-amber-600">{resumen ? `${fmt(resumen.importePendiente)} €` : '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-1">Importe cobrado</p>
          <p className="text-2xl font-black text-green-600">{resumen ? `${fmt(resumen.importeCobrado)} €` : '—'}</p>
        </div>
      </div>

      {/* Facturas table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Receipt className="w-4 h-4 text-blue-500" /> Facturas
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 bg-slate-50 border border-slate-100 rounded-xl">
              {([
                { id: 'ninguna', label: 'Todas' },
                { id: 'semana', label: 'Semana' },
                { id: 'mes', label: 'Mes' },
                { id: 'año', label: 'Año' },
              ] as const).map(op => (
                <button
                  key={op.id}
                  onClick={() => cambiarAgrupacion(op.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer ${
                    agrupacion === op.id ? 'bg-white text-slate-800 shadow-3xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold rounded-xl transition cursor-pointer"
              title="Exportar todas las facturas a CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
            <button onClick={() => setFacturaModal({ open: true, factura: null })} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Nueva Factura
            </button>
          </div>
        </div>

        {agrupacion === 'ninguna' ? (
          <div className="overflow-x-auto">
            {resumen?.totalFacturas === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No hay facturas registradas</p>
                <p className="text-xs mt-1">Crea la primera pulsando "Nueva Factura"</p>
              </div>
            ) : cargandoFilas ? (
              <p className="text-center py-16 text-xs text-slate-400">Cargando…</p>
            ) : (
              <>
                {renderTablaFacturas(filas)}
                <div className="px-5 py-3">
                  <Pagination currentPage={pagina} totalItems={totalFilas} pageSize={PAGE_SIZE} onPageChange={setPagina} />
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {grupos === null ? (
              <p className="text-center py-16 text-xs text-slate-400">Cargando…</p>
            ) : grupos.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No hay facturas registradas</p>
              </div>
            ) : (
              grupos.map(g => {
                const abierto = grupoAbierto === g.clave;
                return (
                  <div key={g.clave}>
                    <div className="flex items-center justify-between px-5 py-3 bg-slate-50/60 flex-wrap gap-2">
                      <button
                        onClick={() => abrirGrupo(g.clave)}
                        className="flex items-center gap-2 cursor-pointer text-left"
                      >
                        {abierto ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400" />}
                        <span className="text-xs font-extrabold text-slate-700">{labelDePeriodo(agrupacion, g.clave)}</span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {g.cantidad} factura{g.cantidad === 1 ? '' : 's'} · {fmt(g.total)} €
                        </span>
                      </button>
                      <button
                        onClick={() => handleDescargarGrupo(g)}
                        disabled={descargandoGrupo === g.clave}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-white text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                        title={`Descargar las facturas de ${labelDePeriodo(agrupacion, g.clave)}`}
                      >
                        <Download className="w-3.5 h-3.5" /> {descargandoGrupo === g.clave ? 'Preparando…' : 'Descargar grupo'}
                      </button>
                    </div>
                    {abierto && (
                      <div className="overflow-x-auto">
                        {cargandoFilas ? (
                          <p className="text-center py-8 text-xs text-slate-400">Cargando…</p>
                        ) : (
                          <>
                            {renderTablaFacturas(filas)}
                            <div className="px-5 py-3">
                              <Pagination currentPage={pagina} totalItems={totalFilas} pageSize={PAGE_SIZE} onPageChange={setPagina} />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>

      {facturaModal.open && (
        <FacturaModal
          factura={facturaModal.factura}
          clientes={clientes}
          vehiculos={vehiculos}
          onSave={handleSaveFactura}
          onClose={() => setFacturaModal({ open: false, factura: null })}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmEmitir}
        title="Emitir factura"
        message="Esta factura quedará emitida de forma definitiva con el siguiente número correlativo de la empresa: no podrá editarse ni eliminarse (solo se anula con una factura rectificativa). ¿Confirmas la emisión?"
        confirmLabel="Emitir"
        variant="warning"
        onConfirm={handleEmitirConfirmado}
        onCancel={() => setConfirmEmitir(null)}
      />

      {/* Visor de factura */}
      {viewingDoc && (() => {
        const f = viewingDoc;
        const cli = clientes.find(c => c.id === f.clienteId);

        const textoWA = `Hola ${cli?.nombre ?? ''},\n\nAdjuntamos la Factura ${numeroMostrado(f)} por importe de ${fmt(f.total)} €.\n\nPor favor, revísala y confírmanos la recepción.\n\nUn saludo,\n${empresa.nombre}`;
        const telefonoWA = cli?.telefono?.replace(/\D/g, '') ?? '';
        const waUrl = `https://wa.me/${telefonoWA}?text=${encodeURIComponent(textoWA)}`;
        const mailUrl = `mailto:${cli?.correo ?? ''}?subject=${encodeURIComponent(`Factura ${numeroMostrado(f)} - ${empresa.nombre}`)}&body=${encodeURIComponent(textoWA)}`;

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex flex-col print:bg-white print:relative print:inset-auto">
            <div className="flex items-center justify-between px-6 py-3 bg-slate-800 text-white shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-sm">Factura {numeroMostrado(f)}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer">
                  <Printer className="w-3.5 h-3.5" /> Descargar / Imprimir
                </button>
                {cli?.telefono && (
                  <a href={waUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                )}
                {cli?.correo && (
                  <a href={mailUrl} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition">
                    <MailIcon className="w-3.5 h-3.5" /> Email
                  </a>
                )}
                <button onClick={() => setViewingDoc(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer">
                  <X className="w-3.5 h-3.5" /> Cerrar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-100 print:bg-white">
              <FacturaPrintable f={f} empresa={empresa} clientes={clientes} vehiculos={vehiculos} />
            </div>
          </div>
        );
      })()}

      {/* Descarga de un grupo de facturas (semana/mes/año) — misma mecánica que el visor de una sola factura, pero repitiendo el contenido imprimible una vez por factura con salto de página entre ellas. */}
      {viewingGrupo && (
        <div className="fixed inset-0 z-50 bg-black/60 flex flex-col print:bg-white print:relative print:inset-auto">
          <div className="flex items-center justify-between px-6 py-3 bg-slate-800 text-white shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-400" />
              <span className="font-bold text-sm">{viewingGrupo.facturas.length} factura{viewingGrupo.facturas.length === 1 ? '' : 's'} — {viewingGrupo.label}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition cursor-pointer">
                <Printer className="w-3.5 h-3.5" /> Descargar / Imprimir
              </button>
              <button onClick={() => setViewingGrupo(null)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition cursor-pointer">
                <X className="w-3.5 h-3.5" /> Cerrar
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-100 print:bg-white">
            {viewingGrupo.facturas.map((f, i) => (
              <FacturaPrintable
                key={f.id}
                f={f}
                empresa={empresa}
                clientes={clientes}
                vehiculos={vehiculos}
                saltoDePagina={i < viewingGrupo.facturas.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
