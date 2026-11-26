import { useState } from 'react';
import { CreditCard, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { abrirPortal, avisoSuscripcion, diasRestantes, finPeriodo, iniciarCheckout, type Suscripcion } from '../lib/data/suscripcion';
import { updateEmpresa } from '../lib/data/empresa';
import type { Empresa } from '../types';

interface Props {
  suscripcion: Suscripcion;
  /** Solo el administrador de la empresa puede pagar o gestionar la suscripción. */
  esAdmin: boolean;
  empresa: Empresa;
  /** Tras guardar los datos de facturación, para que el resto de la app los vea. */
  onEmpresaActualizada: (e: Empresa) => void;
  onClose: () => void;
}

type DatosFacturacion = Pick<Empresa, 'razonSocial' | 'nif' | 'direccionFiscal' | 'ciudad'>;
/** En pantalla el código postal va aparte; en la base se guarda al final de la dirección fiscal. */
type DatosForm = { razonSocial: string; nif: string; direccion: string; cp: string; ciudad: string };
const separarCp = (dir: string): { direccion: string; cp: string } => {
  const alFinal = dir.match(/^(.*?)[,\s]*\b(\d{5})\s*$/);
  if (alFinal) return { direccion: alFinal[1].trim(), cp: alFinal[2] };
  return { direccion: dir, cp: dir.match(/\b\d{5}\b/)?.[0] ?? '' }; // CP en medio: se deja donde está
};
const unirCp = (direccion: string, cp: string) => (new RegExp(`\\b${cp}\\b`).test(direccion) ? direccion : `${direccion}, ${cp}`);
const completos = (d: DatosForm) => [d.razonSocial, d.nif, d.direccion, d.cp, d.ciudad].every((v) => v.trim() !== '');
const entrada = 'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');

const ETIQUETA: Record<Suscripcion['estado'], string> = {
  sin_limite: 'Cuenta sin límite', prueba: 'Prueba gratuita', activa: 'Suscripción activa',
  impago: 'Pago pendiente', cancelada: 'Suscripción cancelada', vencida: 'Acceso de solo lectura',
};

