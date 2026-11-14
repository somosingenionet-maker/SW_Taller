-- Inspección digital, fase B: servicios predefinidos, plantillas editables (varias por taller) y aceptación del
-- cliente punto por punto con prueba. Diseño: docs/diseno-inspeccion-digital.md.
--
--   · `servicios_predefinidos`: catálogo del taller (nombre, texto de la reparación, precio sin IVA). Por ahora
--     solo lo usa la inspección para sugerir reparación y precio; queda listo para usarlo en las órdenes.
--   · `plantillas_inspeccion` + `plantilla_inspeccion_puntos`: el taller tiene las suyas (una por defecto) y cada
--     punto puede llevar un servicio asociado. Sin plantillas propias se sigue usando la estándar del sistema.
--   · `crear_inspeccion` copia la plantilla elegida (o la por defecto) y la sugerencia de cada punto, como
--     FOTO FIJA: editar la plantilla después no cambia las inspecciones ya creadas.
--   · `inspecciones.aceptacion_*`: prueba de la aceptación del cliente (nombre, hora, importe, texto, IP y
--     dispositivo), con las mismas reglas que la de los presupuestos.

-- 1) Servicios predefinidos --------------------------------------------------------------------------
create table public.servicios_predefinidos (
  id         text primary key default gen_random_uuid()::text,
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre     text not null check (char_length(btrim(nombre)) between 1 and 80),
  reparacion text not null check (char_length(btrim(reparacion)) between 1 and 300),
  precio     numeric(12,2) not null check (precio >= 0),
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index servicios_predefinidos_nombre_uq on public.servicios_predefinidos (empresa_id, lower(btrim(nombre)));
create index on public.servicios_predefinidos (empresa_id);
create trigger trg_servicios_updated before update on public.servicios_predefinidos
  for each row execute function public.set_updated_at();
create trigger trg_servicios_empresa before insert on public.servicios_predefinidos
  for each row execute function public.set_empresa_id();

-- 2) Plantillas --------------------------------------------------------------------------------------
create table public.plantillas_inspeccion (
  id          text primary key default gen_random_uuid()::text,
  empresa_id  text not null references public.empresas(id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 60),
  es_defecto  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index plantillas_inspeccion_nombre_uq on public.plantillas_inspeccion (empresa_id, lower(btrim(nombre)));
create unique index plantillas_inspeccion_defecto_uq on public.plantillas_inspeccion (empresa_id) where es_defecto;
create index on public.plantillas_inspeccion (empresa_id);
create trigger trg_plantillas_updated before update on public.plantillas_inspeccion
  for each row execute function public.set_updated_at();
create trigger trg_plantillas_empresa before insert on public.plantillas_inspeccion
  for each row execute function public.set_empresa_id();

create table public.plantilla_inspeccion_puntos (
  id           text primary key default gen_random_uuid()::text,
  plantilla_id text not null references public.plantillas_inspeccion(id) on delete cascade,
  empresa_id   text not null references public.empresas(id) on delete cascade,
  categoria    text not null check (char_length(btrim(categoria)) between 1 and 60),
  nombre       text not null check (char_length(btrim(nombre)) between 1 and 80),
  posicion     int  not null,
  servicio_id  text references public.servicios_predefinidos(id) on delete set null
);
create index on public.plantilla_inspeccion_puntos (plantilla_id, posicion);
create index on public.plantilla_inspeccion_puntos (empresa_id);
create index on public.plantilla_inspeccion_puntos (servicio_id) where servicio_id is not null;
create trigger trg_plantilla_puntos_empresa before insert on public.plantilla_inspeccion_puntos
  for each row execute function public.set_empresa_id();

-- Lectura para todo el taller (recepción usa los servicios); escritura solo para administradores.
create or replace function public.es_admin_de_empresa(p_empresa_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_super_admin() or exists (
    select 1 from public.perfiles p
     where p.id = (select auth.uid()) and p.rol = 'admin' and p.activo and p.empresa_id = p_empresa_id
  )
$$;
revoke all on function public.es_admin_de_empresa(text) from public, anon;
grant execute on function public.es_admin_de_empresa(text) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['servicios_predefinidos', 'plantillas_inspeccion', 'plantilla_inspeccion_puntos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (public.es_super_admin() or empresa_id = public.mi_empresa_id())$p$, t || '_leer', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (public.es_admin_de_empresa(empresa_id))$p$, t || '_insertar', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (public.es_admin_de_empresa(empresa_id)) with check (public.es_admin_de_empresa(empresa_id))$p$, t || '_actualizar', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (public.es_admin_de_empresa(empresa_id))$p$, t || '_borrar', t);
    execute format('create trigger trg_suscripcion_activa before insert or update or delete on public.%I for each statement execute function public.exigir_suscripcion_activa()', t);
  end loop;
end $$;

-- Una plantilla no puede mezclar servicios de otro taller.
create or replace function public.validar_servicio_de_plantilla()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.servicio_id is not null and not exists (
    select 1 from public.servicios_predefinidos s where s.id = new.servicio_id and s.empresa_id = new.empresa_id
  ) then
    raise exception 'El servicio no pertenece a este taller.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.plantillas_inspeccion pl where pl.id = new.plantilla_id and pl.empresa_id = new.empresa_id) then
    raise exception 'La plantilla no pertenece a este taller.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_servicio_de_plantilla() from public, anon, authenticated;
create trigger trg_plantilla_puntos_validar before insert or update on public.plantilla_inspeccion_puntos
  for each row execute function public.validar_servicio_de_plantilla();

-- 3) Sugerencia de cada punto, copiada al crear la inspección ----------------------------------------------
alter table public.inspeccion_puntos
  add column servicio_nombre      text,
  add column reparacion_sugerida  text,
  add column precio_sugerido      numeric(12,2) check (precio_sugerido is null or precio_sugerido >= 0);

alter table public.inspecciones
  add column plantilla_nombre text;

-- 4) Crear una plantilla desde la estándar o duplicando otra; marcar la de por defecto -----------------------
create or replace function public.crear_plantilla_inspeccion(p_nombre text, p_origen text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_empresa text := public.mi_empresa_id();
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_id      text;
begin
  if v_empresa is null then raise exception 'No autorizado.' using errcode = 'P0001'; end if;
  if char_length(v_nombre) < 1 or char_length(v_nombre) > 60 then
    raise exception 'El nombre de la plantilla debe tener entre 1 y 60 caracteres.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.plantillas_inspeccion where empresa_id = v_empresa and lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya tienes una plantilla con ese nombre.' using errcode = 'P0001';
  end if;
  if p_origen is not null and not exists (select 1 from public.plantillas_inspeccion where id = p_origen and empresa_id = v_empresa) then
    raise exception 'La plantilla de origen no existe.' using errcode = 'P0001';
  end if;

  -- La primera plantilla del taller pasa a ser la de por defecto.
  insert into public.plantillas_inspeccion (empresa_id, nombre, es_defecto)
  values (v_empresa, v_nombre, not exists (select 1 from public.plantillas_inspeccion where empresa_id = v_empresa))
  returning id into v_id;

  if p_origen is null then
    insert into public.plantilla_inspeccion_puntos (plantilla_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_empresa, e.categoria, e.nombre, e.posicion from public.plantilla_inspeccion_estandar() e;
  else
    insert into public.plantilla_inspeccion_puntos (plantilla_id, empresa_id, categoria, nombre, posicion, servicio_id)
    select v_id, v_empresa, o.categoria, o.nombre, o.posicion, o.servicio_id
      from public.plantilla_inspeccion_puntos o where o.plantilla_id = p_origen;
  end if;
  return v_id;
end;
$$;
revoke all on function public.crear_plantilla_inspeccion(text, text) from public, anon;
grant execute on function public.crear_plantilla_inspeccion(text, text) to authenticated;

create or replace function public.establecer_plantilla_defecto(p_plantilla_id text)
returns void
language plpgsql
set search_path = public
as $$
declare v_empresa text;
begin
  select empresa_id into v_empresa from public.plantillas_inspeccion where id = p_plantilla_id;
  if v_empresa is null then raise exception 'Plantilla no encontrada.' using errcode = 'P0001'; end if;
  update public.plantillas_inspeccion set es_defecto = false where empresa_id = v_empresa and es_defecto and id <> p_plantilla_id;
  update public.plantillas_inspeccion set es_defecto = true where id = p_plantilla_id;
end;
$$;
revoke all on function public.establecer_plantilla_defecto(text) from public, anon;
grant execute on function public.establecer_plantilla_defecto(text) to authenticated;

-- 5) crear_inspeccion con plantilla ---------------------------------------------------------------------------
drop function if exists public.crear_inspeccion(text);

create or replace function public.crear_inspeccion(p_orden_id text, p_plantilla_id text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_ot record;
  v_id text;
  v_plantilla text;
  v_nombre_plantilla text;
  v_filas int;
begin
  select id, empresa_id, vehiculo_id, cliente_id, kilometraje_entrada, estado, tecnico_asignado
    into v_ot from public.ordenes_trabajo where id = p_orden_id;
  if not found then
    raise exception 'Orden no encontrada.';
  end if;
  if v_ot.estado = 'cancelado' then
    raise exception 'No se puede inspeccionar una orden cancelada.';
  end if;

  select id into v_id from public.inspecciones where orden_id = p_orden_id;
  if v_id is not null then
    return v_id;
  end if;

  -- Plantilla: la pedida (debe ser de este taller), si no la de por defecto, si no la estándar del sistema.
  if p_plantilla_id is not null then
    select id, nombre into v_plantilla, v_nombre_plantilla
      from public.plantillas_inspeccion where id = p_plantilla_id and empresa_id = v_ot.empresa_id;
    if v_plantilla is null then
      raise exception 'La plantilla elegida no existe.';
    end if;
  else
    select id, nombre into v_plantilla, v_nombre_plantilla
      from public.plantillas_inspeccion where empresa_id = v_ot.empresa_id and es_defecto;
  end if;

  insert into public.inspecciones (empresa_id, orden_id, vehiculo_id, cliente_id, km, realizada_por, plantilla_nombre)
  values (v_ot.empresa_id, v_ot.id, v_ot.vehiculo_id, v_ot.cliente_id, nullif(v_ot.kilometraje_entrada, 0), v_ot.tecnico_asignado,
          coalesce(v_nombre_plantilla, 'Estándar'))
  returning id into v_id;

  if v_plantilla is not null then
    insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion, servicio_nombre, reparacion_sugerida, precio_sugerido)
    select v_id, v_ot.empresa_id, p.categoria, p.nombre, row_number() over (order by p.posicion, p.id)::int,
           s.nombre, s.reparacion, s.precio
      from public.plantilla_inspeccion_puntos p
      left join public.servicios_predefinidos s on s.id = p.servicio_id and s.activo
     where p.plantilla_id = v_plantilla;
    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      raise exception 'La plantilla elegida no tiene ningún punto. Añade puntos en Ajustes → Inspección.';
    end if;
  else
    insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_ot.empresa_id, p.categoria, p.nombre, p.posicion from public.plantilla_inspeccion_estandar() p;
  end if;

  return v_id;
end;
$$;
revoke all on function public.crear_inspeccion(text, text) from public, anon;
grant execute on function public.crear_inspeccion(text, text) to authenticated, service_role;

-- 6) Prueba de la aceptación del cliente en la inspección ---------------------------------------------------------
alter table public.inspecciones
  add column aceptacion_nombre       text,
  add column aceptacion_en           timestamptz,
  add column aceptacion_total        numeric(12,2),
  add column aceptacion_texto        text,
  add column aceptacion_ip           text,
  add column aceptacion_dispositivo  text;

alter table public.inspecciones
  add constraint insp_aceptacion_completa_chk check (
    (aceptacion_en is null) = (aceptacion_nombre is null)
    and (aceptacion_en is null) = (aceptacion_total is null)
    and (aceptacion_en is null) = (aceptacion_texto is null)
  ),
  add constraint insp_aceptacion_longitudes_chk check (
    char_length(coalesce(aceptacion_nombre, '')) <= 120
    and char_length(coalesce(aceptacion_texto, '')) <= 2500
    and char_length(coalesce(aceptacion_ip, '')) <= 64
    and char_length(coalesce(aceptacion_dispositivo, '')) <= 300
  );

-- La aceptación solo la escribe el servidor y no se toca una vez registrada.
create or replace function public.proteger_inspeccion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cambia_aceptacion boolean :=
       new.aceptacion_nombre      is distinct from old.aceptacion_nombre
    or new.aceptacion_en          is distinct from old.aceptacion_en
    or new.aceptacion_total       is distinct from old.aceptacion_total
    or new.aceptacion_texto       is distinct from old.aceptacion_texto
    or new.aceptacion_ip          is distinct from old.aceptacion_ip
    or new.aceptacion_dispositivo is distinct from old.aceptacion_dispositivo;
begin
  if cambia_aceptacion then
    if old.aceptacion_en is not null then
      raise exception 'La aceptación del cliente ya está registrada y no se puede modificar.' using errcode = 'P0001';
    end if;
    if auth.uid() is not null and not public.es_super_admin() then
      raise exception 'La aceptación del cliente solo se registra desde su portal.' using errcode = 'P0001';
    end if;
  end if;
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;
  if new.estado = 'respondida' and old.estado is distinct from 'respondida' then
    raise exception 'La respuesta del cliente solo se registra desde su portal.';
  end if;
  if old.estado = 'respondida' and (new.estado is distinct from old.estado or new.respondida_en is distinct from old.respondida_en) then
    raise exception 'El cliente ya respondió a esta inspección: no se puede reabrir.';
  end if;
  if old.estado in ('enviada', 'respondida') and new.nota_general is distinct from old.nota_general then
    raise exception 'La inspección ya se envió al cliente. Reábrela para cambiarla.';
  end if;
  return new;
end;
$$;
