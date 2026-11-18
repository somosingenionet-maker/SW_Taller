import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, FileArchive, FileSpreadsheet, X } from 'lucide-react';
import type { Cliente, Empresa } from '../types';
import { listFacturasParaGestoria } from '../lib/data/facturas';
import { listComprasParaGestoria } from '../lib/data/compras';
import { avisar, avisarError, avisarOk } from '../lib/avisos';
import { empaquetarDocumentos } from '../lib/data/comprasAdjuntos';
import { nombreZipDocumentos, planificarDocumentos } from '../utils/documentosGestoria';
import { formatoTamano } from '../utils/adjuntos';
import { downloadCsv } from '../utils/csvExport';
import { fmt2 } from '../utils/moneda';
import {
  avisosLibro, avisosRecibidas, csvLibro, csvRecibidas, filasLibro, filasRecibidas, hojasExcel, nombreArchivoGestoria, periodoAño, periodoMes, periodoRango,
  periodoTrimestre, resumenIva, trimestreAnterior, type CompraParaGestoria, type FacturaParaGestoria, type FilaIva, type Periodo, type ResumenIva,
} from '../utils/gestoria';

type Tipo = 'trimestre' | 'mes' | 'año' | 'rango';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';

interface Props {
  empresa: Empresa;
  clientes: Cliente[];
  /** Tiene el módulo Facturas: puede exportar las emitidas. */
  puedeFacturas?: boolean;
  /** Tiene el módulo Compras: puede exportar las recibidas. */
  puedeCompras?: boolean;
  onClose: () => void;
}

function TablaIva({ titulo, resumen, avisos, testId }: { titulo: string; resumen: ResumenIva; avisos: React.ReactNode; testId: string }) {
  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">{titulo}</p>
      <table className="w-full text-xs">
        <thead><tr className="text-slate-400 text-left"><th className="font-semibold pb-1">IVA</th><th className="font-semibold pb-1 text-right">Facturas</th><th className="font-semibold pb-1 text-right">Base</th><th className="font-semibold pb-1 text-right">Cuota</th><th className="font-semibold pb-1 text-right">Total</th></tr></thead>
        <tbody className="text-slate-700">
          {resumen.lineas.map((l) => (
            <tr key={l.ivaPct}><td className="py-0.5">{String(l.ivaPct).replace('.', ',')} %</td><td className="text-right">{l.facturas}</td><td className="text-right">{fmt2(l.base)} €</td><td className="text-right">{fmt2(l.cuota)} €</td><td className="text-right">{fmt2(l.total)} €</td></tr>
          ))}
          <tr className="font-extrabold border-t border-slate-200"><td className="pt-1">Total</td><td className="text-right pt-1">{resumen.totales.facturas}</td><td className="text-right pt-1">{fmt2(resumen.totales.base)} €</td><td className="text-right pt-1">{fmt2(resumen.totales.cuota)} €</td><td className="text-right pt-1">{fmt2(resumen.totales.total)} €</td></tr>
        </tbody>
      </table>
      {avisos}
    </div>
  );
}
const Aviso = ({ children }: { children: React.ReactNode }) => <li className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {children}</li>;

