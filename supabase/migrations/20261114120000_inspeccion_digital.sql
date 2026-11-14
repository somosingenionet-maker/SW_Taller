-- Inspección digital del vehículo (fase A) y conservación limitada de fotos.
-- Diseño: docs/diseno-inspeccion-digital.md.
--
-- Qué añade:
--   · `inspecciones` (una por orden) e `inspeccion_puntos` (los puntos revisados, con estado, nota, fotos y
--     precio), con la plantilla estándar de 28 puntos copiada al crearla: si algún día cambia la plantilla,
--     las inspecciones antiguas no cambian.
--   · Bucket PRIVADO `inspecciones` (las fotos se sirven con enlaces firmados que caducan).
--   · Conservación de fotos: plazo por taller (por defecto 6 meses desde la entrega), marca «conservar» por
--     orden, interruptor general y fecha mínima del primer borrado (30 días de margen para avisar).
--   · Funciones: crear_inspeccion, fotos_por_caducar (solo servidor) y uso_almacenamiento.
--   · Las líneas del presupuesto que nacen de un punto guardan de cuál.

-- 1) Tablas -------------------------------------------------------------------------------------
create table public.inspecciones (
  id                text primary key default gen_random_uuid()::text,
  empresa_id        text not null references public.empresas(id) on delete cascade,
  orden_id          text not null unique references public.ordenes_trabajo(id) on delete cascade,
  vehiculo_id       text not null references public.vehiculos(id) on delete restrict,
  cliente_id        text not null references public.clientes(id) on delete restrict,
  estado            text not null default 'borrador'
                    check (estado in ('borrador', 'terminada', 'enviada', 'respondida')),
  km                int,
  realizada_por     text,
  nota_general      text,
  terminada_en      timestamptz,
  enviada_en        timestamptz,
  respondida_en     timestamptz,
  fotos_borradas_en timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.inspecciones (empresa_id);
create index on public.inspecciones (vehiculo_id);
create index on public.inspecciones (cliente_id);
create trigger trg_inspecciones_updated before update on public.inspecciones
  for each row execute function public.set_updated_at();

create table public.inspeccion_puntos (
  id            text primary key default gen_random_uuid()::text,
  inspeccion_id text not null references public.inspecciones(id) on delete cascade,
  empresa_id    text not null references public.empresas(id) on delete cascade,
  categoria     text not null,
  nombre        text not null,
  posicion      int  not null,
  estado        text check (estado in ('bien', 'atencion', 'urgente', 'no_aplica')),
  nota          text check (nota is null or char_length(nota) <= 500),
  -- Rutas dentro del bucket `inspecciones` («<empresa>/<inspeccion>/<uuid>.jpg»), no URLs.
  fotos         text[] not null default '{}' check (cardinality(fotos) <= 5),
  reparacion    text check (reparacion is null or char_length(reparacion) <= 300),
  precio        numeric(12,2) check (precio is null or precio >= 0),
  decision      text check (decision in ('aprobado', 'rechazado')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.inspeccion_puntos (inspeccion_id, posicion);
create index on public.inspeccion_puntos (empresa_id);
create trigger trg_inspeccion_puntos_updated before update on public.inspeccion_puntos
  for each row execute function public.set_updated_at();

alter table public.lineas_ot
  add column inspeccion_punto_id text references public.inspeccion_puntos(id) on delete set null;
create index on public.lineas_ot (inspeccion_punto_id) where inspeccion_punto_id is not null;

alter table public.inspecciones enable row level security;
alter table public.inspeccion_puntos enable row level security;

create policy inspecciones_tenant on public.inspecciones for all to authenticated
  using (public.es_super_admin() or empresa_id = public.mi_empresa_id())
  with check (public.es_super_admin() or empresa_id = public.mi_empresa_id());
create policy inspeccion_puntos_tenant on public.inspeccion_puntos for all to authenticated
  using (public.es_super_admin() or empresa_id = public.mi_empresa_id())
  with check (public.es_super_admin() or empresa_id = public.mi_empresa_id());

-- Mismo bloqueo de solo lectura que el resto cuando termina la prueba o la suscripción.
create trigger trg_suscripcion_activa before insert or update or delete on public.inspecciones
  for each statement execute function public.exigir_suscripcion_activa();
create trigger trg_suscripcion_activa before insert or update or delete on public.inspeccion_puntos
  for each statement execute function public.exigir_suscripcion_activa();

-- 2) Reglas que no dependen de la pantalla ------------------------------------------------------------
-- Los usuarios del taller no pueden fingir la respuesta del cliente ni editar lo ya enviado. El servidor
-- (service role: el Portal del Mecánico y el del Cliente) y el super administrador quedan fuera.
create or replace function public.proteger_inspeccion_punto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_estado text;
begin
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;
  if new.decision is distinct from old.decision then
    raise exception 'La decisión del cliente solo se registra desde su portal.';
  end if;
  select estado into v_estado from public.inspecciones where id = old.inspeccion_id;
  if v_estado in ('enviada', 'respondida') and (
       new.estado     is distinct from old.estado
    or new.nota       is distinct from old.nota
    or new.fotos      is distinct from old.fotos
    or new.reparacion is distinct from old.reparacion
    or new.precio     is distinct from old.precio
  ) then
    raise exception 'La inspección ya se envió al cliente. Reábrela para cambiarla.';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_inspeccion_punto() from public, anon, authenticated;
create trigger trg_inspeccion_puntos_proteger before update on public.inspeccion_puntos
  for each row execute function public.proteger_inspeccion_punto();

create or replace function public.proteger_inspeccion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
revoke all on function public.proteger_inspeccion() from public, anon, authenticated;
create trigger trg_inspecciones_proteger before update on public.inspecciones
  for each row execute function public.proteger_inspeccion();

-- 3) Plantilla estándar y creación ---------------------------------------------------------------------
create or replace function public.plantilla_inspeccion_estandar()
returns table (categoria text, nombre text, posicion int)
language sql
immutable
set search_path = public
as $$
  select v.categoria, v.nombre, v.posicion
  from (values
    ('Frenos', 'Pastillas delanteras', 1),
    ('Frenos', 'Discos delanteros', 2),
    ('Frenos', 'Pastillas traseras', 3),
    ('Frenos', 'Discos o tambores traseros', 4),
    ('Frenos', 'Líquido de frenos', 5),
    ('Neumáticos', 'Delantero izquierdo', 6),
    ('Neumáticos', 'Delantero derecho', 7),
    ('Neumáticos', 'Trasero izquierdo', 8),
    ('Neumáticos', 'Trasero derecho', 9),
    ('Neumáticos', 'Rueda de repuesto o kit antipinchazos', 10),
    ('Fluidos', 'Aceite de motor', 11),
    ('Fluidos', 'Refrigerante', 12),
    ('Fluidos', 'Líquido limpiaparabrisas', 13),
    ('Fluidos', 'Dirección asistida', 14),
    ('Motor y transmisión', 'Correa de accesorios', 15),
    ('Motor y transmisión', 'Fugas visibles', 16),
    ('Motor y transmisión', 'Silentblocks y soportes', 17),
    ('Motor y transmisión', 'Escape', 18),
    ('Suspensión y dirección', 'Amortiguadores', 19),
    ('Suspensión y dirección', 'Rótulas y trapecios', 20),
    ('Suspensión y dirección', 'Cubos de rueda', 21),
    ('Luces y visibilidad', 'Luces delanteras', 22),
    ('Luces y visibilidad', 'Luces traseras e intermitentes', 23),
    ('Luces y visibilidad', 'Escobillas', 24),
    ('Luces y visibilidad', 'Parabrisas', 25),
    ('Eléctrico y confort', 'Batería', 26),
    ('Eléctrico y confort', 'Aire acondicionado y filtro de habitáculo', 27),
    ('Eléctrico y confort', 'Testigos del cuadro', 28)
  ) as v(categoria, nombre, posicion)
$$;
revoke all on function public.plantilla_inspeccion_estandar() from public, anon;
grant execute on function public.plantilla_inspeccion_estandar() to authenticated, service_role;

-- Crea la inspección de una orden (o devuelve la que ya tiene). Se ejecuta con los permisos de quien
-- llama: solo ve y crea sobre órdenes de su taller.
create or replace function public.crear_inspeccion(p_orden_id text)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_ot record;
  v_id text;
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

  insert into public.inspecciones (empresa_id, orden_id, vehiculo_id, cliente_id, km, realizada_por)
  values (v_ot.empresa_id, v_ot.id, v_ot.vehiculo_id, v_ot.cliente_id, nullif(v_ot.kilometraje_entrada, 0), v_ot.tecnico_asignado)
  returning id into v_id;

  insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion)
  select v_id, v_ot.empresa_id, p.categoria, p.nombre, p.posicion from public.plantilla_inspeccion_estandar() p;

  return v_id;
