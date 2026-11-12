import type { OrdenTrabajo, Vehiculo } from '../types';

/**
 * Aviso que ve el taller cuando el mecánico hace algo importante desde su Portal: dejar el coche
 * listo, reabrirlo o escribir una nota. Marcar tareas sueltas no avisa (se ve en el tablero y sería
 * un goteo de mensajes). Devuelve null si no hay nada que contar.
 */
export function avisoDelMecanico(antes: OrdenTrabajo, ahora: OrdenTrabajo, vehiculo?: Pick<Vehiculo, 'marca' | 'modelo' | 'matricula'>): string | null {
  const coche = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.matricula})` : `la orden ${ahora.numero}`;
  const quien = ahora.tecnicoAsignado || 'El mecánico';

  if (antes.estado !== 'listo' && ahora.estado === 'listo') return `${quien} ha dejado listo ${coche}. Ya puedes avisar al cliente.`;
  if (antes.estado === 'listo' && ahora.estado === 'en_reparacion') return `${quien} ha reabierto ${coche}: vuelve a estar en reparación.`;

  // Notas nuevas: las que no estaban en la copia anterior.
  const conocidas = new Set(antes.historial.map((e) => `${new Date(e.fecha).getTime()}|${e.descripcion}`));
  const nota = ahora.historial
    .filter((e) => e.descripcion.startsWith('Nota de ') && !conocidas.has(`${new Date(e.fecha).getTime()}|${e.descripcion}`))
    .at(-1);
  return nota ? `${coche} — ${nota.descripcion}` : null;
}
