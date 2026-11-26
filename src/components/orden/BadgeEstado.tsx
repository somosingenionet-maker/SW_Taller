import type { OTEstado } from '../../types';
import { ESTADO_META } from './constantes';

/** Etiqueta con el punto en el que está la orden (y su presupuesto, si lo hay). */
export default function BadgeEstado({ estado, presupuestoEstado, presupuestoAprobado, notificacionEnviada }: {
  estado: OTEstado;
  presupuestoEstado?: 'pendiente' | 'enviado';
  presupuestoAprobado?: boolean;
  notificacionEnviada?: boolean;
}) {
  const m = ESTADO_META[estado];
  // Presupuesto con el coche aún fuera: aprobado (falta recibirlo), rechazado o esperando respuesta.
  if (estado === 'presupuesto' && presupuestoAprobado === true) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">Aprobado</span>;
  if (estado === 'presupuesto' && presupuestoEstado === 'enviado' && presupuestoAprobado === false) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Rechazado</span>;
  if (estado === 'presupuesto' && presupuestoEstado === 'enviado') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Enviado</span>;
  // Coche ya en el taller con un presupuesto en marcha: se ve en qué punto está.
  if ((estado === 'recibido' || estado === 'en_reparacion') && presupuestoEstado === 'enviado' && presupuestoAprobado === false) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Presupuesto rechazado</span>;
  if ((estado === 'recibido' || estado === 'en_reparacion') && presupuestoEstado === 'enviado' && presupuestoAprobado == null) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">Presupuesto enviado</span>;
  if (estado === 'recibido' && presupuestoAprobado) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">Aprobado</span>;
  if (estado === 'recibido' && !presupuestoAprobado) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pdte. diagnóstico</span>;
  if (estado === 'listo' && notificacionEnviada) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Notificado</span>;
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.bg} ${m.color}`}>{m.label}</span>;
}
