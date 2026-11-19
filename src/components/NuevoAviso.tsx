import { useMemo, useState } from 'react';
import { BellPlus, Check, X } from 'lucide-react';
import type { Cliente, Empresa, Vehiculo } from '../types';
import type { NuevoAviso as DatosAviso } from '../lib/data/avisos';
import { mensajeDeError } from '../lib/errores';
import { sumarMeses } from '../utils/aceite';
import { canalDelCliente, descripcionVehiculo, mensajeParaCliente } from '../utils/avisos';
import { MOTIVOS_AVISO } from '../utils/recordatorioTemplates';
import SearchableSelect from './SearchableSelect';

interface Props {
  empresa: Pick<Empresa, 'nombre' | 'plantillasRecordatorios' | 'reservasActivas' | 'reservasSlug'>;
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  /** Cliente y coche ya elegidos (al crearlo desde la ficha de un coche o desde una orden). */
  clienteIdInicial?: string;
  vehiculoIdInicial?: string;
  ordenId?: string;
  onGuardar: (a: DatosAviso) => Promise<void>;
  onCerrar: () => void;
}

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const etiqueta = 'block text-xs font-semibold text-slate-600 mb-1';
const chip = (activo: boolean) => `px-3 py-1.5 rounded-xl text-sm font-semibold border cursor-pointer ${activo ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`;

const PLAZOS = [{ meses: 1, texto: 'En 1 mes' }, { meses: 3, texto: 'En 3 meses' }, { meses: 6, texto: 'En 6 meses' }, { meses: 12, texto: 'En 1 año' }] as const;
const REPETICIONES = [{ meses: 0, texto: 'Solo una vez' }, { meses: 6, texto: 'Cada 6 meses' }, { meses: 12, texto: 'Cada año' }] as const;

/**
 * «Nuevo aviso»: un recordatorio puntual para un cliente («neumáticos en 6 meses»). Sale solo por correo el día elegido si el cliente
 * tiene; si no, aparece en «Para hoy» para mandarlo por WhatsApp. El texto viene hecho según el motivo y se puede cambiar.
 */
