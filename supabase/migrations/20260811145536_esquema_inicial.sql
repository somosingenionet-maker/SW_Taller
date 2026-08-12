-- ============================================================================
--  inGenio Taller · Esquema inicial
--  Backend Supabase (PostgreSQL). Migración versionada — fuente de verdad del
--  modelo de datos. Convención de columnas: snake_case (idiomático en Postgres);
--  el cliente de la API mapea a camelCase para el frontend.
--
--  Claves primarias de negocio en `text` (default = uuid como texto) para poder
--  conservar los IDs existentes (veh-1, cli-1...) durante la migración
--  incremental desde localStorage y no romper referencias cruzadas.
--
--  Multi-tenant: el producto se vende a varias empresas (SaaS), cada una con
--  sus propios datos aislados. `empresas` es la tabla de tenants; todas las
--  tablas raíz de negocio llevan `empresa_id` y la RLS filtra por él. Las
--  tablas hijas/junction heredan el aislamiento vía join a su tabla padre.
-- ============================================================================

-- Extensiones -----------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Utilidad: trigger que mantiene updated_at ----------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
--  EMPRESAS  (tenants — cada una es una empresa cliente del SaaS)
-- ============================================================================
create table public.empresas (
  id               text primary key default gen_random_uuid()::text,
  nombre           text not null,
  tagline          text not null default '',
  razon_social     text not null default '',
  nif              text not null default '',
  direccion_fiscal text not null default '',
  correo           text not null default '',
  telefono         text not null default '',
  web              text not null default '',
  ciudad           text not null default '',
  brand_color      text not null default '#2563eb',
  logo_base64      text not null default '',
  activo           boolean not null default true,  -- permite suspender el acceso de una empresa
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_empresas_updated before update on public.empresas
  for each row execute function public.set_updated_at();

-- ============================================================================
--  PERFILES  (extiende auth.users de Supabase Auth — clave uuid)
--  empresa_id nulo = super admin (dueño de la plataforma, sin empresa propia).
-- ============================================================================
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  empresa_id  text references public.empresas(id) on delete cascade,
  nombre      text not null,
  email       text,
  rol         text not null default 'usuario' check (rol in ('super_admin','admin','usuario')),
  modulos     text[] not null default array['vehiculos','clientes','taller','alertas','rentabilidad','facturas'],
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.perfiles (empresa_id);
create trigger trg_perfiles_updated before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Alta automática de perfil al registrarse un usuario en Auth -----------------
-- empresa_id/rol se ajustan después desde las Edge Functions de alta
-- (admin-users / manage-empresas), que conocen el contexto de la operación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)), new.email);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funciones helper para RLS ---------------------------------------------------
-- security definer: evita que la propia RLS de `perfiles` bloquee la lectura
-- que estas funciones necesitan hacer para resolver la política de otra tabla.
create or replace function public.mi_empresa_id()
returns text
language sql stable security definer set search_path = public
as $$
  select empresa_id from public.perfiles where id = auth.uid()
$$;

create or replace function public.es_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select rol = 'super_admin' from public.perfiles where id = auth.uid()), false)
$$;

-- Trigger: autocompleta empresa_id en el insert si el cliente no lo envía
-- (lo habitual — la app no gestiona empresa_id, solo el backend). Se aplica
-- a las tablas raíz de negocio. security definer por el mismo motivo que
-- mi_empresa_id(): necesita leer `perfiles` aunque el INSERT lo dispare un
-- rol que no tenga acceso directo a esa fila todavía en ese momento.
create or replace function public.set_empresa_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.empresa_id is null then
    new.empresa_id := public.mi_empresa_id();
  end if;
  return new;
end;
$$;

