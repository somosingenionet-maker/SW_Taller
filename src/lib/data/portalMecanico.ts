import { supabase } from '../supabase';

export interface PortalMecanicoTarea {
  id: string;
  descripcion: string;
  completado: boolean;
}

export interface PortalMecanicoOrden {
  id: string;
  numero: string;
  estado: string;
  descripcionProblema: string;
  vehiculo: { marca: string; modelo: string; matricula: string } | null;
  tareas: PortalMecanicoTarea[];
}

export interface PortalMecanicoData {
  empresa: { nombre: string; brandColor: string; logoUrl: string | null } | null;
  tecnico: { nombre: string };
  ordenes: PortalMecanicoOrden[];
}

async function invokePortalMecanico<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('portal-mecanico', { body });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const parsed = await context.clone().json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // el cuerpo de error no era JSON; se mantiene el mensaje genérico
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error as string);
  return data as T;
}

export async function getPortalMecanicoData(token: string): Promise<PortalMecanicoData> {
  return invokePortalMecanico<PortalMecanicoData>({ token });
}

export async function marcarTareaMecanico(token: string, lineaId: string, completado: boolean): Promise<void> {
  await invokePortalMecanico<{ ok: true }>({ token, action: 'marcar_tarea', lineaId, completado });
}
