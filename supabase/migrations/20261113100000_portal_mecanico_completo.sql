-- Portal del Mecánico completo: además de marcar tareas, el técnico empieza la reparación, la deja
-- «lista», la reabre, deja notas y anota cuánto tardó de verdad en cada tarea.
--
-- 1) Tiempo real por tarea. Lo elige el mecánico al marcarla (5 min – 24 h). Nulo en las tareas
--    antiguas o sin marcar. Sirve para comparar con las horas cobradas (la cantidad de una línea de
--    mano de obra son horas). El mecánico nunca ve precios ni horas cobradas.
alter table public.lineas_ot
  add column if not exists duracion_min int
    constraint lineas_ot_duracion_min_rango check (duracion_min is null or duracion_min between 5 and 1440);
comment on column public.lineas_ot.duracion_min is
  'Minutos reales que el mecánico dice haber tardado en la tarea (Portal del Mecánico). Nulo si no se anotó.';

-- 2) Marca de «el mecánico acaba de tocar esta orden». La pantalla del taller la recibe por
--    realtime y solo entonces vuelve a leer la orden entera (tareas, estado, historial); así no
--    relee nada cuando el cambio lo hizo el propio taller.
alter table public.ordenes_trabajo
  add column if not exists mecanico_actualizado_en timestamptz;
comment on column public.ordenes_trabajo.mecanico_actualizado_en is
  'Última acción del mecánico sobre la orden desde su Portal (Edge Function portal-mecanico). La usa la app del taller para refrescar la orden en vivo.';

-- 3) Orden de la lista del mecánico: el coche que entró antes va primero. `fecha_recepcion` es solo
--    un día (y puede ser una fecha prevista), así que se usa el momento real del ingreso: el primer
--    evento del historial que dice «recibido en taller». Índice para esa búsqueda por orden.
create index if not exists eventos_ot_ot_fecha_idx on public.eventos_ot (ot_id, fecha);
