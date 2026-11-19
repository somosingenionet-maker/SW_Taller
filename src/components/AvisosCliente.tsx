import { useState } from 'react';
import { BellPlus, Mail, MessageCircle } from 'lucide-react';
import type { Cliente, Empresa, NotificacionCliente, Vehiculo } from '../types';
import type { NuevoAviso as DatosAviso } from '../lib/data/avisos';
import { descripcionVehiculo, textoCanal, type ItemAviso } from '../utils/avisos';
import { formatDate } from '../utils/dateFormat';
import { NOMBRE_EVENTO, textoDeHtml } from '../utils/textoHtml';
import NuevoAviso from './NuevoAviso';

interface Props {
  cliente: Cliente;
  clientes: Cliente[];
  vehiculos: Vehiculo[];
  empresa: Empresa;
  /** Cola de avisos del taller (se filtra aquí por cliente). */
  avisos: ItemAviso[];
  notificaciones: NotificacionCliente[];
  onCrearAviso: (a: DatosAviso) => Promise<void>;
}

/**
 * «Avisos» de la ficha de un cliente: lo que está por avisarle y todo lo que ya se le mandó (correo y WhatsApp), con el texto.
 * Es el historial del cliente; la pantalla Avisos es la del taller entero.
 */
export default function AvisosCliente({ cliente, clientes, vehiculos, empresa, avisos, notificaciones, onCrearAviso }: Props) {
  const [nuevo, setNuevo] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const vehiculoPorId = new Map(vehiculos.map((v) => [v.id, v]));
  const proximos = avisos.filter((a) => a.clienteId === cliente.id && a.fase !== 'avisado');
  const enviados = notificaciones.filter((n) => n.clienteId === cliente.id).sort((a, b) => b.fechaEnvio.localeCompare(a.fechaEnvio));

  return (
    <div className="space-y-3 pt-4 border-t border-slate-50" data-testid="avisos-cliente">
      <div className="flex justify-between items-center gap-2">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-blue-600" /> Avisos al cliente
        </h4>
        <button type="button" onClick={() => setNuevo(true)} data-testid="cliente-programar-aviso"
          className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer"><BellPlus className="w-3.5 h-3.5" /> Programar aviso</button>
      </div>

      {cliente.noAvisar && <p className="text-[11px] font-semibold text-rose-700 bg-rose-50 rounded-lg px-2.5 py-1.5">Este cliente pidió no recibir avisos: no se le manda nada automático.</p>}

      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-1">Por avisar</p>
        {proximos.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid="avisos-cliente-sin-proximos">No hay avisos pendientes ni programados para este cliente.</p>
        ) : (
          <ul className="space-y-1.5">
            {proximos.map((a) => {
              const v = a.vehiculoId ? vehiculoPorId.get(a.vehiculoId) : undefined;
              return (
                <li key={a.clave} className="px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs" data-testid="avisos-cliente-proximo">
                  <b className="text-slate-800">{a.motivo}</b>{v ? <span className="text-slate-500"> · {descripcionVehiculo(v)}</span> : null}
                  <span className="block text-slate-600">{a.cuando}</span>
                  <span className="block text-[11px] text-slate-400">
                    {a.origen === 'orden' ? 'Sin esto no se le avisará del próximo cambio: anótalo en «Avisos».' : a.fase === 'para_hoy' ? 'Espera a una persona del taller (mira «Avisos» → Para hoy).' : textoCanal(a, empresa.recordatoriosAutomaticosActivos)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="text-[11px] font-semibold text-slate-500 mb-1">Enviados · {enviados.length}</p>
        {enviados.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid="avisos-cliente-sin-enviados">Todavía no se le ha enviado ningún aviso.</p>
        ) : (
          <ul className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
            {enviados.map((n) => {
              const v = n.vehiculoId ? vehiculoPorId.get(n.vehiculoId) : undefined;
              const abiertoAhora = abierta === n.id;
              return (
                <li key={n.id} className="bg-slate-50 border border-slate-100 rounded-xl" data-testid="avisos-cliente-enviado">
                  <button type="button" aria-expanded={abiertoAhora} onClick={() => setAbierta(abiertoAhora ? null : n.id)} className="w-full flex items-start gap-2 text-left px-3 py-2 cursor-pointer">
                    {n.tipoEnvio === 'email' ? <Mail className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" aria-label="Correo" /> : <MessageCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" aria-label="WhatsApp" />}
                    <span className="min-w-0 flex-1 text-xs">
                      <b className="text-slate-800">{NOMBRE_EVENTO[n.tipoEvento] ?? n.tipoEvento}</b>{v ? <span className="text-slate-500"> · {descripcionVehiculo(v)}</span> : null}
                      <span className="block text-[11px] text-slate-400">{formatDate(n.fechaEnvio.slice(0, 10))} · {n.origen === 'automatico' ? 'salió solo' : 'enviado por el taller'}</span>
                    </span>
                  </button>
                  {abiertoAhora && <p className="mx-3 mb-2 px-2.5 py-2 bg-white border border-slate-100 rounded-lg text-xs text-slate-600 whitespace-pre-line">{n.asunto && <b>{n.asunto}<br /></b>}{textoDeHtml(n.mensaje, 1200)}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {nuevo && (
        <NuevoAviso
          empresa={empresa} clientes={clientes} vehiculos={vehiculos} clienteIdInicial={cliente.id}
          onGuardar={async (a) => { await onCrearAviso(a); setNuevo(false); }}
          onCerrar={() => setNuevo(false)}
        />
      )}
    </div>
  );
}
