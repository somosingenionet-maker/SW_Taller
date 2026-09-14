-- La Edge Function portal-mecanico adelanta una OT de "recibido" a
-- "en_reparacion" en cuanto el técnico marca su primera tarea — sin esto,
-- el Tablero/Lista del taller no reflejarían ese cambio de estado hasta
-- recargar. Misma RLS de ordenes_trabajo (ya scoped por empresa) sigue
-- aplicando a la transmisión.
alter publication supabase_realtime add table public.ordenes_trabajo;