end;
$$;
revoke all on function public.crear_inspeccion(text) from public, anon;
grant execute on function public.crear_inspeccion(text) to authenticated;

-- 4) Fotos: bucket privado y conservación limitada ---------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspecciones', 'inspecciones', false, 6291456, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

-- El taller lee y borra las fotos de su carpeta (`<empresa>/…`). Subir lo hace el servidor con URL firmada
-- (el mecánico no tiene cuenta) y leerlas el cliente, igual, con enlaces que caducan.
create policy inspecciones_leer_propio on storage.objects for select to authenticated
  using (bucket_id = 'inspecciones' and (public.es_super_admin() or (storage.foldername(name))[1] = public.mi_empresa_id()));
create policy inspecciones_borrar_propio on storage.objects for delete to authenticated
  using (bucket_id = 'inspecciones' and (public.es_super_admin() or (storage.foldername(name))[1] = public.mi_empresa_id()));

alter table public.empresas
  add column fotos_retencion_meses int not null default 6 check (fotos_retencion_meses in (3, 6, 12, 24)),
  add column fotos_aviso_enviado_en timestamptz;
comment on column public.empresas.fotos_retencion_meses is
  'Meses desde la entrega de la orden tras los que se borran sus fotos (recepción e inspección). El texto y los estados se conservan.';
