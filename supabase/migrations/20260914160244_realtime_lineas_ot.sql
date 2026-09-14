-- Permite que la app del taller reciba en vivo (Supabase Realtime) los
-- cambios que el mecánico hace desde su Portal al marcar tareas — sin esto,
-- el admin solo vería el progreso al recargar o reabrir la OT. La propia
-- RLS de lineas_ot (ya scoped por empresa) sigue aplicando: cada sesión
-- autenticada solo recibe los cambios de las líneas que ya podría leer.
alter publication supabase_realtime add table public.lineas_ot;
