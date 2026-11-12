-- Cambio de aceite: el servicio que más se repite en un taller y el que más clientes trae de vuelta.
--
--   · La orden se marca como «cambio de aceite» y lleva un check list de 4 filtros (aire, aceite,
--     combustible, habitáculo): cada uno «cambiado», «no se cambió» o sin revisar.
--   · La ficha del vehículo guarda el último cambio (fecha y km) y el PRÓXIMO (fecha y, si se quiere,
--     km). El próximo lo decide siempre una persona —el mecánico al terminar o el taller—, nunca un
--     intervalo automático: depende del aceite, del coche y de cómo se usa.
--
-- Los filtros y el interruptor van en columnas propias de la orden que el formulario de edición NO
-- envía: se guardan una a una en el momento de marcarlas, así el taller y el mecánico no se pisan.

alter table public.vehiculos
  add column if not exists aceite_ultima_fecha  date,
  add column if not exists aceite_ultimo_km     int constraint vehiculos_aceite_ultimo_km_chk  check (aceite_ultimo_km  is null or aceite_ultimo_km  >= 0),
  add column if not exists aceite_proxima_fecha date,
  add column if not exists aceite_proximo_km    int constraint vehiculos_aceite_proximo_km_chk check (aceite_proximo_km is null or aceite_proximo_km >= 0);

alter table public.ordenes_trabajo
  add column if not exists es_cambio_aceite   boolean not null default false,
  add column if not exists filtro_aire        text constraint ot_filtro_aire_chk        check (filtro_aire        in ('cambiado', 'no_cambiado')),
  add column if not exists filtro_aceite      text constraint ot_filtro_aceite_chk      check (filtro_aceite      in ('cambiado', 'no_cambiado')),
  add column if not exists filtro_combustible text constraint ot_filtro_combustible_chk check (filtro_combustible in ('cambiado', 'no_cambiado')),
  add column if not exists filtro_habitaculo  text constraint ot_filtro_habitaculo_chk  check (filtro_habitaculo  in ('cambiado', 'no_cambiado')),
  add column if not exists aceite_anotado_en  timestamptz;
comment on column public.ordenes_trabajo.aceite_anotado_en is
  'Cuándo se anotó en la ficha del vehículo el próximo cambio de aceite a raíz de ESTA orden. Nulo = nadie lo anotó; al entregarla, la ficha se actualiza sola.';

-- Anotar el próximo cambio a raíz de una orden. Lo llaman el taller (con su sesión: la RLS limita
-- a sus órdenes y vehículos, y el control de suscripción se aplica) y la Edge Function del Portal
-- del Mecánico (service role, que ya ha comprobado que la orden es de ese técnico).
-- En la ficha queda: último cambio = hoy (hora de Madrid) con el km de la orden, y el próximo.
create or replace function public.anotar_cambio_aceite(
  p_ot_id text, p_proxima_fecha date, p_proximo_km int default null, p_autor text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ot record;
  hoy date := (now() at time zone 'Europe/Madrid')::date;
  km_orden int;
  texto text;
begin
  select id, empresa_id, vehiculo_id, estado, es_cambio_aceite, kilometraje_entrada, kilometraje_salida
    into ot from public.ordenes_trabajo where id = p_ot_id;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'P0001';
  end if;
  if not ot.es_cambio_aceite then
    raise exception 'Esta orden no está marcada como cambio de aceite.' using errcode = 'P0001';
  end if;
  if ot.estado not in ('recibido', 'en_reparacion', 'listo', 'entregado') then
    raise exception 'El próximo cambio se anota cuando el vehículo ya está en el taller.' using errcode = 'P0001';
  end if;
  if p_proxima_fecha is null or p_proxima_fecha <= hoy or p_proxima_fecha > hoy + interval '5 years' then
    raise exception 'La fecha del próximo cambio debe ser posterior a hoy y como mucho dentro de 5 años.' using errcode = 'P0001';
  end if;

  km_orden := nullif(greatest(coalesce(ot.kilometraje_salida, 0), coalesce(ot.kilometraje_entrada, 0)), 0);
  if p_proximo_km is not null and (p_proximo_km <= coalesce(km_orden, 0) or p_proximo_km > 2000000) then
    raise exception 'Los kilómetros del próximo cambio deben ser mayores que los actuales del vehículo.' using errcode = 'P0001';
  end if;

  update public.vehiculos
     set aceite_ultima_fecha = hoy,
         aceite_ultimo_km = km_orden,
         aceite_proxima_fecha = p_proxima_fecha,
         aceite_proximo_km = p_proximo_km
   where id = ot.vehiculo_id and empresa_id = ot.empresa_id;

  update public.ordenes_trabajo set aceite_anotado_en = now() where id = ot.id;

  texto := 'Próximo cambio de aceite: ' || to_char(p_proxima_fecha, 'DD/MM/YYYY')
    || case when p_proximo_km is not null
         then ' o a los ' || replace(to_char(p_proximo_km, 'FM9G999G999'), ',', '.') || ' km, lo que ocurra antes' else '' end
    || case when nullif(trim(coalesce(p_autor, '')), '') is not null then ' (anotado por ' || trim(p_autor) || ')' else '' end || '.';
  insert into public.eventos_ot (ot_id, fecha, descripcion) values (ot.id, now(), texto);
end;
$$;
revoke all on function public.anotar_cambio_aceite(text, date, int, text) from public, anon;
grant execute on function public.anotar_cambio_aceite(text, date, int, text) to authenticated, service_role;

-- Al ENTREGAR una orden de cambio de aceite sin que nadie anotara el próximo: la ficha registra el
-- cambio (fecha de entrega y km) y borra el «próximo» que hubiera, porque era del ciclo anterior.
-- Si el próximo ya se anotó a raíz de esta orden, no se toca nada.
create or replace function public.aceite_al_entregar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.estado = 'entregado' and old.estado is distinct from 'entregado'
     and new.es_cambio_aceite and new.aceite_anotado_en is null then
    update public.vehiculos
       set aceite_ultima_fecha = coalesce(new.fecha_entrega, (now() at time zone 'Europe/Madrid')::date),
           aceite_ultimo_km = nullif(greatest(coalesce(new.kilometraje_salida, 0), coalesce(new.kilometraje_entrada, 0)), 0),
           aceite_proxima_fecha = null,
           aceite_proximo_km = null
     where id = new.vehiculo_id and empresa_id = new.empresa_id;
  end if;
  return new;
end;
$$;
revoke all on function public.aceite_al_entregar() from public, anon, authenticated;

drop trigger if exists trg_ot_aceite_al_entregar on public.ordenes_trabajo;
create trigger trg_ot_aceite_al_entregar
  after update of estado on public.ordenes_trabajo
  for each row execute function public.aceite_al_entregar();
