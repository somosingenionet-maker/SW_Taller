import { Bell, Check, FileText, Mail, MessageCircle, Wrench } from 'lucide-react';
import type { Cliente, Empresa, EventoOT, OrdenTrabajo, Tecnico, Vehiculo } from '../../types';
import { avisarError } from '../../lib/avisos';
import { fmt2 } from '../../utils/moneda';
import { waHref } from '../../utils/whatsapp';
import EnviarPresupuesto from '../EnviarPresupuesto';
import { calcTotals, mailHref, textoRecordatoriosPresupuesto } from './utilidades';

// Los bloques de la ficha de una orden que piden algo al taller: presupuesto, avisos al cliente y al técnico, e historial.

interface Datos { selected: OrdenTrabajo; clientes: Cliente[]; vehiculos: Vehiculo[]; empresa: Empresa }

/** Presupuesto del cliente: antes de recibir el coche, o con el coche ya dentro (Recibido / En reparación) si llegó directo a revisión. */
export function BloquePresupuesto({ selected, clientes, vehiculos, empresa, onCambio, onVerPdf, onMarcarEnviado }: Datos & {
  /** La orden tal como quedó en el servidor tras enviar el presupuesto. */
  onCambio: (ot: OrdenTrabajo) => void;
  onVerPdf: (ot: OrdenTrabajo) => void;
  onMarcarEnviado: (ot: OrdenTrabajo) => void;
}) {
  const enTaller = selected.estado !== 'presupuesto';
  const enviado = selected.presupuestoEstado === 'enviado';
  // Aceptado desde el portal (con o sin el coche dentro) o aprobado a mano con el coche ya en el taller.
  const aceptado = !!selected.aceptacionPresupuesto || selected.presupuestoAprobado === true;
  const rechazado = enviado && selected.presupuestoAprobado === false;
  if (aceptado) {
    const a = selected.aceptacionPresupuesto;
    return (
      <div id="bloque-presupuesto" className="rounded-2xl border border-green-200 bg-green-50 p-4 space-y-2" data-testid="presupuesto-aprobado">
        <p className="text-xs font-bold uppercase text-slate-500">Presupuesto</p>
        <p className="text-sm font-semibold text-green-800 flex items-center gap-1.5"><Check size={14} /> Aprobado por el cliente</p>
        {a && <p className="text-xs text-slate-500">{a.nombre} · {new Date(a.en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })} · {fmt2(a.total)} €</p>}
        {!enTaller && <p className="text-xs text-slate-600">Siguiente paso: recibir el coche cuando lo traiga.</p>}
        {!enTaller && (
          <button onClick={() => onVerPdf(selected)}
            className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition">
            <FileText size={13} /> Ver / Descargar PDF
          </button>
        )}
      </div>
    );
  }
  return (
    <div id="bloque-presupuesto" className={`rounded-2xl border p-4 space-y-3 ${enviado ? 'bg-green-50 border-green-200' : 'bg-violet-50 border-violet-200'}`} data-testid="bloque-presupuesto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-slate-500">{enTaller ? 'Presupuesto para aprobación' : 'Presupuesto'}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${enviado ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {enviado ? (rechazado ? 'Rechazado' : 'Enviado') : 'Pendiente de envío'}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        {rechazado
          ? 'El cliente lo rechazó desde su portal. Puedes cambiar las líneas y volver a enviárselo.'
          : enviado
          ? 'Esperando la respuesta del cliente. Puede aceptarlo o rechazarlo desde su portal.'
          : enTaller
            ? 'El coche ya está en el taller. Cuando tengas el diagnóstico y las líneas con su precio, envíaselo al cliente: recibe un enlace a su portal donde lo aprueba desde el móvil, y queda guardada su aceptación.'
            : 'Envíaselo al cliente: recibe un enlace a su portal donde lo acepta o lo rechaza desde el móvil.'}
      </p>
      {(() => {
        const aviso = textoRecordatoriosPresupuesto(selected);
        return aviso ? <p className="text-xs text-slate-500" data-testid="recordatorios-presupuesto">{aviso}</p> : null;
      })()}
      {enTaller && !enviado && !(selected.total > 0) && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Aún no hay importe: añade las líneas de trabajo y recambios para poder enviarlo.</p>
      )}
      <EnviarPresupuesto
        ot={selected}
        clienteId={selected.clienteId}
        clienteNombre={(() => { const c = clientes.find(x => x.id === selected.clienteId); return c ? `${c.nombre} ${c.apellidos}`.trim() : ''; })()}
        clienteTelefono={clientes.find(x => x.id === selected.clienteId)?.telefono || undefined}
        vehiculoDescripcion={(() => { const v = vehiculos.find(x => x.id === selected.vehiculoId); return v ? `${v.marca} ${v.modelo}${v.matricula ? ` (${v.matricula})` : ''}` : ''; })()}
        empresaNombre={empresa.nombre}
        onCambio={onCambio}
      />
      <div className="flex gap-2">
        <button
          onClick={() => onVerPdf(selected)}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
        >
          <FileText size={13} /> Ver / Descargar PDF
        </button>
        {!enviado && (
          <button
            onClick={() => onMarcarEnviado(selected)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
          >
            <Check size={13} /> Ya lo envié yo
          </button>
        )}
      </div>
    </div>
  );
}

