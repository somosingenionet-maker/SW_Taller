import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, FileDown, Loader2, Upload, X } from 'lucide-react';
import {
  CAMPOS, autoMapear, decodificarArchivo, faltanObligatorios, informeOmitidos, parsearCsv, plantillaCsv, validarFilas,
  MAX_FILAS_IMPORTACION, type EntidadImport, type ExistentesImport,
} from '../utils/csvImport';
import { cargarExistentes, importarFilas, type ResultadoImportacion } from '../lib/data/importacion';

const MAX_BYTES = 5 * 1024 * 1024;

const TEXTOS: Record<EntidadImport, { titulo: string; singular: string; plural: string; ayuda: string; archivoPlantilla: string }> = {
  clientes: {
    titulo: 'Importar clientes', singular: 'cliente', plural: 'clientes', archivoPlantilla: 'plantilla_clientes.csv',
    ayuda: 'Necesitas al menos el nombre. Cuantos más datos traiga el archivo (NIF, correo, teléfono), mejor se evitarán duplicados.',
  },
  vehiculos: {
    titulo: 'Importar vehículos', singular: 'vehículo', plural: 'vehículos', archivoPlantilla: 'plantilla_vehiculos.csv',
    ayuda: 'Necesitas matrícula, marca y modelo. Si incluyes el NIF o el correo del propietario, el vehículo se asignará a ese cliente (impórtalos antes).',
  },
  productos: {
    titulo: 'Importar inventario', singular: 'artículo', plural: 'artículos', archivoPlantilla: 'plantilla_inventario.csv',
    ayuda: 'Necesitas al menos el nombre. El stock actual se registra como entrada inicial de inventario.',
  },
};

