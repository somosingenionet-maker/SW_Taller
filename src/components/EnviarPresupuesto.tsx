import { useState } from 'react';
import { CheckCircle2, Copy, Mail, MessageCircle } from 'lucide-react';
import type { OrdenTrabajo } from '../types';
import { getEnlaceCliente } from '../lib/data/inspecciones';
import { getOrden } from '../lib/data/ordenes';
import { enviarPresupuesto } from '../lib/data/presupuestos';
import { mensajeDeError } from '../lib/errores';
import { abrirEnPestana, mensajePresupuesto, waHref } from '../utils/whatsapp';

interface Props {
  ot: OrdenTrabajo;
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  vehiculoDescripcion: string;
  empresaNombre: string;
  /** La orden tal como quedó en el servidor tras enviar el presupuesto. */
  onCambio: (ot: OrdenTrabajo) => void;
}

/** Envío real del presupuesto: correo con el enlace al portal del cliente, donde lo acepta o lo rechaza. */
export default function EnviarPresupuesto({ ot, clienteId, clienteNombre, clienteTelefono, vehiculoDescripcion, empresaNombre, onCambio }: Props) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const enviado = ot.presupuestoEstado === 'enviado';
  const rechazado = enviado && ot.presupuestoAprobado === false;

  const ejecutar = async (accion: () => Promise<string>, queFallo: string) => {
    setError(''); setAviso(''); setOcupado(true);
    try {
      const mensaje = await accion();
      onCambio(await getOrden(ot.id));
      setAviso(mensaje);
    } catch (e) {
      setError(mensajeDeError(e, queFallo));
    } finally {
      setOcupado(false);
    }
  };

  const enviarPorCorreo = () => ejecutar(async () => {
    await enviarPresupuesto(ot.id, true);
    return 'Presupuesto enviado al cliente por correo.';
  }, 'No se pudo enviar el presupuesto.');

  const copiarEnlace = () => ejecutar(async () => {
    // Si aún no estaba enviado, enviarlo (sin correo) lo marca y deja listo el enlace del cliente.
    const enlace = enviado && !rechazado
      ? await enlaceDelCliente(clienteId)
      : (await enviarPresupuesto(ot.id, false)).enlace;
    try { await navigator.clipboard.writeText(enlace); } catch { return `Enlace del cliente: ${enlace}`; }
    return 'Enlace copiado: pégalo en el mensaje al cliente (WhatsApp, SMS…).';
  }, 'No se pudo preparar el enlace.');

  /** WhatsApp con el mensaje y el enlace ya escritos; si el presupuesto no estaba enviado, lo marca como enviado. */
  const porWhatsApp = async () => {
    setError(''); setAviso(''); setOcupado(true);
    try {
      const resultado = await abrirEnPestana(async () => {
        const enlace = enviado && !rechazado ? await enlaceDelCliente(clienteId) : (await enviarPresupuesto(ot.id, false)).enlace;
        return waHref(clienteTelefono, mensajePresupuesto(clienteNombre || 'cliente', vehiculoDescripcion, empresaNombre, ot.numero, enlace));
      });
      if (resultado === 'sin_enlace') throw new Error('El cliente no tiene teléfono en su ficha: no se puede abrir WhatsApp.');
      onCambio(await getOrden(ot.id));
      setAviso(resultado === 'bloqueado' ? 'Tu navegador bloqueó la ventana de WhatsApp. Usa «Copiar enlace» y pégalo en el mensaje.' : 'WhatsApp abierto con el mensaje escrito: pulsa enviar.');
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo preparar el mensaje de WhatsApp.'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="enviar-presupuesto">
      <div className="flex gap-2 flex-wrap">
        <button type="button" disabled={ocupado} onClick={() => void enviarPorCorreo()} data-testid="enviar-presupuesto-correo"
          className="flex-1 min-w-[9rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-60 cursor-pointer">
          <Mail size={13} /> {enviado ? 'Reenviar por correo' : 'Enviar por correo'}
        </button>
        <button type="button" disabled={ocupado || !clienteTelefono} onClick={() => void porWhatsApp()} data-testid="enviar-presupuesto-whatsapp" title={clienteTelefono ? undefined : 'El cliente no tiene teléfono'}
          className="flex-1 min-w-[9rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer">
          <MessageCircle size={13} /> Enviar por WhatsApp
        </button>
        <button type="button" disabled={ocupado} onClick={() => void copiarEnlace()}
          className="flex-1 min-w-[9rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer">
          <Copy size={13} /> {enviado ? 'Copiar enlace del cliente' : 'Copiar enlace y marcar enviado'}
        </button>
      </div>
      {rechazado && <p className="text-xs text-amber-700">El cliente lo rechazó. Si lo corriges, vuelve a enviarlo.</p>}
      {error && <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium px-3 py-2 rounded-xl">{error}</div>}
      {aviso && <div role="status" className="bg-teal-50 border border-teal-200 text-teal-800 text-xs font-medium px-3 py-2 rounded-xl flex items-center gap-1.5"><CheckCircle2 size={12} />{aviso}</div>}
    </div>
  );
}

async function enlaceDelCliente(clienteId: string): Promise<string> {
  const enlace = await getEnlaceCliente(clienteId);
  if (!enlace) throw new Error('El cliente aún no tiene enlace a su portal.');
  return enlace;
}
