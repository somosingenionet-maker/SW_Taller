import { useState } from 'react';
import { Check, UserPlus, X } from 'lucide-react';
import type { Cliente, Vehiculo } from '../types';
import type { NuevoCliente } from '../lib/data/clientes';
import type { NuevoVehiculo } from '../lib/data/vehiculos';
import { mensajeDeError } from '../lib/errores';
import SearchableSelect from './SearchableSelect';

interface Props {
  /** `cliente`: solo se da de alta un cliente. `vehiculo`: un vehículo y su dueño (existente o nuevo). */
  modo: 'cliente' | 'vehiculo';
  clientes: Cliente[];
  /** Lo que se había escrito en el buscador: se aprovecha como matrícula (vehículo) o como nombre (cliente). */
  textoInicial?: string;
  /** Cliente ya elegido en la orden (al crear un vehículo se queda como dueño). */
  clienteIdInicial?: string;
  onCrearCliente: (input: NuevoCliente) => Promise<Cliente>;
  onCrearVehiculo: (input: NuevoVehiculo, clienteId: string) => Promise<Vehiculo>;
  onListo: (r: { clienteId?: string; vehiculoId?: string }) => void;
  onCerrar: () => void;
}

const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400';
const etiqueta = 'block text-xs font-semibold text-slate-600 mb-1';

/**
 * Alta rápida desde la orden de trabajo: lo mínimo para no cortar la recepción (cliente: nombre, apellidos y teléfono; vehículo: matrícula, marca y modelo).
 * El resto de datos (documento, correo, bastidor, ITV, seguro…) se completa después en su ficha.
 */
