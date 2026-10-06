import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Upload, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import type { Empresa } from '../types';
import {
  eliminarCertificado,
  getCertificadoEstado,
  subirCertificado,
  type CertificadoEstado,
} from '../lib/data/verifactu';

interface Props {
  draft: Empresa;
  setDraft: React.Dispatch<React.SetStateAction<Empresa>>;
}

const formatoFecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Días que le quedan al certificado (negativo si ya caducó). */
export function diasHastaCaducidad(validoHasta: string, ahora: Date = new Date()): number {
  return Math.ceil((new Date(validoHasta).getTime() - ahora.getTime()) / 86_400_000);
}

export default function VerifactuSettings({ draft, setDraft }: Props) {
  const [estado, setEstado] = useState<CertificadoEstado | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const cargar = () =>
    getCertificadoEstado().then(setEstado).catch((e: Error) => setErrorCarga(e.message));
  useEffect(() => { cargar(); }, []);

  const handleSubir = async () => {
    if (!archivo || !password) return;
    setSubiendo(true);
    setError('');
    setAviso('');
    try {
      const r = await subirCertificado(archivo, password);
      setAviso(r.avisoNif ?? '');
      setArchivo(null);
      setPassword('');
      if (inputArchivo.current) inputArchivo.current.value = '';
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el certificado.');
    } finally {
      setSubiendo(false);
    }
  };

  const handleQuitar = async () => {
    setError('');
    try {
      await eliminarCertificado();
      // El servidor desactiva el envío al quitar el certificado: se refleja en el borrador
      // para que un "Guardar" posterior no intente reactivarlo.
      setDraft(prev => ({ ...prev, verifactuEnvioActivo: false }));
      setConfirmarQuitar(false);
      setAviso('');
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el certificado.');
    }
  };

  const dias = estado?.existe && estado.validoHasta ? diasHastaCaducidad(estado.validoHasta) : null;
  const caducado = dias !== null && dias < 0;
  const caducaPronto = dias !== null && dias >= 0 && dias <= 30;

  return (
    <section className="space-y-3">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" /> Facturación electrónica (VERI*FACTU)
      </p>
      <p className="text-[10px] text-slate-400 -mt-1">
        Desde el 1 ene 2027 (empresas) y el 1 jul 2027 (autónomos) las facturas deben enviarse a la AEAT. Doonty Motor las envía
        automáticamente al emitirlas, con el certificado electrónico de tu empresa — el mismo que usas en la sede de la AEAT.
      </p>

      {errorCarga && <p className="text-[11px] text-rose-500">No se pudo comprobar el certificado: {errorCarga}</p>}

      {/* Certificado */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2.5">
        <p className="text-xs font-semibold text-slate-600">Certificado electrónico</p>

        {estado === null && !errorCarga && (
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Comprobando…</p>
        )}

        {estado?.existe ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-700">
              <b>{estado.titularNombre ?? 'Titular sin identificar'}</b>
              {estado.titularNif && <> · <span className="font-mono">{estado.titularNif}</span></>}
              {estado.validoHasta && <> · válido hasta {formatoFecha(estado.validoHasta)}</>}
            </p>
            {caducado && (
              <p className="text-[11px] text-rose-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> El certificado ha caducado: no se puede enviar a la AEAT hasta subir uno vigente.
              </p>
            )}
            {caducaPronto && (
              <p className="text-[11px] text-amber-600 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> Caduca en {dias} {dias === 1 ? 'día' : 'días'}: renuévalo para no interrumpir el envío.
              </p>
            )}
            {!confirmarQuitar ? (
              <button
                onClick={() => setConfirmarQuitar(true)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-500 transition"
              >
                <Trash2 className="w-3 h-3" /> Quitar certificado
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-slate-500">Se dejará de enviar a la AEAT. ¿Quitarlo?</span>
                <button onClick={handleQuitar} className="font-bold text-rose-600 hover:underline">Sí, quitar</button>
                <button onClick={() => setConfirmarQuitar(false)} className="text-slate-400 hover:underline">Cancelar</button>
              </div>
            )}
          </div>
        ) : estado ? (
          <p className="text-[11px] text-slate-500">Todavía no hay ningún certificado cargado.</p>
        ) : null}

        {/* Subir (o sustituir) */}
        <div className="space-y-2 pt-1">
          <input
            ref={inputArchivo}
            type="file"
            accept=".p12,.pfx,application/x-pkcs12"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-[11px] text-slate-500 file:mr-3 file:px-3 file:py-1.5 file:rounded-xl file:border file:border-blue-200 file:bg-blue-50 file:text-blue-700 file:text-xs file:font-semibold hover:file:bg-blue-100"
          />
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña del certificado"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSubir}
            disabled={!archivo || !password || subiendo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {estado?.existe ? 'Sustituir certificado' : 'Guardar certificado'}
          </button>
          <p className="text-[10px] text-slate-400">
            Archivo .p12 o .pfx (el que exportas de tu navegador o de la FNMT). Se guarda cifrado en el servidor: nadie puede leerlo desde la base de datos.
          </p>
          {error && <p className="text-[11px] text-rose-500">{error}</p>}
          {aviso && <p className="text-[11px] text-amber-600">{aviso}</p>}
        </div>
      </div>

      {/* Entorno */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Entorno de la AEAT</label>
        <select
          value={draft.verifactuEntorno}
          onChange={e => setDraft(prev => ({ ...prev, verifactuEntorno: e.target.value === 'produccion' ? 'produccion' : 'pruebas' }))}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="pruebas">Pruebas (sin validez fiscal)</option>
          <option value="produccion">Producción (envío real)</option>
        </select>
        <p className="text-[10px] text-slate-400 mt-1">
          {draft.verifactuEntorno === 'pruebas'
            ? 'Empieza en Pruebas para comprobar que todo llega bien: lo que se envía ahí no tiene efectos fiscales.'
            : 'En Producción cada factura que emitas queda registrada en la AEAT con efectos fiscales reales.'}
        </p>
      </div>

      {/* Activar */}
      <label className={`flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2.5 ${estado?.existe ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
        <span className="text-xs text-slate-600">Enviar las facturas a la AEAT automáticamente</span>
        <input
          type="checkbox"
          checked={draft.verifactuEnvioActivo}
          disabled={!estado?.existe}
          onChange={e => setDraft(prev => ({ ...prev, verifactuEnvioActivo: e.target.checked }))}
          className="w-4 h-4 shrink-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </label>
      {!estado?.existe && <p className="text-[10px] text-slate-400 -mt-1">Sube primero el certificado para poder activar el envío.</p>}

      <p className="text-[10px] text-slate-400">
        Número de instalación ante la AEAT: <span className="font-mono text-slate-500 break-all">{draft.verifactuNumeroInstalacion}</span>
      </p>
    </section>
  );
}
