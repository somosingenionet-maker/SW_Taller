-- Reserva online: nombre y apellidos van en campos separados (como en la ficha del cliente).
-- Las citas ya creadas se quedan sin apellidos (el campo es opcional en la base); las nuevas reservas online los exigen.
alter table public.citas add column if not exists contacto_apellidos text;
alter table public.citas drop constraint if exists citas_contacto_apellidos_largo;
alter table public.citas add constraint citas_contacto_apellidos_largo check (contacto_apellidos is null or char_length(contacto_apellidos) <= 80);

drop function if exists public.reservar_cita_online(text, timestamptz, int, text, text, text, text, text, text, text, text);

create or replace function public.reservar_cita_online(
  p_empresa_id text, p_fecha_hora timestamptz, p_duracion int, p_tipo_id text, p_nombre text, p_apellidos text, p_telefono text,
  p_correo text, p_vehiculo text, p_motivo text, p_estado text, p_token text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacidad int;
  v_ocupadas int;
  v_del_cliente int;
  -- Se comparan los 9 últimos dígitos: «600 000 001», «+34 600000001» y «0034-600-000-001» son el mismo teléfono.
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9);
  v_id text;
begin
  if auth.uid() is not null then
    raise exception 'Solo el servidor puede reservar.' using errcode = 'P0001';
  end if;
  if p_estado not in ('pendiente', 'confirmada') then
    raise exception 'Estado no válido.' using errcode = 'P0001';
  end if;
  if p_fecha_hora <= now() then
    raise exception 'HUECO_PASADO' using errcode = 'P0001';
  end if;

  -- Un bloqueo por taller: las reservas del mismo taller se hacen de una en una.
  perform pg_advisory_xact_lock(hashtextextended('reservas:' || p_empresa_id, 0));

  select reservas_capacidad into v_capacidad from public.empresas where id = p_empresa_id and reservas_activas;
  if v_capacidad is null then
    raise exception 'RESERVAS_CERRADAS' using errcode = 'P0001';
  end if;

  select count(*) into v_ocupadas from public.citas c
   where c.empresa_id = p_empresa_id and c.estado <> 'cancelada'
     and c.fecha_hora < p_fecha_hora + make_interval(mins => p_duracion)
     and c.fecha_hora + make_interval(mins => c.duracion_minutos) > p_fecha_hora;
  if v_ocupadas >= v_capacidad then
    raise exception 'HUECO_OCUPADO' using errcode = 'P0001';
  end if;

  -- Como mucho 2 citas futuras abiertas por teléfono o por correo: frena a quien quiera acaparar huecos.
  select count(*) into v_del_cliente from public.citas c
   where c.empresa_id = p_empresa_id and c.origen = 'online' and c.estado in ('pendiente', 'confirmada') and c.fecha_hora > now()
     and ((v_tel <> '' and right(regexp_replace(coalesce(c.contacto_telefono, ''), '\D', '', 'g'), 9) = v_tel)
          or (coalesce(p_correo, '') <> '' and lower(c.contacto_correo) = lower(p_correo)));
  if v_del_cliente >= 2 then
    raise exception 'LIMITE_CLIENTE' using errcode = 'P0001';
  end if;

  insert into public.citas (empresa_id, fecha_hora, duracion_minutos, contacto_nombre, contacto_apellidos, contacto_telefono, contacto_correo,
                            vehiculo_descripcion, motivo, estado, origen, token_cliente, tipo_cita_id, consentimiento_en)
  values (p_empresa_id, p_fecha_hora, p_duracion, p_nombre, nullif(p_apellidos, ''), p_telefono, nullif(p_correo, ''),
          nullif(p_vehiculo, ''), coalesce(p_motivo, ''), p_estado, 'online', p_token, p_tipo_id, now())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reservar_cita_online(text, timestamptz, int, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reservar_cita_online(text, timestamptz, int, text, text, text, text, text, text, text, text, text) to service_role;