function descargarTexto(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

type Paso = 'archivo' | 'revision' | 'importando' | 'resultado';

interface Props {
  entidad: EntidadImport;
  onClose: () => void;
  /** Se llama al terminar para que la pantalla recargue sus datos. */
  onImportado: () => void | Promise<void>;
}

export default function ImportarCsvModal({ entidad, onClose, onImportado }: Props) {
  const t = TEXTOS[entidad];
  const campos = CAMPOS[entidad];
  const [paso, setPaso] = useState<Paso>('archivo');
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [cabeceras, setCabeceras] = useState<string[]>([]);
  const [filas, setFilas] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<string[]>([]);
  const [existentes, setExistentes] = useState<ExistentesImport>({});
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Escape cierra, salvo mientras se escribe en la base de datos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && paso !== 'importando') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paso, onClose]);

  const validacion = useMemo(
    () => (paso === 'revision' || paso === 'resultado' ? validarFilas(entidad, filas, mapeo, existentes) : null),
    [paso, entidad, filas, mapeo, existentes],
  );
  const faltan = useMemo(() => faltanObligatorios(mapeo, entidad), [mapeo, entidad]);

  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    setError('');
    if (archivo.size > MAX_BYTES) { setError('El archivo pesa más de 5 MB. Divídelo en varios.'); return; }
    if (/\.(xlsx?|ods)$/i.test(archivo.name)) {
      setError('Ese es un archivo de Excel. Ábrelo y guárdalo como «CSV (delimitado por comas / punto y coma)» desde Archivo → Guardar como.');
      return;
    }
    setLeyendo(true);
    try {
      const texto = decodificarArchivo(await archivo.arrayBuffer());
      const todas = parsearCsv(texto);
      if (todas.length < 2) { setError('El archivo no tiene filas de datos (la primera fila debe ser la cabecera con los nombres de columna).'); return; }
      const [cab, ...datos] = todas;
      const auto = autoMapear(cab, entidad);
      setExistentes(await cargarExistentes(entidad));
      setNombreArchivo(archivo.name);
      setCabeceras(cab);
      setFilas(datos);
      setMapeo(auto);
      setPaso('revision');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    } finally {
      setLeyendo(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const cambiarColumna = (col: number, clave: string) =>
    setMapeo((m) => m.map((x, i) => (i === col ? clave : clave !== '' && x === clave ? '' : x)));

  const importar = async () => {
    if (!validacion || validacion.validas.length === 0) return;
    setError('');
    setPaso('importando');
    setProgreso({ hechas: 0, total: validacion.validas.length });
    try {
      const r = await importarFilas(entidad, validacion.validas, (hechas, total) => setProgreso({ hechas, total }));
      setResultado(r);
      await onImportado();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La importación se interrumpió. Revisa qué se importó antes de repetirla.');
      setResultado({ importadas: 0, fallidas: [], avisos: [] });
    }
    setPaso('resultado');
  };

  const descargarInforme = () => {
    if (!validacion) return;
    const extra = [...(resultado?.fallidas ?? []), ...(resultado?.avisos ?? []).map((a) => ({ linea: a.linea, mensaje: `Aviso: ${a.mensaje}` }))];
    descargarTexto(`informe_importacion_${t.plural}.csv`, informeOmitidos(validacion, extra));
  };

  const nombre = (n: number) => (n === 1 ? t.singular : t.plural);
  const omitidas = validacion ? validacion.conErrores.length + validacion.duplicadas.length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={paso === 'importando' ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-label={t.titulo}
        className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-800 flex items-center gap-2"><Upload className="w-4 h-4 text-blue-600" /> {t.titulo}</p>
          {paso !== 'importando' && (
            <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
          )}
        </div>

        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>}

        {paso === 'archivo' && (
          <div className="space-y-4">
            <ol className="text-sm text-slate-600 space-y-1.5 list-decimal pl-5">
              <li>Descarga la plantilla (o usa tu propio Excel guardado como CSV: la primera fila debe tener los nombres de columna).</li>
              <li>Súbela aquí. Detectamos las columnas solas y podrás corregirlas antes de importar.</li>
              <li>Revisas el resumen y confirmas. Lo duplicado se omite; nada se sobrescribe.</li>
            </ol>
            <p className="text-xs text-slate-500">{t.ayuda} Máximo {MAX_FILAS_IMPORTACION.toLocaleString('es-ES')} filas por importación.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => descargarTexto(t.archivoPlantilla, plantillaCsv(entidad))}
                className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-2xl transition cursor-pointer">
                <FileDown className="w-4 h-4" /> Descargar plantilla
              </button>
              <button onClick={() => inputRef.current?.click()} disabled={leyendo}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                {leyendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {leyendo ? 'Leyendo…' : 'Elegir archivo CSV'}
              </button>
              <input ref={inputRef} type="file" accept=".csv,.txt,.tsv,text/csv" className="hidden" onChange={(e) => void elegirArchivo(e.target.files?.[0])} />
            </div>
          </div>
        )}

        {paso === 'revision' && validacion && (
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{nombreArchivo}</span> — {filas.length.toLocaleString('es-ES')} {filas.length === 1 ? 'fila' : 'filas'}. Comprueba que cada columna del archivo corresponde al dato correcto.
            </p>

            <div className="border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr><th className="text-left px-3 py-2 font-semibold">Columna del archivo</th><th className="text-left px-3 py-2 font-semibold">Ejemplo</th><th className="text-left px-3 py-2 font-semibold">Se importa como</th></tr>
                </thead>
                <tbody>
                  {cabeceras.map((cab, col) => (
                    <tr key={col} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-700">{cab || <span className="text-slate-400">(sin título)</span>}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-[12rem] truncate">{filas.slice(0, 3).map((f) => f[col]).filter(Boolean).join(' · ')}</td>
                      <td className="px-3 py-2">
                        <select value={mapeo[col] ?? ''} onChange={(e) => cambiarColumna(col, e.target.value)}
                          aria-label={`Destino de la columna ${cab}`}
                          className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                          <option value="">— No importar —</option>
                          {campos.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}{c.obligatorio ? ' *' : ''}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {faltan.length > 0 ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-4 py-2.5 rounded-xl flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Falta indicar qué columna es: {faltan.map((c) => c.etiqueta).join(', ')}.</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-2xl p-3"><p className="text-xl font-bold text-green-700">{validacion.validas.length}</p><p className="text-[11px] font-semibold text-green-700">se importarán</p></div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3"><p className="text-xl font-bold text-slate-600">{validacion.duplicadas.length}</p><p className="text-[11px] font-semibold text-slate-500">duplicadas (se omiten)</p></div>
                  <div className={`rounded-2xl p-3 border ${validacion.conErrores.length ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
                    <p className={`text-xl font-bold ${validacion.conErrores.length ? 'text-rose-700' : 'text-slate-600'}`}>{validacion.conErrores.length}</p>
                    <p className={`text-[11px] font-semibold ${validacion.conErrores.length ? 'text-rose-700' : 'text-slate-500'}`}>con errores (se omiten)</p>
                  </div>
                </div>

                {validacion.excedeLimite && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-4 py-2.5 rounded-xl">
                    El archivo tiene más de {MAX_FILAS_IMPORTACION.toLocaleString('es-ES')} filas: solo se procesan las primeras. Importa el resto en otro archivo.
                  </div>
                )}

                {omitidas > 0 && (
                  <details className="text-xs text-slate-600">
                    <summary className="cursor-pointer font-semibold">Ver las filas que se omiten ({omitidas})</summary>
                    <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {validacion.conErrores.slice(0, 50).map((f) => <li key={f.linea}><span className="font-mono text-slate-400">Línea {f.linea}:</span> {f.errores.join(' ')}</li>)}
                      {validacion.duplicadas.slice(0, 50).map((f) => <li key={f.linea}><span className="font-mono text-slate-400">Línea {f.linea}:</span> {f.duplicado === 'existente' ? 'ya existe en tu taller' : 'repetida dentro del archivo'}</li>)}
                      {omitidas > 100 && <li className="text-slate-400">… y más (se incluyen todas en el informe descargable).</li>}
                    </ul>
                  </details>
                )}
              </>
            )}

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              <button onClick={() => { setPaso('archivo'); setError(''); }} className="px-3.5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-2xl transition cursor-pointer">Elegir otro archivo</button>
              <button onClick={() => void importar()} disabled={faltan.length > 0 || validacion.validas.length === 0}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Check className="w-4 h-4" /> Importar {validacion.validas.length} {nombre(validacion.validas.length)}
              </button>
            </div>
          </div>
        )}

        {paso === 'importando' && (
          <div className="py-8 text-center space-y-3" aria-live="polite">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">Importando {progreso.hechas.toLocaleString('es-ES')} de {progreso.total.toLocaleString('es-ES')}…</p>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-sm mx-auto">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${progreso.total ? (progreso.hechas / progreso.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-slate-400">No cierres esta ventana.</p>
          </div>
        )}

        {paso === 'resultado' && resultado && validacion && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className={`w-8 h-8 ${resultado.importadas > 0 ? 'text-green-600' : 'text-slate-300'}`} />
              <div>
                <p className="text-sm font-bold text-slate-800">{resultado.importadas.toLocaleString('es-ES')} {nombre(resultado.importadas)} {resultado.importadas === 1 ? 'importado' : 'importados'}</p>
                <p className="text-xs text-slate-500">
                  {validacion.duplicadas.length} duplicados omitidos · {validacion.conErrores.length + resultado.fallidas.length} con errores
                </p>
              </div>
            </div>
            {resultado.fallidas.length > 0 && (
              <ul className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 space-y-1 max-h-32 overflow-y-auto">
                {resultado.fallidas.slice(0, 30).map((f) => <li key={f.linea}>Línea {f.linea}: {f.mensaje}</li>)}
              </ul>
            )}
            {resultado.avisos.length > 0 && (
              <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 space-y-1 max-h-32 overflow-y-auto">
                {resultado.avisos.slice(0, 30).map((a, i) => <li key={i}>{a.linea ? `Línea ${a.linea}: ` : ''}{a.mensaje}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              {omitidas + resultado.fallidas.length + resultado.avisos.length > 0
                ? <button onClick={descargarInforme} className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-semibold rounded-2xl transition cursor-pointer"><FileDown className="w-4 h-4" /> Descargar informe</button>
                : <span />}
              <button onClick={onClose} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer">Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