/** Ventana «Exportar para la gestoría»: elige un periodo, ve el resumen del IVA y descarga el libro en Excel o CSV. */
export default function ExportarGestoria({ empresa, clientes, puedeFacturas = true, puedeCompras = false, onClose }: Props) {
  const inicial = useMemo(() => trimestreAnterior(new Date()), []);
  const añoActual = new Date().getFullYear();
  const [tipo, setTipo] = useState<Tipo>('trimestre');
  const [año, setAño] = useState(Number(inicial.clave.slice(0, 4)));
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | 4>(Number(inicial.clave.slice(-1)) as 1 | 2 | 3 | 4);
  const [mes, setMes] = useState(Math.max(new Date().getMonth(), 1));
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.ultimoDia);
  const [conEmitidas, setConEmitidas] = useState(puedeFacturas);
  const [conRecibidas, setConRecibidas] = useState(puedeCompras);
  const [cargando, setCargando] = useState(false);
  const [emitidasBase, setEmitidasBase] = useState<FacturaParaGestoria[] | null>(null);
  const [comprasBase, setComprasBase] = useState<CompraParaGestoria[] | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [zip, setZip] = useState<{ hechos: number; total: number } | null>(null);
  const cancelarZip = useRef<AbortController | null>(null);

  const periodo: Periodo | null = useMemo(() => {
    if (tipo === 'trimestre') return periodoTrimestre(año, trimestre);
    if (tipo === 'mes') return periodoMes(año, mes);
    if (tipo === 'año') return periodoAño(año);
    return periodoRango(desde, hasta);
  }, [tipo, año, trimestre, mes, desde, hasta]);

  // Cada cambio de periodo (o de qué partes se piden) vuelve a leer; si se cambia antes de que acabe, se descarta la respuesta vieja.
  useEffect(() => {
    const quiereE = conEmitidas && puedeFacturas, quiereR = conRecibidas && puedeCompras;
    if (!periodo || (!quiereE && !quiereR)) { setEmitidasBase(null); setComprasBase(null); return; }
    let vigente = true;
    setCargando(true);
    const porId = new Map(clientes.map((c) => [c.id, c]));
    Promise.all([
      quiereE ? listFacturasParaGestoria(periodo.desde, periodo.hasta) : Promise.resolve(null),
      quiereR ? listComprasParaGestoria(periodo.desde, periodo.hasta) : Promise.resolve(null),
    ])
      .then(([rows, compras]) => {
        if (!vigente) return;
        setEmitidasBase(rows ? rows.map((r) => {
          const c = porId.get(r.clienteId);
          const nombre = r.nombre != null ? `${r.nombre} ${r.apellidos ?? ''}` : c ? `${c.nombre} ${c.apellidos}` : '(cliente eliminado)';
          return { numero: r.numero, fecha: r.fecha, estado: r.estado, subtotal: r.subtotal, ivaPct: r.ivaPct, totalIva: r.totalIva, total: r.total, clienteNombre: nombre, clienteNif: r.nif ?? c?.nifNiePasaporte ?? '' };
        }) : null);
        setComprasBase(compras);
      })
      .catch((e) => { if (vigente) { setEmitidasBase(null); setComprasBase(null); avisarError(e, 'No se pudieron leer las facturas de ese periodo.'); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [periodo, clientes, conEmitidas, conRecibidas, puedeFacturas, puedeCompras]);

  const emitidas = useMemo(() => (emitidasBase ? filasLibro(emitidasBase) : null), [emitidasBase]);
  const recibidas = useMemo(() => (comprasBase ? filasRecibidas(comprasBase) : null), [comprasBase]);
  const resE = useMemo(() => (emitidas ? resumenIva(emitidas as FilaIva[]) : null), [emitidas]);
  const resR = useMemo(() => (recibidas ? resumenIva(recibidas) : null), [recibidas]);
  const avE = useMemo(() => (emitidas ? avisosLibro(emitidas) : null), [emitidas]);
  const avR = useMemo(() => (recibidas && comprasBase ? avisosRecibidas(comprasBase, recibidas) : null), [recibidas, comprasBase]);

  const plan = useMemo(() => (comprasBase ? planificarDocumentos(comprasBase) : null), [comprasBase]);

  const hayDatos = (emitidas?.length ?? 0) + (recibidas?.length ?? 0) > 0;
  const listo = (emitidas !== null || recibidas !== null) && !cargando;
  const vacio = listo && !hayDatos;
  const nada = !(conEmitidas && puedeFacturas) && !(conRecibidas && puedeCompras);

  const descargarExcel = async () => {
    if (!periodo || !hayDatos) return;
    setDescargando(true);
    try {
      const { crearXlsx, descargarXlsx } = await import('../utils/xlsx');
      descargarXlsx(nombreArchivoGestoria(periodo, empresa.nombre, 'xlsx'),
        crearXlsx(hojasExcel({ emitidas: emitidas ?? undefined, recibidas: recibidas ?? undefined, periodo, taller: { nombre: empresa.razonSocial || empresa.nombre, nif: empresa.nif } })));
    } catch (e) {
      avisarError(e, 'No se pudo crear el archivo de Excel.');
    } finally {
      setDescargando(false);
    }
  };
  const descargarDocumentos = async () => {
    if (!periodo || !plan || plan.entradas.length === 0 || plan.demasiadoGrande) return;
    const control = new AbortController();
    cancelarZip.current = control;
    setZip({ hechos: 0, total: plan.entradas.length });
    try {
      const r = await empaquetarDocumentos({ plan, periodo, taller: empresa.razonSocial || empresa.nombre, signal: control.signal, onProgreso: (hechos, total) => setZip({ hechos, total }) });
      const { descargarBytes } = await import('../utils/xlsx');
      descargarBytes(nombreZipDocumentos(periodo, empresa.nombre), r.bytes, 'application/zip');
      if (r.fallidos.length === 0) avisarOk(`ZIP descargado con ${r.incluidos} ${r.incluidos === 1 ? 'archivo' : 'archivos'}.`);
      else avisar({ tipo: 'error', mensaje: `ZIP descargado con ${r.incluidos} de ${plan.entradas.length} archivos. No se pudieron incluir: ${r.fallidos.join('; ')}. Lo dice también el LEEME.txt del ZIP.` });
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') avisarError(e, 'No se pudo preparar el ZIP de documentos.');
    } finally {
      cancelarZip.current = null;
      setZip(null);
    }
  };
  // Si se cierra la ventana a mitad de descarga, se cancela.
  useEffect(() => () => cancelarZip.current?.abort(), []);

  const csvEmitidas = () => { if (periodo && emitidas) downloadCsv(nombreArchivoGestoria(periodo, empresa.nombre, 'csv'), csvLibro(emitidas)); };
  const csvRecib = () => {
    if (!periodo || !recibidas) return;
    downloadCsv(nombreArchivoGestoria(periodo, empresa.nombre, 'csv').replace('gestoria_', 'gestoria_recibidas_'), csvRecibidas(recibidas));
  };

  const diferencia = resE && resR && (recibidas?.length ?? 0) > 0 && (emitidas?.length ?? 0) > 0 ? Math.round((resE.totales.cuota - resR.totales.cuota) * 100) / 100 : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Exportar para la gestoría">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4 dlg-b" data-testid="exportar-gestoria">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Exportar para la gestoría</p>
            <p className="text-xs text-slate-500 mt-0.5">Libro de facturas del periodo con el resumen del IVA. Los borradores no se incluyen.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Tipo de periodo">
            {([['trimestre', 'Trimestre'], ['mes', 'Mes'], ['año', 'Año'], ['rango', 'Entre fechas']] as const).map(([id, texto]) => (
              <button key={id} type="button" aria-pressed={tipo === id} onClick={() => setTipo(id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${tipo === id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>{texto}</button>
            ))}
          </div>
          {tipo !== 'rango' && (
            <div className="flex gap-2 flex-wrap items-center">
              {tipo === 'trimestre' && (
                <select aria-label="Trimestre" value={trimestre} onChange={(e) => setTrimestre(Number(e.target.value) as 1 | 2 | 3 | 4)} className={campo}>
                  {[1, 2, 3, 4].map((t) => <option key={t} value={t}>{t}.º trimestre</option>)}
                </select>
              )}
              {tipo === 'mes' && (
                <select aria-label="Mes" value={mes} onChange={(e) => setMes(Number(e.target.value))} className={campo}>
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              )}
              <select aria-label="Año" value={año} onChange={(e) => setAño(Number(e.target.value))} className={campo}>
                {Array.from({ length: 6 }, (_, i) => añoActual - i).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          )}
          {tipo === 'rango' && (
            <div className="flex gap-2 flex-wrap items-center text-sm text-slate-500">
              <input type="date" aria-label="Desde" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
              <span>a</span>
              <input type="date" aria-label="Hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
            </div>
          )}
          {!periodo && <p className="text-xs text-rose-600 font-semibold" role="alert">Revisa las fechas: la primera debe ser igual o anterior a la segunda.</p>}
          {puedeFacturas && puedeCompras && (
            <div className="flex gap-4 flex-wrap text-sm text-slate-700">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={conEmitidas} onChange={(e) => setConEmitidas(e.target.checked)} data-testid="incluir-emitidas" /> Facturas emitidas</label>
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={conRecibidas} onChange={(e) => setConRecibidas(e.target.checked)} data-testid="incluir-recibidas" /> Facturas recibidas (compras)</label>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 min-h-[7rem] space-y-4" data-testid="resumen-gestoria" aria-live="polite">
          {nada && <p className="text-sm text-slate-600">Marca al menos una de las dos partes para exportar.</p>}
          {cargando && <p className="text-xs text-slate-400">Leyendo las facturas…</p>}
          {!cargando && vacio && <p className="text-sm text-slate-600">No hay facturas {conEmitidas && conRecibidas ? 'emitidas ni recibidas' : conRecibidas ? 'recibidas' : 'emitidas'} en {periodo?.etiqueta}.</p>}
          {!cargando && listo && hayDatos && <p className="text-sm font-bold text-slate-800 capitalize-first">{periodo?.etiqueta}</p>}
          {!cargando && emitidas && resE && emitidas.length > 0 && (
            <TablaIva titulo={`Facturas emitidas · ${resE.totales.facturas} ${resE.totales.facturas === 1 ? 'factura' : 'facturas'}`} resumen={resE} testId="bloque-emitidas"
              avisos={avE && (avE.anuladas > 0 || avE.sinNif.length > 0 || avE.descuadradas.length > 0) ? (
                <ul className="space-y-1 text-[11px] text-amber-800" data-testid="avisos-gestoria">
                  {avE.anuladas > 0 && <Aviso>{avE.anuladas} {avE.anuladas === 1 ? 'factura anulada' : 'facturas anuladas'}: salen en el libro con su número pero no suman en el resumen.</Aviso>}
                  {avE.sinNif.length > 0 && <Aviso>Sin NIF del cliente: {avE.sinNif.join(', ')}. La gestoría lo va a pedir.</Aviso>}
                  {avE.descuadradas.length > 0 && <Aviso>Base + IVA no cuadra con el total en: {avE.descuadradas.join(', ')}. Revísalas antes de enviar.</Aviso>}
                </ul>
              ) : null} />
          )}
          {!cargando && recibidas && resR && recibidas.length > 0 && (
            <TablaIva titulo={`Facturas recibidas · ${resR.totales.facturas} ${resR.totales.facturas === 1 ? 'factura' : 'facturas'}`} resumen={resR} testId="bloque-recibidas"
              avisos={avR && (avR.anuladas > 0 || avR.sinNif.length > 0 || avR.descuadradas.length > 0) ? (
                <ul className="space-y-1 text-[11px] text-amber-800" data-testid="avisos-recibidas">
                  {avR.anuladas > 0 && <Aviso>{avR.anuladas} {avR.anuladas === 1 ? 'compra anulada' : 'compras anuladas'}: salen en el libro pero no suman.</Aviso>}
                  {avR.sinNif.length > 0 && <Aviso>Proveedores sin NIF: {avR.sinNif.join(', ')}. Complétalos en la ficha del proveedor.</Aviso>}
                  {avR.descuadradas.length > 0 && <Aviso>No cuadra con el total guardado: {avR.descuadradas.join(', ')}.</Aviso>}
                </ul>
              ) : null} />
          )}
          {!cargando && plan && recibidas && recibidas.length > 0 && (
            <div className="space-y-2 border-t border-slate-200 pt-3" data-testid="documentos-gestoria">
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Documentos de las facturas recibidas</p>
              {plan.entradas.length === 0 ? (
                <p className="text-xs text-slate-500">Ninguna de estas facturas tiene el documento adjunto. Adjúntalos desde el detalle de cada compra y podrás descargarlos todos juntos.</p>
              ) : (
                <p className="text-xs text-slate-600" data-testid="resumen-documentos">{plan.entradas.length} {plan.entradas.length === 1 ? 'archivo' : 'archivos'} de {plan.facturasConDocumento} {plan.facturasConDocumento === 1 ? 'factura' : 'facturas'} · {formatoTamano(plan.bytes)}</p>
              )}
              {plan.sinDocumento.length > 0 && plan.entradas.length > 0 && (
                <ul className="text-[11px] text-amber-800" data-testid="sin-documento"><Aviso>Sin documento adjunto: {plan.sinDocumento.join(', ')}. La gestoría lo puede reclamar.</Aviso></ul>
              )}
              {plan.demasiadoGrande && <p role="alert" className="text-xs font-semibold text-rose-600">Son demasiados archivos para un solo ZIP: elige un periodo más corto (un mes, por ejemplo).</p>}
              {plan.entradas.length > 0 && (
                zip ? (
                  <div className="flex items-center gap-2" data-testid="progreso-zip">
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((zip.hechos / Math.max(zip.total, 1)) * 100)}%` }} /></div>
                    <span className="text-[11px] text-slate-500 shrink-0">{zip.hechos} de {zip.total}</span>
                    <button type="button" onClick={() => cancelarZip.current?.abort()} className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer">Cancelar</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => void descargarDocumentos()} disabled={plan.demasiadoGrande} data-testid="descargar-documentos"
                    className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"><FileArchive className="w-4 h-4" /> Descargar documentos (ZIP)</button>
                )
              )}
            </div>
          )}
          {!cargando && diferencia !== null && hayDatos && (
            <p className="text-xs text-slate-600 border-t border-slate-200 pt-3" data-testid="diferencia-iva">
              <span className="font-bold">IVA repercutido − soportado: {fmt2(diferencia)} €</span> <span className="text-slate-400">· orientativo; la deducibilidad la decide tu gestoría.</span>
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void descargarExcel()} disabled={!hayDatos || cargando || descargando} data-testid="descargar-excel"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> {descargando ? 'Preparando…' : 'Descargar Excel'}
          </button>
          <button type="button" onClick={csvEmitidas} disabled={!emitidas || emitidas.length === 0 || cargando} data-testid="descargar-csv"
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV{puedeCompras ? ' emitidas' : ''}
          </button>
          {puedeCompras && (
            <button type="button" onClick={csvRecib} disabled={!recibidas || recibidas.length === 0 || cargando} data-testid="descargar-csv-recibidas"
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
              <Download className="w-4 h-4" /> CSV recibidas
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">El Excel lleva una hoja por cada parte y un «Resumen IVA». Los importes son números y las fechas son fechas, para poder filtrar y sumar.</p>
      </div>
    </div>
  );
}
