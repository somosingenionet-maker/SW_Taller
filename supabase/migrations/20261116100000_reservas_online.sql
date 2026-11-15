-- Reserva de cita online: el cliente elige servicio, día y hora en una página pública del taller y la cita entra
-- en la Agenda. Diseño: docs/diseno-reserva-online.md.
--
--   · Configuración por taller en `empresas` (activar, dirección pública, horario por día, cierres, citas a la
--     vez, antelación, rango de días, confirmación automática o manual).
--   · `tipos_cita`: lo que se puede reservar y cuánto dura cada cosa.
--   · `citas`: origen (taller/online), correo de contacto, token para que el cliente la cancele, y si ya se le
--     mandó el recordatorio del día anterior.
--   · Reservar y cancelar son funciones SOLO del servidor: reservar es atómico (un bloqueo por taller), así dos
--     personas no se llevan el mismo último hueco.

-- 1) Configuración del taller ------------------------------------------------------------------------------
create or replace function public.horario_reservas_valido(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  dia text; tramos jsonb; t jsonb; ant text; n int;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return false; end if;
  for dia in select jsonb_object_keys(p) loop
    if dia not in ('lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom') then return false; end if;
    tramos := p -> dia;
    if jsonb_typeof(tramos) <> 'array' or jsonb_array_length(tramos) > 3 then return false; end if;
    ant := '00:00';
    for t in select * from jsonb_array_elements(tramos) loop
      if jsonb_typeof(t) <> 'array' or jsonb_array_length(t) <> 2 then return false; end if;
      if (t ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (t ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
      -- Cada tramo empieza después de que acabe el anterior, y acaba después de empezar.
      if (t ->> 0) < ant or (t ->> 1) <= (t ->> 0) then return false; end if;
      ant := t ->> 1;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.empresas
  add column reservas_activas          boolean not null default false,
  add column reservas_slug             text,
  add column reservas_horario          jsonb not null default '{"lun":[["09:00","13:30"],["16:00","19:30"]],"mar":[["09:00","13:30"],["16:00","19:30"]],"mie":[["09:00","13:30"],["16:00","19:30"]],"jue":[["09:00","13:30"],["16:00","19:30"]],"vie":[["09:00","13:30"],["16:00","19:30"]],"sab":[],"dom":[]}'::jsonb,
  add column reservas_cierres          date[] not null default '{}',
  add column reservas_capacidad        int  not null default 2,
  add column reservas_antelacion_horas int  not null default 12,
  add column reservas_dias_max         int  not null default 30,
  add column reservas_confirmacion     text not null default 'automatica';

alter table public.empresas
  add constraint empresas_reservas_slug_chk check (reservas_slug is null or reservas_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  add constraint empresas_reservas_horario_chk check (public.horario_reservas_valido(reservas_horario)),
  add constraint empresas_reservas_capacidad_chk check (reservas_capacidad between 1 and 20),
  add constraint empresas_reservas_antelacion_chk check (reservas_antelacion_horas between 0 and 168),
  add constraint empresas_reservas_dias_chk check (reservas_dias_max between 1 and 90),
  add constraint empresas_reservas_confirmacion_chk check (reservas_confirmacion in ('automatica', 'manual')),
  add constraint empresas_reservas_cierres_chk check (cardinality(reservas_cierres) <= 400),
  -- No se puede activar sin dirección pública.
  add constraint empresas_reservas_activas_slug_chk check (not reservas_activas or reservas_slug is not null);

create unique index empresas_reservas_slug_uq on public.empresas (reservas_slug) where reservas_slug is not null;

-- Direcciones que no se pueden usar porque son rutas de la aplicación.
create or replace function public.validar_slug_reservas()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reservas_slug is not null and new.reservas_slug in
     ('admin', 'api', 'app', 'registro', 'portal', 'mecanico', 'reservar', 'cita', 'privacidad', 'terminos', 'login', 'doonty', 'soporte', 'ayuda', 'www') then
    raise exception 'Esa dirección no está disponible. Elige otra.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger trg_empresas_slug_reservas before insert or update of reservas_slug on public.empresas
  for each row execute function public.validar_slug_reservas();

-- El administrador del taller puede cambiarlas (la política de empresas ya exige ser admin).
grant update (
  reservas_activas, reservas_slug, reservas_horario, reservas_cierres, reservas_capacidad,
  reservas_antelacion_horas, reservas_dias_max, reservas_confirmacion
) on public.empresas to authenticated;

-- 2) Tipos de cita ----------------------------------------------------------------------------------------------
create table public.tipos_cita (
  id               text primary key default gen_random_uuid()::text,
  empresa_id       text not null references public.empresas(id) on delete cascade,
  nombre           text not null check (char_length(btrim(nombre)) between 1 and 60),
  duracion_minutos int  not null check (duracion_minutos between 15 and 240 and duracion_minutos % 5 = 0),
  activo           boolean not null default true,
  posicion         int  not null default 0,
  created_at       timestamptz not null default now()
);
create unique index tipos_cita_nombre_uq on public.tipos_cita (empresa_id, lower(btrim(nombre)));
create index on public.tipos_cita (empresa_id);
create trigger trg_tipos_cita_empresa before insert on public.tipos_cita
  for each row execute function public.set_empresa_id();

alter table public.tipos_cita enable row level security;
create policy tipos_cita_leer on public.tipos_cita for select to authenticated
  using (public.es_super_admin() or empresa_id = public.mi_empresa_id());
create policy tipos_cita_insertar on public.tipos_cita for insert to authenticated with check (public.es_admin_de_empresa(empresa_id));
create policy tipos_cita_actualizar on public.tipos_cita for update to authenticated
  using (public.es_admin_de_empresa(empresa_id)) with check (public.es_admin_de_empresa(empresa_id));
create policy tipos_cita_borrar on public.tipos_cita for delete to authenticated using (public.es_admin_de_empresa(empresa_id));
create trigger trg_suscripcion_activa before insert or update or delete on public.tipos_cita
  for each statement execute function public.exigir_suscripcion_activa();

-- 3) Citas: origen, contacto, token, recordatorio ------------------------------------------------------------------
alter table public.citas
  add column origen                 text not null default 'taller' check (origen in ('taller', 'online')),
  add column contacto_correo        text check (contacto_correo is null or char_length(contacto_correo) <= 254),
  add column token_cliente          text,
  add column tipo_cita_id           text references public.tipos_cita(id) on delete set null,
  add column consentimiento_en      timestamptz,
  add column recordatorio_enviado_en timestamptz,
  add column cancelada_por          text check (cancelada_por is null or cancelada_por in ('cliente', 'taller'));
create unique index citas_token_cliente_uq on public.citas (token_cliente) where token_cliente is not null;
create index on public.citas (empresa_id, fecha_hora);
create index on public.citas (tipo_cita_id) where tipo_cita_id is not null;

-- 4) Reservar y cancelar: solo el servidor -------------------------------------------------------------------------------
create or replace function public.reservar_cita_online(
  p_empresa_id text, p_fecha_hora timestamptz, p_duracion int, p_tipo_id text, p_nombre text, p_telefono text,
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

  insert into public.citas (empresa_id, fecha_hora, duracion_minutos, contacto_nombre, contacto_telefono, contacto_correo,
                            vehiculo_descripcion, motivo, estado, origen, token_cliente, tipo_cita_id, consentimiento_en)
  values (p_empresa_id, p_fecha_hora, p_duracion, p_nombre, p_telefono, nullif(p_correo, ''),
          nullif(p_vehiculo, ''), coalesce(p_motivo, ''), p_estado, 'online', p_token, p_tipo_id, now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reservar_cita_online(text, timestamptz, int, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reservar_cita_online(text, timestamptz, int, text, text, text, text, text, text, text, text) to service_role;

create or replace function public.cancelar_cita_online(p_token text)
returns table (id text, empresa_id text, fecha_hora timestamptz, contacto_nombre text, contacto_correo text, vehiculo_descripcion text, motivo text, ya_cancelada boolean)
language plpgsql
security definer
set search_path = public
as $$
declare c record;
begin
  if auth.uid() is not null then
    raise exception 'Solo el servidor puede cancelar por token.' using errcode = 'P0001';
  end if;
  select * into c from public.citas x where x.token_cliente = p_token and p_token is not null and length(p_token) >= 20;
  if not found then
    raise exception 'CITA_NO_ENCONTRADA' using errcode = 'P0001';
  end if;
  if c.estado = 'cancelada' then
    return query select c.id, c.empresa_id, c.fecha_hora, c.contacto_nombre, c.contacto_correo, c.vehiculo_descripcion, c.motivo, true;
    return;
  end if;
  if c.estado = 'convertida' or c.fecha_hora <= now() then
    raise exception 'CITA_NO_CANCELABLE' using errcode = 'P0001';
  end if;
  update public.citas set estado = 'cancelada', cancelada_por = 'cliente' where citas.id = c.id;
  return query select c.id, c.empresa_id, c.fecha_hora, c.contacto_nombre, c.contacto_correo, c.vehiculo_descripcion, c.motivo, false;
end;
$$;
revoke all on function public.cancelar_cita_online(text) from public, anon, authenticated;
grant execute on function public.cancelar_cita_online(text) to service_role;

-- 5) Recordatorio del día anterior (cron diario) -------------------------------------------------------------------------
-- Citas confirmadas de MAÑANA (hora de Madrid) con correo conocido, de talleres con los recordatorios automáticos
-- activados y clientes que no pidieron no recibir avisos. Solo para el servidor.
create or replace function public.citas_para_recordar()
returns table (cita_id text, empresa_id text, fecha_hora timestamptz, duracion_minutos int, nombre text, correo text, vehiculo text, motivo text, token_cliente text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.empresa_id, c.fecha_hora, c.duracion_minutos,
         coalesce(c.contacto_nombre, cl.nombre), coalesce(nullif(c.contacto_correo, ''), nullif(cl.correo, '')),
         coalesce(c.vehiculo_descripcion, (select v.marca || ' ' || v.modelo || ' (' || v.matricula || ')' from public.vehiculos v where v.id = c.vehiculo_id)),
         c.motivo, c.token_cliente
    from public.citas c
    join public.empresas e on e.id = c.empresa_id
    left join public.clientes cl on cl.id = c.cliente_id
   where auth.uid() is null
     and c.estado = 'confirmada' and c.recordatorio_enviado_en is null
     and (c.fecha_hora at time zone 'Europe/Madrid')::date = (now() at time zone 'Europe/Madrid')::date + 1
     and e.activo and e.recordatorios_automaticos_activos and (e.acceso_hasta is null or e.acceso_hasta > now())
     and coalesce(nullif(c.contacto_correo, ''), nullif(cl.correo, '')) is not null
     and not coalesce(cl.no_avisar, false)
$$;
revoke all on function public.citas_para_recordar() from public, anon, authenticated;
grant execute on function public.citas_para_recordar() to service_role;