export default function NuevoAviso({ empresa, clientes, vehiculos, clienteIdInicial = '', vehiculoIdInicial = '', ordenId, onGuardar, onCerrar }: Props) {
  const [clienteId, setClienteId] = useState(clienteIdInicial);
  const vehiculosDelCliente = useMemo(() => {
    const c = clientes.find((x) => x.id === clienteId);
    const ids = new Set(c?.vehiculosAsociados ?? []);
    return vehiculos.filter((v) => ids.has(v.id));
  }, [clientes, vehiculos, clienteId]);
  const [vehiculoId, setVehiculoId] = useState(vehiculoIdInicial);
  const vehiculoElegido = vehiculosDelCliente.find((v) => v.id === vehiculoId) ?? (vehiculosDelCliente.length === 1 ? vehiculosDelCliente[0] : undefined);

  const [motivoId, setMotivoId] = useState('neumaticos');
  const motivoBase = MOTIVOS_AVISO.find((m) => m.id === motivoId) ?? MOTIVOS_AVISO[0];
  const [motivoLibre, setMotivoLibre] = useState('');
  const motivo = motivoId === 'otro' ? motivoLibre.trim() : motivoBase.etiqueta;

  const [modoCuando, setModoCuando] = useState<'plazo' | 'fecha' | 'km'>('plazo');
  const [meses, setMeses] = useState<number>(6);
  const [fecha, setFecha] = useState('');
  const [km, setKm] = useState('');
  const [repetir, setRepetir] = useState(0);
  const [texto, setTexto] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cliente = clientes.find((c) => c.id === clienteId);
  const canal = canalDelCliente(cliente);
  const avisarEn = modoCuando === 'plazo' ? sumarMeses(meses) : modoCuando === 'fecha' ? fecha : undefined;
  const mensaje = texto ?? motivoBase.mensaje;
  const vistaPrevia = cliente ? mensajeParaCliente(
    { origen: 'personalizado', tipo: 'personalizado' },
    { empresa: { ...empresa, reservasActivas: false }, cliente, vehiculo: vehiculoElegido, personalizado: { motivo, mensaje }, origen: '' },
  ) : '';

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!clienteId) return setError('Elige el cliente.');
    if (!vehiculoElegido) return setError(vehiculosDelCliente.length === 0 ? 'Este cliente no tiene ningún vehículo: añádele uno primero.' : 'Elige el vehículo.');
    if (!motivo) return setError('Escribe el motivo del aviso.');
    if (modoCuando === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError('Elige la fecha en que quieres avisarle.');
    if (modoCuando === 'km' && !(Number(km) > 0)) return setError('Indica a qué kilometraje quieres avisarle.');
    if (!mensaje.trim()) return setError('El mensaje para el cliente no puede quedar vacío.');
    setGuardando(true);
    try {
      await onGuardar({
        clienteId, vehiculoId: vehiculoElegido.id, motivo, mensaje: mensaje.trim(), nota: nota || undefined, ordenId,
        avisarEn: avisarEn || undefined, avisarKm: modoCuando === 'km' ? Math.round(Number(km)) : undefined,
        repetirMeses: repetir > 0 && modoCuando !== 'km' ? repetir : undefined,
      });
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar el aviso.'));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nuevo aviso" data-testid="nuevo-aviso">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={guardando ? undefined : onCerrar} />
      <form onSubmit={guardar} className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto animate-modal-pop p-6 space-y-4 dlg-b">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2"><BellPlus className="w-5 h-5" /> Nuevo aviso para un cliente</p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500">Un recordatorio puntual: neumáticos, frenos, la revisión… Se le avisa solo el día elegido si tiene correo; si no, te sale en «Para hoy» para mandárselo por WhatsApp.</p>

        <section className="space-y-3">
          <div>
            <label className={etiqueta} htmlFor="na-cliente">Cliente *</label>
            <SearchableSelect
              options={clientes.map((c) => ({ value: c.id, label: `${c.nombre} ${c.apellidos}`, sublabel: [c.telefono, c.correo].filter(Boolean).join(' · ') }))}
              value={clienteId} onChange={(v) => { setClienteId(v); setVehiculoId(''); }} placeholder="Buscar cliente por nombre o teléfono…" emptyMessage="Ningún cliente coincide" required
            />
          </div>
          {cliente && canal === 'no_avisar' && <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 rounded-xl px-3 py-2">Este cliente pidió no recibir avisos: el aviso se guardará pero no se le enviará. Quita la marca en su ficha si ha cambiado de opinión.</p>}
          {cliente && canal === 'whatsapp' && <p className="text-xs text-slate-500">No tiene correo en su ficha: ese día te saldrá en «Para hoy» para avisarle por WhatsApp.</p>}
          {cliente && canal === 'sin_contacto' && <p className="text-xs text-amber-700">No tiene correo ni teléfono en su ficha: añádelos para poder avisarle.</p>}
          {cliente && vehiculosDelCliente.length > 1 && (
            <div>
              <label className={etiqueta} htmlFor="na-vehiculo">Vehículo *</label>
              <select id="na-vehiculo" className={campo} value={vehiculoElegido?.id ?? ''} onChange={(e) => setVehiculoId(e.target.value)}>
                <option value="">Elige el vehículo…</option>
                {vehiculosDelCliente.map((v) => <option key={v.id} value={v.id}>{descripcionVehiculo(v)}</option>)}
              </select>
            </div>
          )}
          {cliente && vehiculosDelCliente.length === 1 && <p className="text-sm text-slate-600">Vehículo: <b>{descripcionVehiculo(vehiculosDelCliente[0])}</b></p>}
        </section>

        <section className="space-y-2">
          <p className={etiqueta}>¿Qué quieres recordarle?</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo">
            {MOTIVOS_AVISO.map((m) => <button key={m.id} type="button" aria-pressed={motivoId === m.id} className={chip(motivoId === m.id)} onClick={() => { setMotivoId(m.id); setTexto(null); }}>{m.etiqueta}</button>)}
          </div>
          {motivoId === 'otro' && <input className={campo} value={motivoLibre} onChange={(e) => setMotivoLibre(e.target.value)} maxLength={80} placeholder="Por ejemplo: pintura del paragolpes" aria-label="Motivo del aviso" />}
        </section>

        <section className="space-y-2">
          <p className={etiqueta}>¿Cuándo le avisamos?</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cuándo avisar">
            {PLAZOS.map((p) => <button key={p.meses} type="button" aria-pressed={modoCuando === 'plazo' && meses === p.meses} className={chip(modoCuando === 'plazo' && meses === p.meses)} onClick={() => { setModoCuando('plazo'); setMeses(p.meses); }}>{p.texto}</button>)}
            <button type="button" aria-pressed={modoCuando === 'fecha'} className={chip(modoCuando === 'fecha')} onClick={() => setModoCuando('fecha')}>Una fecha</button>
            <button type="button" aria-pressed={modoCuando === 'km'} className={chip(modoCuando === 'km')} onClick={() => setModoCuando('km')}>A los km</button>
          </div>
          {modoCuando === 'fecha' && <input type="date" className={`${campo} max-w-[12rem]`} value={fecha} min={sumarMeses(0)} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha del aviso" />}
          {modoCuando === 'km' && (
            <div className="max-w-[14rem]">
              <input type="number" min="1" className={`${campo} font-mono`} value={km} onChange={(e) => setKm(e.target.value)} placeholder={vehiculoElegido ? `Ahora lleva ${vehiculoElegido.kilometraje}` : 'Kilómetros'} aria-label="Kilometraje del aviso" />
              <p className="text-[11px] text-slate-400 mt-1">Se avisa cuando le falten 500 km o menos, según los km anotados en la ficha del coche.</p>
            </div>
          )}
          {modoCuando !== 'km' && avisarEn && <p className="text-xs text-slate-500">Se le avisará el <b>{avisarEn.split('-').reverse().join('/')}</b>.</p>}
        </section>

        {modoCuando !== 'km' && (
          <section className="space-y-2">
            <p className={etiqueta}>¿Se repite?</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Repetición">
              {REPETICIONES.map((r) => <button key={r.meses} type="button" aria-pressed={repetir === r.meses} className={chip(repetir === r.meses)} onClick={() => setRepetir(r.meses)}>{r.texto}</button>)}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <label className={etiqueta} htmlFor="na-mensaje">Mensaje para el cliente</label>
          <textarea id="na-mensaje" className={`${campo} min-h-[8.5rem]`} value={mensaje} onChange={(e) => setTexto(e.target.value)} maxLength={1500} />
          <p className="text-[11px] text-slate-400">Variables: {'{{cliente}}'}, {'{{vehiculo}}'}, {'{{empresa}}'}. {empresa.reservasActivas && empresa.reservasSlug ? 'Al enviarlo se añade el enlace para reservar cita.' : ''}</p>
          {vistaPrevia && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Así lo verá {cliente?.nombre}</p>
              <p className="text-sm text-slate-700 whitespace-pre-line" data-testid="aviso-vista-previa">{vistaPrevia}</p>
            </div>
          )}
        </section>

        <div>
          <label className={etiqueta} htmlFor="na-nota">Nota para ti (el cliente no la ve)</label>
          <input id="na-nota" className={campo} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Por ejemplo: tiene los neumáticos al 30 %" />
        </div>

        <div className="dlg-pie">
          {error && <p role="alert" className="mr-auto text-xs font-semibold text-rose-700" data-testid="nuevo-aviso-error">{error}</p>}
          <button type="button" onClick={onCerrar} disabled={guardando} className="border border-slate-200 text-slate-600">Cancelar</button>
          <button type="submit" disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60" data-testid="nuevo-aviso-guardar">
            <Check className="w-4 h-4" /> {guardando ? 'Guardando…' : 'Programar aviso'}
          </button>
        </div>
      </form>
    </div>
  );
}