/** Estado de la suscripción y botones para pagar o gestionar el método de pago en Stripe. */
export default function SuscripcionPanel({ suscripcion: s, esAdmin, empresa, onEmpresaActualizada, onClose }: Props) {
  const [plan, setPlan] = useState<'mensual' | 'anual'>('anual');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [datos, setDatos] = useState<DatosForm>(() => ({
    razonSocial: empresa.razonSocial, nif: empresa.nif, ...separarCp(empresa.direccionFiscal), ciudad: empresa.ciudad,
  }));
  // Se piden siempre que falte algo; si ya están, se enseñan resumidos con opción de cambiarlos.
  const [editandoDatos, setEditandoDatos] = useState(() => !completos({ razonSocial: empresa.razonSocial, nif: empresa.nif, ...separarCp(empresa.direccionFiscal), ciudad: empresa.ciudad }));
  const set = (k: keyof DatosForm, v: string) => setDatos((d) => ({ ...d, [k]: v }));

  /** Guarda los datos de facturación si han cambiado y abre el pago. El servidor vuelve a comprobarlos. */
  const suscribirme = () => void ir(async () => {
    const f: DatosForm = {
      razonSocial: datos.razonSocial.trim(), nif: datos.nif.toUpperCase().replace(/[\s.\-]/g, ''),
      direccion: datos.direccion.trim().replace(/[,\s]+$/, ''), cp: datos.cp.replace(/\s/g, ''), ciudad: datos.ciudad.trim(),
    };
    if (!completos(f)) { setEditandoDatos(true); throw new Error('Rellena los datos de facturación para continuar.'); }
    if (!/^\d{5}$/.test(f.cp)) { setEditandoDatos(true); throw new Error('El código postal son 5 cifras.'); }
    const limpio: DatosFacturacion = { razonSocial: f.razonSocial, nif: f.nif, direccionFiscal: unirCp(f.direccion, f.cp), ciudad: f.ciudad };
    const cambiados = (Object.keys(limpio) as (keyof DatosFacturacion)[]).some((k) => limpio[k] !== empresa[k]);
    if (cambiados) onEmpresaActualizada(await updateEmpresa(empresa.id, limpio));
    try {
      return await iniciarCheckout(plan);
    } catch (e) {
      setEditandoDatos(true); // si el servidor rechaza el NIF o la dirección, que se vean para corregirlos
      throw e;
    }
  });
  const aviso = avisoSuscripcion(s);
  // Le quedan al menos 49 h de prueba: la primera cuota se cobra al acabarla (ver finPruebaParaCheckout en billing).
  const pruebaSigue = s.estado === 'prueba' && !!s.accesoHasta && Date.parse(s.accesoHasta) - Date.now() >= 49 * 3_600_000;
  const puedePagar = s.estado !== 'sin_limite' && !(s.estadoStripe === 'activa' && s.tieneCliente && s.estado !== 'vencida');

  // El error sale justo encima del botón pulsado, que es donde está mirando el taller.
  const alerta = error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl">{error}</div>;

  const ir = async (fn: () => Promise<string>) => {
    setError(''); setOcupado(true);
    try {
      window.location.href = await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el pago.');
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Suscripción" className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-modal-pop p-6 space-y-4 dlg-b">
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-slate-800 flex items-center gap-2"><CreditCard className="w-4 h-4 text-blue-600" /> Suscripción</p>
          <button onClick={onClose} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 transition cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="border border-slate-200 rounded-2xl p-4 space-y-1">
          <p className="text-sm font-bold text-slate-800">{ETIQUETA[s.estado]}</p>
          {s.estado === 'prueba' && <p className="text-xs text-slate-500">Te quedan {diasRestantes(s.accesoHasta)} días (hasta el {fecha(s.accesoHasta)}).</p>}
          {s.estado === 'activa' && finPeriodo(s) && (
            <p className="text-xs text-slate-500">
              {s.plan ? `Plan ${s.plan}. ` : ''}{s.cancelarAlFinal ? 'Termina el' : 'Próxima renovación:'} {fecha(finPeriodo(s))}.
            </p>
          )}
          {aviso && !(s.estado === 'prueba' && aviso.nivel === 'info') && <p className={`text-xs ${aviso.nivel === 'error' ? 'text-rose-600' : aviso.nivel === 'aviso' ? 'text-amber-700' : 'text-slate-500'}`}>{aviso.texto}</p>}
        </div>

        {!esAdmin ? (
          <p className="text-xs text-slate-500">Solo el administrador de tu empresa puede pagar o gestionar la suscripción. Pídeselo si tu acceso está limitado.</p>
        ) : s.estado === 'sin_limite' ? null : (
          <>
            {puedePagar && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'mensual', titulo: 'Mensual', precio: '69,90\u00a0€', nota: 'al mes + IVA' },
                    { id: 'anual', titulo: 'Anual', precio: '754,92\u00a0€', nota: 'al año + IVA · 10\u00a0% de ahorro' },
                  ] as const).map((o) => (
                    <button key={o.id} onClick={() => setPlan(o.id)} aria-pressed={plan === o.id}
                      className={`text-left rounded-2xl border p-3 transition cursor-pointer ${plan === o.id ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <p className="text-xs font-bold text-slate-500">{o.titulo}</p>
                      <p className="text-lg font-black text-slate-800">{o.precio}</p>
                      <p className="text-[11px] text-slate-500">{o.nota}</p>
                    </button>
                  ))}
                </div>
                {!s.tieneCliente && (pruebaSigue ? (
                  // Igual que billing (finPruebaParaCheckout): con 49 h o más de prueba, la primera cuota espera.
                  <p className="text-xs text-slate-500">Hoy solo se cobra la <b>cuota de alta de 199&nbsp;€ + IVA</b> (una sola vez). La primera cuota se cobra el <b>{fecha(s.accesoHasta)}</b>, cuando acaba tu prueba: no pierdes los días que te quedan.</p>
                ) : (
                  <p className="text-xs text-slate-500">La primera factura incluye además la <b>cuota de alta de 199&nbsp;€ + IVA</b>, una sola vez.</p>
                ))}
                <div className="border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-700">Datos de facturación</p>
                    {!editandoDatos && (
                      <button onClick={() => setEditandoDatos(true)} className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">Cambiar</button>
                    )}
                  </div>
                  {editandoDatos ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500">Los necesitamos para hacerte la factura de cada cobro.</p>
                      <input aria-label="Razón social" placeholder="Razón social o nombre completo" value={datos.razonSocial} onChange={(e) => set('razonSocial', e.target.value)} className={entrada} />
                      <input aria-label="NIF" placeholder="NIF (B12345678, 12345678Z…)" value={datos.nif} onChange={(e) => set('nif', e.target.value)} className={entrada} />
                      <input aria-label="Dirección fiscal" placeholder="Dirección (calle y número)" value={datos.direccion} onChange={(e) => set('direccion', e.target.value)} className={entrada} />
                      <div className="grid grid-cols-[7rem_1fr] gap-2">
                        <input aria-label="Código postal" placeholder="C. postal" inputMode="numeric" maxLength={5} value={datos.cp} onChange={(e) => set('cp', e.target.value)} className={entrada} />
                        <input aria-label="Ciudad" placeholder="Ciudad" value={datos.ciudad} onChange={(e) => set('ciudad', e.target.value)} className={entrada} />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {datos.razonSocial} · {datos.nif}<br />{datos.direccion}, {datos.cp} {datos.ciudad}
                    </p>
                  )}
                </div>
                {alerta}
                <button onClick={suscribirme} disabled={ocupado}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                  <ShieldCheck className="w-4 h-4" /> {ocupado ? 'Abriendo el pago…' : 'Suscribirme'}
                </button>
                <p className="text-[11px] text-slate-400 text-center">Pago seguro con tarjeta a través de Stripe. Puedes cancelar cuando quieras.</p>
              </div>
            )}
            {!puedePagar && alerta}
            {s.tieneCliente && (
              <button onClick={() => void ir(abrirPortal)} disabled={ocupado}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-bold rounded-2xl transition cursor-pointer disabled:opacity-60">
                <ExternalLink className="w-4 h-4" /> Gestionar suscripción y facturas
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