-- El administrador del taller puede cambiar el plazo; `fotos_aviso_enviado_en` solo la escribe el servidor.
grant update (fotos_retencion_meses) on public.empresas to authenticated;

alter table public.ordenes_trabajo
  add column conservar_fotos boolean not null default false,
  add column fotos_borradas_en timestamptz;
comment on column public.ordenes_trabajo.conservar_fotos is 'true: no borrar nunca sus fotos (p. ej. reclamación abierta).';

alter table public.plataforma_config
  add column fotos_borrado_activo boolean not null default true,
  add column fotos_borrado_no_antes_de timestamptz not null default (now() + interval '30 days');
comment on column public.plataforma_config.fotos_borrado_no_antes_de is
  'Margen de 30 días tras activar la función: hasta esa fecha no se borra ninguna foto, para que los talleres reciban el aviso.';
grant update (fotos_borrado_activo) on public.plataforma_config to authenticated;

-- Órdenes con fotos que ya tocaría borrar o que se borrarán pronto. Solo para el servidor.
-- Referencia: la fecha de entrega; en canceladas y presupuestos sin cerrar, la última actividad.
-- Las órdenes en curso (recibidas, en reparación, listas) no se tocan nunca.
create or replace function public.fotos_por_caducar()
returns table (
  orden_id text, empresa_id text, numero text, estado text, referencia timestamptz, borrar_en timestamptz,
  fotos_recepcion text[], fotos_inspeccion text[], inspeccion_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.empresa_id, o.numero, o.estado,
         ref.f, ref.f + make_interval(months => e.fotos_retencion_meses),
         o.fotos_recepcion,
         coalesce((select array_agg(f) from public.inspeccion_puntos ip, unnest(ip.fotos) f where ip.inspeccion_id = i.id), '{}'),
         i.id
  from public.ordenes_trabajo o
  join public.empresas e on e.id = o.empresa_id
  left join public.inspecciones i on i.orden_id = o.id
  cross join lateral (
    select case when o.estado = 'entregado' and o.fecha_entrega is not null then o.fecha_entrega::timestamptz else o.updated_at end as f
  ) ref
  where auth.uid() is null
    and not o.conservar_fotos
    and o.estado in ('entregado', 'cancelado', 'presupuesto')
    and (cardinality(o.fotos_recepcion) > 0
         or exists (select 1 from public.inspeccion_puntos ip where ip.inspeccion_id = i.id and cardinality(ip.fotos) > 0))
  order by ref.f
$$;
revoke all on function public.fotos_por_caducar() from public, anon, authenticated;
grant execute on function public.fotos_por_caducar() to service_role;

-- Espacio ocupado por las fotos y logos: el super administrador ve todos los talleres; un usuario, el suyo.
create or replace function public.uso_almacenamiento()
returns table (empresa_id text, bytes bigint, archivos bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  select (storage.foldername(o.name))[1], coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)::bigint
  from storage.objects o
  where o.bucket_id in ('fotos-recepcion', 'inspecciones', 'logos-empresas')
    and ((auth.uid() is null or public.es_super_admin()) or (storage.foldername(o.name))[1] = public.mi_empresa_id())
  group by 1
$$;
revoke all on function public.uso_almacenamiento() from public, anon;
grant execute on function public.uso_almacenamiento() to authenticated, service_role;