-- ============================================================================
--  VEHÍCULOS
-- ============================================================================
create table public.vehiculos (
  id                   text primary key default gen_random_uuid()::text,
  empresa_id           text not null references public.empresas(id) on delete cascade,
  marca                text not null,
  modelo               text not null,
  anio                 int,
  color                text,
  combustible          text check (combustible in ('gasolina','diesel','hibrido','electrico','otro')),
  matricula            text not null unique,
  bastidor             text not null unique,
  kilometraje          int not null default 0,
  itv_vencimiento      date,
  seguro_vencimiento   date,
  impuesto_vencimiento date,
  fecha_registro       date not null default current_date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.vehiculos (empresa_id);
create trigger trg_vehiculos_updated before update on public.vehiculos
  for each row execute function public.set_updated_at();
create trigger trg_vehiculos_empresa before insert on public.vehiculos
  for each row execute function public.set_empresa_id();

-- ============================================================================
--  CLIENTES
-- ============================================================================
create table public.clientes (
  id                text primary key default gen_random_uuid()::text,
  empresa_id        text not null references public.empresas(id) on delete cascade,
  nombre            text not null,
  apellidos         text not null,
  nif_nie_pasaporte text not null,
  correo            text,
  telefono          text,
  direccion         text,
  ciudad            text,
  pais              text,
  fecha_registro    date not null default current_date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.clientes (empresa_id);
create trigger trg_clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();
create trigger trg_clientes_empresa before insert on public.clientes
  for each row execute function public.set_empresa_id();

-- Asociación cliente ⇄ vehículo (un vehículo pertenece a un único cliente) -----
create table public.cliente_vehiculo (
  cliente_id  text not null references public.clientes(id) on delete cascade,
  vehiculo_id text not null references public.vehiculos(id) on delete cascade,
  primary key (cliente_id, vehiculo_id),
  unique (vehiculo_id)   -- garantiza propietario único por vehículo
);
create index on public.cliente_vehiculo (vehiculo_id);

-- Interacciones del cliente (llamadas, emails, visitas...) --------------------
create table public.interacciones_cliente (
  id         text primary key default gen_random_uuid()::text,
  cliente_id text not null references public.clientes(id) on delete cascade,
  fecha      date not null default current_date,
  tipo       text not null check (tipo in ('llamada','email','visita','whatsapp','registro_contrato')),
  notas      text not null default '',
  created_at timestamptz not null default now()
);
create index on public.interacciones_cliente (cliente_id);

-- ============================================================================
--  TÉCNICOS
-- ============================================================================
create table public.tecnicos (
  id           text primary key default gen_random_uuid()::text,
  empresa_id   text not null references public.empresas(id) on delete cascade,
  nombre       text not null,
  especialidad text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.tecnicos (empresa_id);
create trigger trg_tecnicos_updated before update on public.tecnicos
  for each row execute function public.set_updated_at();
create trigger trg_tecnicos_empresa before insert on public.tecnicos
  for each row execute function public.set_empresa_id();

-- ============================================================================
--  ÓRDENES DE TRABAJO
-- ============================================================================
create table public.ordenes_trabajo (
  id                     text primary key default gen_random_uuid()::text,
  empresa_id             text not null references public.empresas(id) on delete cascade,
  numero                 text not null unique,
  vehiculo_id            text not null references public.vehiculos(id) on delete restrict,
  cliente_id             text not null references public.clientes(id) on delete restrict,
  estado                 text not null check (estado in ('presupuesto','recibido','en_reparacion','listo','entregado','cancelado')),
  fecha_recepcion        date not null default current_date,
  fecha_estimada_entrega date,
  fecha_entrega          date,
  kilometraje_entrada    int not null default 0,
  kilometraje_salida     int,
  descripcion_problema   text not null default '',
  diagnostico            text,
  -- El técnico se guarda por nombre (relación laxa; la tabla tecnicos solo
  -- alimenta el desplegable de selección).
  tecnico_asignado       text,
  subtotal               numeric(12,2) not null default 0,
  iva_pct                numeric(5,2)  not null default 21,
  total_iva              numeric(12,2) not null default 0,
  total                  numeric(12,2) not null default 0,
  notas                  text,
  presupuesto_estado     text check (presupuesto_estado in ('pendiente','enviado')),
  presupuesto_aprobado   boolean,
  notificacion_enviada   boolean,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index on public.ordenes_trabajo (empresa_id);
create index on public.ordenes_trabajo (vehiculo_id);
create index on public.ordenes_trabajo (cliente_id);
create index on public.ordenes_trabajo (estado);
create trigger trg_ot_updated before update on public.ordenes_trabajo
  for each row execute function public.set_updated_at();
create trigger trg_ot_empresa before insert on public.ordenes_trabajo
  for each row execute function public.set_empresa_id();

-- Líneas de la OT (mano de obra, piezas, materiales) --------------------------
create table public.lineas_ot (
  id              text primary key default gen_random_uuid()::text,
  ot_id           text not null references public.ordenes_trabajo(id) on delete cascade,
  tipo            text not null check (tipo in ('mano_de_obra','pieza','material')),
  descripcion     text not null default '',
  cantidad        numeric(12,2) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  costo_unitario  numeric(12,2),
  subtotal        numeric(12,2) not null default 0,
  posicion        int not null default 0
);
create index on public.lineas_ot (ot_id);

-- Historial cronológico de eventos de la OT ----------------------------------
create table public.eventos_ot (
  id          text primary key default gen_random_uuid()::text,
  ot_id       text not null references public.ordenes_trabajo(id) on delete cascade,
  fecha       timestamptz not null default now(),
  descripcion text not null
);
create index on public.eventos_ot (ot_id);

-- ============================================================================
--  ALERTAS  (ITV, seguro, impuesto, mantenimiento por km)
-- ============================================================================
create table public.alertas (
  id                 text primary key default gen_random_uuid()::text,
  empresa_id         text not null references public.empresas(id) on delete cascade,
  vehiculo_id        text not null references public.vehiculos(id) on delete cascade,
  tipo               text not null check (tipo in ('itv','mantenimiento','seguro','impuesto')),
  descripcion        text not null default '',
  estado             text not null check (estado in ('activa','pendiente','atendida')),
  fecha_limite       date,
  kilometraje_limite int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.alertas (empresa_id);
create index on public.alertas (vehiculo_id);
create index on public.alertas (estado);
create trigger trg_alertas_updated before update on public.alertas
  for each row execute function public.set_updated_at();
create trigger trg_alertas_empresa before insert on public.alertas
  for each row execute function public.set_empresa_id();

-- ============================================================================
--  NOTIFICACIONES A CLIENTES
-- ============================================================================
create table public.notificaciones_cliente (
  id          text primary key default gen_random_uuid()::text,
  empresa_id  text not null references public.empresas(id) on delete cascade,
  cliente_id  text not null references public.clientes(id) on delete cascade,
  vehiculo_id text references public.vehiculos(id) on delete set null,
  tipo_envio  text not null check (tipo_envio in ('email','sms','whatsapp')),
  asunto      text,
  mensaje     text not null,
  fecha_envio timestamptz not null default now(),
  leido       boolean not null default false,
  tipo_evento text not null check (tipo_evento in ('mantenimiento_preventivo','itv_proxima','vencimiento_seguro','reparacion_lista')),
  created_at  timestamptz not null default now()
);
create index on public.notificaciones_cliente (empresa_id);
create index on public.notificaciones_cliente (cliente_id);
create trigger trg_notificaciones_empresa before insert on public.notificaciones_cliente
  for each row execute function public.set_empresa_id();

-- ============================================================================
--  FACTURAS
--  Nota: los campos VeriFactu (huella, huella_anterior, qr_url, numeración
--  correlativa garantizada e inmutabilidad) se añaden en una migración
--  dedicada al construir el módulo legal de facturación.
-- ============================================================================
create table public.facturas (
  id                text primary key default gen_random_uuid()::text,
  empresa_id        text not null references public.empresas(id) on delete cascade,
  numero            text not null unique,
  cliente_id        text not null references public.clientes(id) on delete restrict,
  vehiculo_id       text references public.vehiculos(id) on delete set null,
  fecha             date not null default current_date,
  fecha_vencimiento date not null,
  estado            text not null check (estado in ('borrador','emitida','pagada','vencida','cancelada')),
  notas             text not null default '',
  subtotal          numeric(12,2) not null default 0,
  iva_pct           numeric(5,2)  not null default 21,
  total_iva         numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.facturas (empresa_id);
create index on public.facturas (cliente_id);
create index on public.facturas (estado);
create trigger trg_facturas_updated before update on public.facturas
  for each row execute function public.set_updated_at();
create trigger trg_facturas_empresa before insert on public.facturas
  for each row execute function public.set_empresa_id();

-- Líneas de la factura --------------------------------------------------------
create table public.lineas_factura (
  id              text primary key default gen_random_uuid()::text,
  factura_id      text not null references public.facturas(id) on delete cascade,
  descripcion     text not null default '',
  cantidad        numeric(12,2) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  subtotal        numeric(12,2) not null default 0,
  posicion        int not null default 0
);
create index on public.lineas_factura (factura_id);

-- OT importadas en cada factura (trazabilidad) --------------------------------
create table public.factura_ot (
  factura_id text not null references public.facturas(id) on delete cascade,
  ot_id      text not null references public.ordenes_trabajo(id) on delete restrict,
  primary key (factura_id, ot_id)
);
create index on public.factura_ot (ot_id);

-- ============================================================================
--  ROW LEVEL SECURITY
--  Multi-tenant: cada empresa solo ve sus propios datos (empresa_id = la
--  empresa del usuario autenticado). El super admin (rol super_admin, sin
--  empresa propia) tiene acceso total para poder gestionar las empresas
--  clientes, pero solo a través de las Edge Functions dedicadas — no opera
--  datos de negocio de ninguna empresa desde la aplicación normal.
-- ============================================================================
alter table public.empresas               enable row level security;
alter table public.perfiles               enable row level security;
alter table public.vehiculos              enable row level security;
alter table public.clientes               enable row level security;
alter table public.cliente_vehiculo       enable row level security;
alter table public.interacciones_cliente  enable row level security;
alter table public.tecnicos               enable row level security;
alter table public.ordenes_trabajo        enable row level security;
alter table public.lineas_ot              enable row level security;
alter table public.eventos_ot             enable row level security;
alter table public.alertas                enable row level security;
alter table public.notificaciones_cliente enable row level security;
alter table public.facturas               enable row level security;
alter table public.lineas_factura         enable row level security;
alter table public.factura_ot             enable row level security;

-- Empresas: el super admin ve/edita todas (alta y baja pasan por la Edge
-- Function `manage-empresas`, que también gestiona el primer admin de cada
-- una). El resto de usuarios solo ve/edita la fila de su propia empresa
-- (Ajustes de Empresa).
create policy "empresas_select" on public.empresas
  for select to authenticated
  using (es_super_admin() or id = mi_empresa_id());
create policy "empresas_update" on public.empresas
  for update to authenticated
  using (es_super_admin() or id = mi_empresa_id())
  with check (es_super_admin() or id = mi_empresa_id());

-- Perfiles: cada usuario ve los de su propia empresa (o todos si es super
-- admin); cada usuario edita su propia ficha; un admin de empresa puede
-- editar la ficha de cualquier usuario de su misma empresa, pero nunca puede
-- asignar el rol super_admin. El alta, la baja y el cambio de contraseña de
-- otros usuarios requieren service_role (Auth Admin API) y se resuelven en
-- las Edge Functions `admin-users` / `manage-empresas`, ya que no son
-- operaciones expresables con RLS.
create policy "perfiles_select" on public.perfiles
  for select to authenticated
  using (es_super_admin() or empresa_id = mi_empresa_id());
create policy "perfiles_update_propio" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfiles_update_admin" on public.perfiles
  for update to authenticated
  using (
    empresa_id = mi_empresa_id()
    and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin')
  )
  with check (empresa_id = mi_empresa_id() and rol <> 'super_admin');

-- Tablas raíz de negocio: acceso total al personal autenticado de la misma
-- empresa (o al super admin, aunque en la práctica no las usa).
do $$
declare t text;
begin
  foreach t in array array[
    'vehiculos','clientes','tecnicos','ordenes_trabajo','alertas',
    'notificaciones_cliente','facturas'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (empresa_id = mi_empresa_id() or es_super_admin()) with check (empresa_id = mi_empresa_id() or es_super_admin());',
      t || '_tenant', t
    );
  end loop;
end;
$$;

-- Tablas hijas: heredan el aislamiento por join a su tabla padre (no llevan
-- empresa_id propio para mantener el esquema normalizado).
create policy "cliente_vehiculo_tenant" on public.cliente_vehiculo
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.clientes c where c.id = cliente_vehiculo.cliente_id and c.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.clientes c where c.id = cliente_vehiculo.cliente_id and c.empresa_id = mi_empresa_id()
  ));

create policy "interacciones_cliente_tenant" on public.interacciones_cliente
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.clientes c where c.id = interacciones_cliente.cliente_id and c.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.clientes c where c.id = interacciones_cliente.cliente_id and c.empresa_id = mi_empresa_id()
  ));

create policy "lineas_ot_tenant" on public.lineas_ot
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.ordenes_trabajo o where o.id = lineas_ot.ot_id and o.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.ordenes_trabajo o where o.id = lineas_ot.ot_id and o.empresa_id = mi_empresa_id()
  ));

create policy "eventos_ot_tenant" on public.eventos_ot
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.ordenes_trabajo o where o.id = eventos_ot.ot_id and o.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.ordenes_trabajo o where o.id = eventos_ot.ot_id and o.empresa_id = mi_empresa_id()
  ));

create policy "lineas_factura_tenant" on public.lineas_factura
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.facturas f where f.id = lineas_factura.factura_id and f.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.facturas f where f.id = lineas_factura.factura_id and f.empresa_id = mi_empresa_id()
  ));

create policy "factura_ot_tenant" on public.factura_ot
  for all to authenticated
  using (es_super_admin() or exists (
    select 1 from public.facturas f where f.id = factura_ot.factura_id and f.empresa_id = mi_empresa_id()
  ))
  with check (es_super_admin() or exists (
    select 1 from public.facturas f where f.id = factura_ot.factura_id and f.empresa_id = mi_empresa_id()
  ));

-- Privilegios de tabla para los roles de Supabase. La RLS sigue aplicando el
-- filtrado por fila para anon/authenticated; service_role saltará la RLS y
-- necesita estos GRANT para las operaciones de servidor (Edge Functions, seed).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
