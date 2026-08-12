-- ============================================================================
--  inGenio Taller · Esquema inicial
--  Backend Supabase (PostgreSQL). Migración versionada — fuente de verdad del
--  modelo de datos. Convención de columnas: snake_case (idiomático en Postgres);
--  el cliente de la API mapea a camelCase para el frontend.
--
--  Claves primarias de negocio en `text` (default = uuid como texto) para poder
--  conservar los IDs existentes (veh-1, cli-1...) durante la migración
--  incremental desde localStorage y no romper referencias cruzadas.
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
--  PERFILES  (extiende auth.users de Supabase Auth — clave uuid)
-- ============================================================================
create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  email       text,
  rol         text not null default 'usuario' check (rol in ('admin','usuario')),
  modulos     text[] not null default array['vehiculos','clientes','taller','alertas','rentabilidad','facturas'],
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_perfiles_updated before update on public.perfiles
  for each row execute function public.set_updated_at();

-- Alta automática de perfil al registrarse un usuario en Auth -----------------
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

-- ============================================================================
--  CONFIGURACIÓN DE EMPRESA  (fila única)
-- ============================================================================
create table public.empresa_config (
  id               int primary key default 1 check (id = 1),
  nombre           text not null default 'inGenio',
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
  updated_at       timestamptz not null default now()
);
create trigger trg_empresa_updated before update on public.empresa_config
  for each row execute function public.set_updated_at();

-- ============================================================================
--  VEHÍCULOS
-- ============================================================================
create table public.vehiculos (
  id                   text primary key default gen_random_uuid()::text,
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
create trigger trg_vehiculos_updated before update on public.vehiculos
  for each row execute function public.set_updated_at();

-- ============================================================================
--  CLIENTES
-- ============================================================================
create table public.clientes (
  id                text primary key default gen_random_uuid()::text,
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
create trigger trg_clientes_updated before update on public.clientes
  for each row execute function public.set_updated_at();

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
  nombre       text not null,
  especialidad text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_tecnicos_updated before update on public.tecnicos
  for each row execute function public.set_updated_at();

-- ============================================================================
--  ÓRDENES DE TRABAJO
-- ============================================================================
create table public.ordenes_trabajo (
  id                     text primary key default gen_random_uuid()::text,
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
create index on public.ordenes_trabajo (vehiculo_id);
create index on public.ordenes_trabajo (cliente_id);
create index on public.ordenes_trabajo (estado);
create trigger trg_ot_updated before update on public.ordenes_trabajo
  for each row execute function public.set_updated_at();

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
  vehiculo_id        text not null references public.vehiculos(id) on delete cascade,
  tipo               text not null check (tipo in ('itv','mantenimiento','seguro','impuesto')),
  descripcion        text not null default '',
  estado             text not null check (estado in ('activa','pendiente','atendida')),
  fecha_limite       date,
  kilometraje_limite int,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.alertas (vehiculo_id);
create index on public.alertas (estado);
create trigger trg_alertas_updated before update on public.alertas
  for each row execute function public.set_updated_at();

-- ============================================================================
--  NOTIFICACIONES A CLIENTES
-- ============================================================================
create table public.notificaciones_cliente (
  id          text primary key default gen_random_uuid()::text,
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
create index on public.notificaciones_cliente (cliente_id);

-- ============================================================================
--  FACTURAS
--  Nota: los campos VeriFactu (huella, huella_anterior, qr_url, numeración
--  correlativa garantizada e inmutabilidad) se añaden en una migración
--  dedicada al construir el módulo legal de facturación.
-- ============================================================================
create table public.facturas (
  id                text primary key default gen_random_uuid()::text,
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
create index on public.facturas (cliente_id);
create index on public.facturas (estado);
create trigger trg_facturas_updated before update on public.facturas
  for each row execute function public.set_updated_at();

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
--  Backoffice interno: todo el personal autenticado accede a los datos de
--  negocio. El control fino por módulo/rol es a nivel de aplicación por ahora;
--  se puede endurecer en RLS más adelante. Las escrituras sensibles de
--  facturas pasarán por Edge Function (service_role) al implementar VeriFactu.
-- ============================================================================
alter table public.perfiles               enable row level security;
alter table public.empresa_config         enable row level security;
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

-- Perfiles: cualquiera autenticado puede leerlos (para mostrar técnicos/usuarios);
-- cada usuario solo edita su propia ficha. La gestión de altas/roles de otros
-- usuarios se hará vía Edge Function con service_role (Panel de Administración).
create policy "perfiles_select" on public.perfiles
  for select to authenticated using (true);
create policy "perfiles_update_propio" on public.perfiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Tablas de negocio: acceso total al personal autenticado.
do $$
declare t text;
begin
  foreach t in array array[
    'empresa_config','vehiculos','clientes','cliente_vehiculo','interacciones_cliente',
    'tecnicos','ordenes_trabajo','lineas_ot','eventos_ot','alertas',
    'notificaciones_cliente','facturas','lineas_factura','factura_ot'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true);',
      t || '_todo', t
    );
  end loop;
end;
$$;

-- empresa_config también debe poder leerse sin sesión: la pantalla de login
-- (previa a autenticar) muestra el nombre, logo y color de marca.
create policy "empresa_config_select_anon" on public.empresa_config
  for select to anon using (true);

-- Privilegios de tabla para los roles de Supabase. La RLS sigue aplicando el
-- filtrado por fila para anon/authenticated; service_role saltará la RLS y
-- necesita estos GRANT para las operaciones de servidor (Edge Functions, seed).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- Fila única de configuración de empresa (se crea vacía; se rellena en Ajustes).
insert into public.empresa_config (id) values (1) on conflict (id) do nothing;