export default function AltaRapida({ modo, clientes, textoInicial = '', clienteIdInicial = '', onCrearCliente, onCrearVehiculo, onListo, onCerrar }: Props) {
  const texto = textoInicial.trim();
  const [duenoNuevo, setDuenoNuevo] = useState(modo === 'cliente' || (!clienteIdInicial && clientes.length === 0));
  const [clienteId, setClienteId] = useState(clienteIdInicial);
  const [nombre, setNombre] = useState(modo === 'cliente' ? texto : '');
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [nif, setNif] = useState('');
  const [matricula, setMatricula] = useState(modo === 'vehiculo' ? texto.toUpperCase() : '');
  const [marca, setMarca] = useState('');
  const [modelo, setModelo] = useState('');
  const [km, setKm] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (modo === 'vehiculo' && (!matricula.trim() || !marca.trim() || !modelo.trim())) { setError('Faltan la matrícula, la marca o el modelo.'); return; }
    if (duenoNuevo && (!nombre.trim() || !apellidos.trim() || !telefono.trim())) { setError('Del cliente hacen falta el nombre, los apellidos y un teléfono.'); return; }
    if (!duenoNuevo && !clienteId) { setError('Elige el cliente al que pertenece el coche.'); return; }
    setGuardando(true);
    try {
      let dueno = clienteId;
      if (duenoNuevo) {
        const c = await onCrearCliente({
          nombre: nombre.trim(), apellidos: apellidos.trim(), nifNiePasaporte: nif.trim(), correo: correo.trim(), telefono: telefono.trim(),
          direccion: '', ciudad: '', pais: 'España', vehiculosAsociados: [],
        });
        dueno = c.id;
      }
      if (modo === 'cliente') { onListo({ clienteId: dueno }); return; }
      const v = await onCrearVehiculo({
        marca: marca.trim(), modelo: modelo.trim(), matricula: matricula.trim().toUpperCase(), bastidor: '', kilometraje: Number(km) || 0,
        itvVencimiento: '', seguroVencimiento: '', impuestoVencimiento: '',
      }, dueno);
      onListo({ clienteId: dueno, vehiculoId: v.id });
    } catch (err) {
      setError(mensajeDeError(err, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  };

  const titulo = modo === 'cliente' ? 'Nuevo cliente' : 'Nuevo vehículo';
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Alta rápida: ${titulo.toLowerCase()}`} data-testid="alta-rapida">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-overlay-fade" onClick={guardando ? undefined : onCerrar} />
      <form onSubmit={guardar} className="relative bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto animate-modal-pop p-6 space-y-4 dlg-b">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2"><UserPlus className="w-5 h-5" /> {titulo}</p>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" disabled={guardando}><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500">Solo lo imprescindible para seguir con la orden. El resto lo completas después en {modo === 'cliente' ? 'Clientes' : 'su ficha'}.</p>

        {modo === 'vehiculo' && (
          <section className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Vehículo</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 sm:col-span-1"><label className={etiqueta} htmlFor="ar-matricula">Matrícula *</label>
                <input id="ar-matricula" className={`${campo} font-mono uppercase`} value={matricula} onChange={(e) => setMatricula(e.target.value)} autoFocus placeholder="1234 ABC" /></div>
              <div className="col-span-3 sm:col-span-1"><label className={etiqueta} htmlFor="ar-marca">Marca *</label>
                <input id="ar-marca" className={campo} value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Seat" /></div>
              <div className="col-span-3 sm:col-span-1"><label className={etiqueta} htmlFor="ar-modelo">Modelo *</label>
                <input id="ar-modelo" className={campo} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="León" /></div>
            </div>
            <div className="max-w-[12rem]"><label className={etiqueta} htmlFor="ar-km">Kilometraje (opcional)</label>
              <input id="ar-km" type="number" min="0" className={`${campo} font-mono`} value={km} onChange={(e) => setKm(e.target.value)} placeholder="0" /></div>
          </section>
        )}

        <section className="space-y-3">
          {modo === 'vehiculo' && (
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">¿De quién es?</p>
              <div className="inline-flex bg-slate-100 rounded-xl p-0.5 text-xs font-semibold" role="group" aria-label="Dueño del coche">
                <button type="button" aria-pressed={!duenoNuevo} onClick={() => setDuenoNuevo(false)} className={`px-3 py-1.5 rounded-lg ${!duenoNuevo ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Cliente existente</button>
                <button type="button" aria-pressed={duenoNuevo} onClick={() => setDuenoNuevo(true)} className={`px-3 py-1.5 rounded-lg ${duenoNuevo ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`} data-testid="ar-dueno-nuevo">Cliente nuevo</button>
              </div>
            </div>
          )}
          {!duenoNuevo ? (
            <SearchableSelect
              options={clientes.map(c => ({ value: c.id, label: `${c.nombre} ${c.apellidos}`, sublabel: [c.telefono, c.nifNiePasaporte].filter(Boolean).join(' · ') }))}
              value={clienteId} onChange={setClienteId} placeholder="Buscar cliente por nombre, teléfono o documento…" emptyMessage="Ningún cliente coincide" required
            />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className={etiqueta} htmlFor="ar-nombre">Nombre *</label><input id="ar-nombre" className={campo} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={modo === 'cliente'} autoComplete="off" /></div>
                <div><label className={etiqueta} htmlFor="ar-apellidos">Apellidos *</label><input id="ar-apellidos" className={campo} value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="off" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={etiqueta} htmlFor="ar-telefono">Teléfono *</label><input id="ar-telefono" type="tel" className={campo} value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="600 000 000" autoComplete="off" /></div>
                <div><label className={etiqueta} htmlFor="ar-correo">Correo (opcional)</label><input id="ar-correo" type="email" className={campo} value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="off" /></div>
              </div>
              <div className="max-w-[16rem]"><label className={etiqueta} htmlFor="ar-nif">NIF / NIE (opcional)</label><input id="ar-nif" className={`${campo} font-mono`} value={nif} onChange={(e) => setNif(e.target.value)} autoComplete="off" />
                <p className="text-[11px] text-slate-400 mt-1">Hará falta para facturar: puedes añadirlo después.</p></div>
            </div>
          )}
        </section>

        {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-4 py-2.5 rounded-xl" data-testid="alta-rapida-error">{error}</div>}

        <div className="dlg-pie">
          <button type="button" onClick={onCerrar} disabled={guardando} className="border border-slate-200 text-slate-600">Cancelar</button>
          <button type="submit" disabled={guardando} className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60" data-testid="alta-rapida-guardar">
            <Check className="w-4 h-4" /> {guardando ? 'Guardando…' : modo === 'cliente' ? 'Crear cliente' : 'Crear vehículo'}
          </button>
        </div>
      </form>
    </div>
  );
}
