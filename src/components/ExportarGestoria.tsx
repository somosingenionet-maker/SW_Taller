import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, X } from 'lucide-react';
import type { Cliente, Empresa } from '../types';
import { listFacturasParaGestoria } from '../lib/data/facturas';
import { avisarError } from '../lib/avisos';
import { downloadCsv } from '../utils/csvExport';
import { fmt2 } from '../utils/moneda';
import {
  avisosLibro, csvLibro, filasLibro, hojasExcel, nombreArchivoGestoria, periodoAño, periodoMes, periodoRango, periodoTrimestre, resumenIva,
  trimestreAnterior, type FacturaParaGestoria, type Periodo,
} from '../utils/gestoria';

type Tipo = 'trimestre' | 'mes' | 'año' | 'rango';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const campo = 'border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400';

interface Props { empresa: Empresa; clientes: Cliente[]; onClose: () => void }

/** Ventana «Exportar para la gestoría»: elige un periodo, ve el resumen del IVA y descarga el libro en Excel o CSV. */
export default function ExportarGestoria({ empresa, clientes, onClose }: Props) {
  const inicial = useMemo(() => trimestreAnterior(new Date()), []);
  const añoActual = new Date().getFullYear();
  const [tipo, setTipo] = useState<Tipo>('trimestre');
  const [año, setAño] = useState(Number(inicial.clave.slice(0, 4)));
  const [trimestre, setTrimestre] = useState<1 | 2 | 3 | 4>(Number(inicial.clave.slice(-1)) as 1 | 2 | 3 | 4);
  const [mes, setMes] = useState(Math.max(new Date().getMonth(), 1));
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.ultimoDia);
  const [cargando, setCargando] = useState(false);
  const [filasBase, setFilasBase] = useState<FacturaParaGestoria[] | null>(null);
  const [descargando, setDescargando] = useState(false);

  const periodo: Periodo | null = useMemo(() => {
    if (tipo === 'trimestre') return periodoTrimestre(año, trimestre);
    if (tipo === 'mes') return periodoMes(año, mes);
    if (tipo === 'año') return periodoAño(año);
    return periodoRango(desde, hasta);
  }, [tipo, año, trimestre, mes, desde, hasta]);

  // Cada cambio de periodo vuelve a leer las facturas; si se cambia antes de que acabe, se descarta la respuesta vieja.
  useEffect(() => {
    if (!periodo) { setFilasBase(null); return; }
    let vigente = true;
    setCargando(true);
    const porId = new Map(clientes.map((c) => [c.id, c]));
    listFacturasParaGestoria(periodo.desde, periodo.hasta)
      .then((rows) => {
        if (!vigente) return;
        setFilasBase(rows.map((r) => {
          const c = porId.get(r.clienteId);
          const nombre = r.nombre != null ? `${r.nombre} ${r.apellidos ?? ''}` : c ? `${c.nombre} ${c.apellidos}` : '(cliente eliminado)';
          return { numero: r.numero, fecha: r.fecha, estado: r.estado, subtotal: r.subtotal, ivaPct: r.ivaPct, totalIva: r.totalIva, total: r.total, clienteNombre: nombre, clienteNif: r.nif ?? c?.nifNiePasaporte ?? '' };
        }));
      })
      .catch((e) => { if (vigente) { setFilasBase(null); avisarError(e, 'No se pudieron leer las facturas de ese periodo.'); } })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [periodo, clientes]);

  const filas = useMemo(() => (filasBase ? filasLibro(filasBase) : null), [filasBase]);
  const resumen = useMemo(() => (filas ? resumenIva(filas) : null), [filas]);
  const avisos = useMemo(() => (filas ? avisosLibro(filas) : null), [filas]);

  const descargarExcel = async () => {
    if (!filas || !periodo) return;
    setDescargando(true);
    try {
      const { crearXlsx, descargarXlsx } = await import('../utils/xlsx');
      descargarXlsx(nombreArchivoGestoria(periodo, empresa.nombre, 'xlsx'), crearXlsx(hojasExcel(filas, periodo, { nombre: empresa.razonSocial || empresa.nombre, nif: empresa.nif })));
    } catch (e) {
      avisarError(e, 'No se pudo crear el archivo de Excel.');
    } finally {
      setDescargando(false);
    }
  };
  const descargarCsv = () => {
    if (!filas || !periodo) return;
    downloadCsv(nombreArchivoGestoria(periodo, empresa.nombre, 'csv'), csvLibro(filas));
  };

  const vacio = filas !== null && filas.length === 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Exportar para la gestoría">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4" data-testid="exportar-gestoria">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-extrabold text-slate-800 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Exportar para la gestoría</p>
            <p className="text-xs text-slate-500 mt-0.5">Libro de facturas emitidas del periodo, con el resumen del IVA. Los borradores no se incluyen.</p>
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
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 min-h-[7rem]" data-testid="resumen-gestoria" aria-live="polite">
          {cargando && <p className="text-xs text-slate-400">Leyendo las facturas…</p>}
          {!cargando && vacio && <p className="text-sm text-slate-600">No hay facturas emitidas en {periodo?.etiqueta}.</p>}
          {!cargando && filas && resumen && !vacio && (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-800 capitalize-first">{periodo?.etiqueta} · {filas.length} {filas.length === 1 ? 'factura' : 'facturas'} en el libro</p>
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 text-left"><th className="font-semibold pb-1">IVA</th><th className="font-semibold pb-1 text-right">Facturas</th><th className="font-semibold pb-1 text-right">Base</th><th className="font-semibold pb-1 text-right">Cuota</th><th className="font-semibold pb-1 text-right">Total</th></tr></thead>
                <tbody className="text-slate-700">
                  {resumen.lineas.map((l) => (
                    <tr key={l.ivaPct}><td className="py-0.5">{String(l.ivaPct).replace('.', ',')} %</td><td className="text-right">{l.facturas}</td><td className="text-right">{fmt2(l.base)} €</td><td className="text-right">{fmt2(l.cuota)} €</td><td className="text-right">{fmt2(l.total)} €</td></tr>
                  ))}
                  <tr className="font-extrabold border-t border-slate-200"><td className="pt-1">Total</td><td className="text-right pt-1">{resumen.totales.facturas}</td><td className="text-right pt-1">{fmt2(resumen.totales.base)} €</td><td className="text-right pt-1">{fmt2(resumen.totales.cuota)} €</td><td className="text-right pt-1">{fmt2(resumen.totales.total)} €</td></tr>
                </tbody>
              </table>
              {avisos && (avisos.anuladas > 0 || avisos.sinNif.length > 0 || avisos.descuadradas.length > 0) && (
                <ul className="space-y-1 text-[11px] text-amber-800" data-testid="avisos-gestoria">
                  {avisos.anuladas > 0 && <li className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {avisos.anuladas} {avisos.anuladas === 1 ? 'factura anulada' : 'facturas anuladas'}: salen en el libro con su número pero no suman en el resumen.</li>}
                  {avisos.sinNif.length > 0 && <li className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Sin NIF del cliente: {avisos.sinNif.join(', ')}. La gestoría lo va a pedir.</li>}
                  {avisos.descuadradas.length > 0 && <li className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Base + IVA no cuadra con el total en: {avisos.descuadradas.join(', ')}. Revísalas antes de enviar.</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => void descargarExcel()} disabled={!filas || vacio || descargando} data-testid="descargar-excel"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> {descargando ? 'Preparando…' : 'Descargar Excel'}
          </button>
          <button type="button" onClick={descargarCsv} disabled={!filas || vacio} data-testid="descargar-csv"
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-bold rounded-xl transition cursor-pointer disabled:opacity-50">
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
        <p className="text-[11px] text-slate-400">El Excel lleva dos hojas: «Facturas emitidas» (una fila por factura) y «Resumen IVA». Los importes son números y las fechas son fechas, para poder filtrar y sumar.</p>
      </div>
    </div>
  );
}