/** Con el coche listo: avisar al cliente (WhatsApp o correo) y marcarlo como avisado. */
export function BloqueAvisoListo({ selected, clientes, vehiculos, empresa, onMarcarNotificado }: Datos & { onMarcarNotificado: (ot: OrdenTrabajo) => void }) {
  const cli = clientes.find(c => c.id === selected.clienteId);
  const veh = vehiculos.find(v => v.id === selected.vehiculoId);
  const notificado = selected.notificacionEnviada;
  const nombreCliente = cli ? `${cli.nombre} ${cli.apellidos}` : 'cliente';
  const descVeh = veh ? `${veh.marca} ${veh.modelo}${veh.matricula ? ` (${veh.matricula})` : ''}` : 'su vehículo';
  const mensaje = `Hola ${nombreCliente}, le informamos que su vehículo ${descVeh} ya está listo para recoger en ${empresa.nombre}. Puede pasar cuando lo desee en nuestro horario de atención. ¡Gracias por confiar en nosotros!`;
  const waLink = waHref(cli?.telefono, mensaje);
  const mailLink = mailHref(cli?.correo, `Su vehículo está listo - ${empresa.nombre}`, mensaje);
  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${notificado ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Bell size={11} /> Notificación al cliente</p>
        {notificado && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Notificado</span>}
      </div>
      {!notificado && (
        <p className="text-xs text-slate-500">Avisa al cliente de que su vehículo está listo para recoger.</p>
      )}
      <div className="flex gap-2 flex-wrap">
        {waLink ? (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition"
          >
            <MessageCircle size={13} /> WhatsApp
          </a>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
            <MessageCircle size={13} /> WhatsApp
          </span>
        )}
        {mailLink ? (
          <a
            href={mailLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
          >
            <Mail size={13} /> Email
          </a>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
            <Mail size={13} /> Email
          </span>
        )}
        {!notificado && (
          <button
            onClick={() => onMarcarNotificado(selected)}
            className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
          >
            <Check size={13} /> Marcar notificado
          </button>
        )}
      </div>
    </div>
  );
}

/** Avisar al técnico asignado, por WhatsApp, con el enlace de su checklist de tareas. */
export function BloqueAvisoTecnico({ selected, tecnicos, vehiculos, generando, onAsegurarPortal }: {
  selected: OrdenTrabajo; tecnicos: Tecnico[]; vehiculos: Vehiculo[]; generando: boolean;
  onAsegurarPortal: (t: Tecnico) => Promise<Tecnico>;
}) {
  const tec = tecnicos.find(t => t.nombre === selected.tecnicoAsignado);
  if (!tec) return null;
  const veh = vehiculos.find(v => v.id === selected.vehiculoId);
  const descVeh = veh ? `${veh.marca} ${veh.modelo}${veh.matricula ? ` (${veh.matricula})` : ''}` : 'un vehículo';

  const handleClick = async () => {
    let tecConToken: Tecnico;
    try {
      tecConToken = await onAsegurarPortal(tec);
    } catch (err) {
      avisarError(err, 'No se pudo generar el enlace del mecánico.');
      return;
    }
    const enlace = `${window.location.origin}/mecanico/${tecConToken.portalToken}`;
    const mensaje = `Hola ${tec.nombre}, se te ha asignado ${descVeh} — OT ${selected.numero}. Aquí puedes ver y marcar las tareas: ${enlace}`;
    const link = waHref(tec.telefono, mensaje);
    if (link) window.open(link, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1"><Wrench size={11} /> Notificación al técnico</p>
      <p className="text-xs text-slate-500">Avisa a {tec.nombre} del vehículo asignado y del enlace de su checklist de tareas.</p>
      {tec.telefono ? (
        <button
          onClick={handleClick}
          disabled={generando}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
        >
          <MessageCircle size={13} /> {generando ? 'Preparando enlace…' : 'Notificar por WhatsApp'}
        </button>
      ) : (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {tec.nombre} no tiene teléfono guardado — añádelo en Configuración de empresa → Técnicos para poder avisarle.
        </p>
      )}
    </div>
  );
}

/** Líneas añadidas tras la recepción: el pendiente vive en la propia línea (notificadoCliente=false), así que sobrevive a recargar la página. */
export function BloqueLineasNuevas({ selected, clientes, vehiculos, empresa, onMarcarAvisadas }: Datos & { onMarcarAvisadas: (ot: OrdenTrabajo) => void }) {
  const pendientes = selected.lineas.filter(l => l.notificadoCliente === false);
  if (pendientes.length === 0) return null;
  const cli = clientes.find(c => c.id === selected.clienteId);
  const veh = vehiculos.find(v => v.id === selected.vehiculoId);
  const nombreCliente = cli ? `${cli.nombre} ${cli.apellidos}` : 'cliente';
  const descVeh = veh ? `${veh.marca} ${veh.modelo}${veh.matricula ? ` (${veh.matricula})` : ''}` : 'tu vehículo';
  // Importe con IVA incluido — es lo que realmente pagará el cliente,
  // no el subtotal de las líneas.
  const { total: totalAnadido } = calcTotals(pendientes, selected.ivaPct);
  const detalle = pendientes.map(l => `• ${l.descripcion} (${fmt2(l.subtotal)} €)`).join('\n');
  const mensaje = `Hola ${nombreCliente}, durante el trabajo en ${descVeh} (OT ${selected.numero}) hemos añadido lo siguiente:\n${detalle}\nTotal añadido (IVA incl.): ${fmt2(totalAnadido)} €.\nCualquier duda, contáctanos.`;
  const waLink = waHref(cli?.telefono, mensaje);
  const mailLink = mailHref(cli?.correo, `Trabajo adicional en tu vehículo - ${empresa.nombre}`, mensaje);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1">
        <Bell size={11} /> Se añadieron {pendientes.length} línea{pendientes.length === 1 ? '' : 's'} nueva{pendientes.length === 1 ? '' : 's'}
      </p>
      <p className="text-xs text-slate-600">¿Avisamos al cliente de este añadido ({fmt2(totalAnadido)} € IVA incl.)?</p>
      <div className="flex gap-2 flex-wrap">
        {waLink ? (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition">
            <MessageCircle size={13} /> WhatsApp
          </a>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
            <MessageCircle size={13} /> WhatsApp
          </span>
        )}
        {mailLink ? (
          <a href={mailLink}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition">
            <Mail size={13} /> Email
          </a>
        ) : (
          <span className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold cursor-not-allowed">
            <Mail size={13} /> Email
          </span>
        )}
        <button
          onClick={() => onMarcarAvisadas(selected)}
          className="flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition"
        >
          <Check size={13} /> Marcar avisado
        </button>
      </div>
    </div>
  );
}

/** Línea de tiempo de la orden, con lo que tardó cada paso. */
export function HistorialOrden({ historial }: { historial: EventoOT[] }) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return {
      fecha: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
      hora: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
  };
  const diffLabel = (a: string, b: string) => {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    const min = Math.floor(ms / 60000);
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    const dias = Math.floor(h / 24);
    const hh = h % 24;
    return hh > 0 ? `${dias}d ${hh}h` : `${dias}d`;
  };
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-3">Historial</p>
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
        <div className="space-y-4">
          {historial.map((ev, i) => {
            const { fecha, hora } = fmt(ev.fecha);
            const siguiente = historial[i + 1];
            return (
              <div key={i} className="relative pl-6">
                <div className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-blue-500 bg-white" />
                <p className="text-xs font-semibold text-slate-800">{ev.descripcion}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{fecha} · {hora}</p>
                {siguiente && (
                  <p className="text-[10px] text-blue-400 mt-1 font-medium">
                    ↓ {diffLabel(ev.fecha, siguiente.fecha)} después
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
