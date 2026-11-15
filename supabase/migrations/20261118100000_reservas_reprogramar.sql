-- Reserva online, fase 2: el cliente puede cambiar el día u hora de su cita desde su enlace.
-- Como mucho 3 cambios por cita (frena a quien quiera «reservar» huecos y soltarlos). Solo el servidor la llama.
alter table public.citas add column if not exists reprogramaciones int not null default 0;
alter table public.citas drop constraint if exists citas_reprogramaciones_rango;
alter table public.citas add constraint citas_reprogramaciones_rango check (reprogramaciones between 0 and 3);

create or replace function public.reprogramar_cita_online(p_token text, p_fecha_hora timestamptz, p_estado text)
returns table (id text, empresa_id text, fecha_anterior timestamptz, fecha_hora timestamptz, duracion_minutos int, estado text, reprogramaciones int)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  v_capacidad int;
  v_ocupadas int;
begin
  if auth.uid() is not null then
    raise exception 'Solo el servidor puede reprogramar.' using errcode = 'P0001';
  end if;
  if p_estado not in ('pendiente', 'confirmada') then
    raise exception 'Estado no válido.' using errcode = 'P0001';
  end if;
  select * into c from public.citas x
   where x.token_cliente = p_token and p_token is not null and length(p_token) >= 20 and x.origen = 'online';
  if not found then
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0001';
  end if;

  -- Un bloqueo por taller, igual que al reservar: las altas y los cambios del mismo taller se hacen de uno en uno.
  perform pg_advisory_xact_lock(hashtextextended('reservas:' || c.empresa_id, 0));
  -- Se vuelve a leer ya con el bloqueo: otro cambio o cancelación pudo colarse antes.
  select * into c from public.citas x where x.id = c.id;

  if c.estado not in ('pendiente', 'confirmada') or c.fecha_hora <= now() then
    raise exception 'CITA_NO_REPROGRAMABLE' using errcode = 'P0001';
  end if;
  if c.reprogramaciones >= 3 then
    raise exception 'LIMITE_REPROGRAMACIONES' using errcode = 'P0001';
  end if;
  if p_fecha_hora <= now() then
    raise exception 'HUECO_PASADO' using errcode = 'P0001';
  end if;

  select reservas_capacidad into v_capacidad from public.empresas e where e.id = c.empresa_id and e.reservas_activas;
  if v_capacidad is null then
    raise exception 'RESERVAS_CERRADAS' using errcode = 'P0001';
  end if;

  -- La propia cita no cuenta: se puede mover a una hora que se solapa con la actual.
  select count(*) into v_ocupadas from public.citas o
   where o.empresa_id = c.empresa_id and o.estado <> 'cancelada' and o.id <> c.id
     and o.fecha_hora < p_fecha_hora + make_interval(mins => c.duracion_minutos)
     and o.fecha_hora + make_interval(mins => o.duracion_minutos) > p_fecha_hora;
  if v_ocupadas >= v_capacidad then
    raise exception 'HUECO_OCUPADO' using errcode = 'P0001';
  end if;

  update public.citas u
     set fecha_hora = p_fecha_hora, estado = p_estado, reprogramaciones = u.reprogramaciones + 1, recordatorio_enviado_en = null
   where u.id = c.id;
  return query select c.id, c.empresa_id, c.fecha_hora, p_fecha_hora, c.duracion_minutos, p_estado, c.reprogramaciones + 1;
end;
$$;
revoke all on function public.reprogramar_cita_online(text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.reprogramar_cita_online(text, timestamptz, text) to service_role;
