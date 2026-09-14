-- Portal del Mecánico: enlace personal sin login, mismo patrón que el
-- Portal del Cliente — el token se valida dentro de la Edge Function
-- portal-mecanico (service role), nunca vía RLS directa.
alter table public.tecnicos add column telefono text;
alter table public.tecnicos add column portal_token text unique;
comment on column public.tecnicos.portal_token is
  'Token aleatorio del enlace público del Portal del Mecánico. Null hasta que se genera desde Configuración > Técnicos o al notificarle por primera vez desde una OT. Se valida en la Edge Function portal-mecanico (service role); nunca se expone vía RLS directa.';

-- El mecánico marca desde su portal qué tareas (líneas de mano de obra) de
-- sus OTs asignadas ya ha terminado — sin tocar precios ni el resto de la
-- línea, que solo edita el taller.
alter table public.lineas_ot add column completado boolean not null default false;
comment on column public.lineas_ot.completado is
  'Marcado por el mecánico desde el Portal del Mecánico al terminar esa tarea. Solo tiene sentido visualmente en líneas de tipo mano_de_obra.';
