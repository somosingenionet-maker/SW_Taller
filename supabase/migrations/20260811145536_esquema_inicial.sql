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
  -- Contadores atómicos para la cadena VeriFactu de facturas (ver tabla
  -- `facturas`); el cliente nunca los toca, los gestionan los triggers.
  siguiente_numero_factura int not null default 1,
  ultimo_hash_factura      text,
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
--  Cumplimiento técnico VeriFactu (alcance local, sin envío a la AEAT
--  todavía — ver detalle en los triggers más abajo): numeración correlativa
--  garantizada por servidor, cadena de huellas (hash) e inmutabilidad real
--  de las facturas ya emitidas. El formato exacto de la cadena que se
--  hashea y de la URL del QR sigue la estructura pública conocida del
--  reglamento, pero debe verificarse contra la especificación oficial de
--  la AEAT (o con un gestor/asesor fiscal) antes de usarse con clientes
--  reales — esto es ingeniería de software, no asesoría fiscal.
-- ============================================================================
create table public.facturas (
  id                  text primary key default gen_random_uuid()::text,
  empresa_id          text not null references public.empresas(id) on delete cascade,
  numero              text not null unique,
  cliente_id          text not null references public.clientes(id) on delete restrict,
  vehiculo_id         text references public.vehiculos(id) on delete set null,
  fecha               date not null default current_date,
  fecha_vencimiento   date not null,
  estado              text not null check (estado in ('borrador','emitida','pagada','vencida','cancelada')),
  notas               text not null default '',
  subtotal            numeric(12,2) not null default 0,
  iva_pct             numeric(5,2)  not null default 21,
  total_iva           numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,
  -- Cadena VeriFactu: se rellenan solo al emitir (borrador -> emitida); los
  -- gestiona el trigger trg_facturas_emitir, nunca el cliente.
  hash                text,
  hash_anterior       text,
  qr_url              text,
  fecha_emision_hash  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.facturas (empresa_id);
create index on public.facturas (cliente_id);
create index on public.facturas (estado);
create trigger trg_facturas_updated before update on public.facturas
  for each row execute function public.set_updated_at();
create trigger trg_facturas_empresa before insert on public.facturas
  for each row execute function public.set_empresa_id();

-- Numeración correlativa atómica: si el cliente no envía `numero` (el caso
-- normal — igual que empresa_id, el cliente no gestiona este campo), se
-- asigna incrementando el contador de la propia empresa. `for update`
-- serializa la asignación entre creaciones concurrentes.
create or replace function public.set_numero_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_siguiente int;
begin
  if new.numero is null then
    update public.empresas
      set siguiente_numero_factura = siguiente_numero_factura + 1
      where id = new.empresa_id
      returning siguiente_numero_factura - 1 into v_siguiente;
    new.numero := 'FAC-' || lpad(v_siguiente::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger trg_facturas_numero before insert on public.facturas
  for each row execute function public.set_numero_factura();

-- Emisión, cadena de huellas e inmutabilidad. Un único trigger before
-- update cubre las tres situaciones posibles según la transición de
-- estado:
--  1) borrador -> emitida: es el momento de emitir. Calcula la huella
--     encadenada (hash de esta factura + huella de la anterior emitida de
--     la misma empresa) y el QR de verificación; a partir de aquí la
--     factura queda protegida por el caso 3.
--  2) cualquier otro estado ya no borrador (emitida/pagada/vencida) hacia
--     otro estado: solo se permiten las transiciones administrativas
--     legítimas (marcar pagada, vencida o cancelada) y ningún campo de
--     contenido puede cambiar — si cambia, se rechaza la operación entera.
--  3) borrador -> borrador: edición normal de un borrador, sin restricción.
create or replace function public.emitir_y_proteger_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_hash_anterior text;
  v_nif           text;
  v_cadena        text;
begin
  if old.estado = 'borrador' and new.estado = 'emitida' then
    select nif into v_nif from public.empresas where id = new.empresa_id;

    -- `for update` bloquea la fila de la empresa hasta el commit, así dos
    -- emisiones concurrentes de la misma empresa se serializan y ninguna
    -- lee la huella "anterior" que la otra está a punto de sobrescribir.
    select ultimo_hash_factura into v_hash_anterior
      from public.empresas where id = new.empresa_id for update;

    new.fecha_emision_hash := now();
    -- Cadena a verificar contra la especificación oficial antes de producción.
    v_cadena := coalesce(v_hash_anterior, '') || '|' || coalesce(v_nif, '') || '|' || new.numero
      || '|' || new.fecha::text || '|' || new.total::text;
    -- digest() vive en el esquema `extensions` en Supabase (no en `public`),
    -- por eso se cualifica: la función usa search_path = public a propósito
    -- por seguridad y no lo incluye por defecto.
    new.hash := encode(extensions.digest(v_cadena::bytea, 'sha256'::text), 'hex');
    new.hash_anterior := v_hash_anterior;
    new.qr_url := 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
      || '?nif=' || coalesce(v_nif, '')
      || '&numserie=' || new.numero
      || '&fecha=' || to_char(new.fecha, 'DD-MM-YYYY')
      || '&importe=' || new.total::text;

    update public.empresas set ultimo_hash_factura = new.hash where id = new.empresa_id;

  elsif old.estado <> 'borrador' then
    if new.numero <> old.numero or new.cliente_id <> old.cliente_id
       or new.vehiculo_id is distinct from old.vehiculo_id
       or new.fecha <> old.fecha or new.fecha_vencimiento <> old.fecha_vencimiento
       or new.subtotal <> old.subtotal or new.iva_pct <> old.iva_pct
       or new.total_iva <> old.total_iva or new.total <> old.total
       or new.notas <> old.notas or new.empresa_id <> old.empresa_id
       or new.hash is distinct from old.hash or new.hash_anterior is distinct from old.hash_anterior
       or new.qr_url is distinct from old.qr_url
    then
      raise exception 'No se puede modificar el contenido de una factura ya emitida (VeriFactu). Usa una factura rectificativa.';
    end if;

    if new.estado <> old.estado then
      if not (
        (old.estado = 'emitida' and new.estado in ('pagada', 'vencida', 'cancelada')) or
        (old.estado = 'vencida' and new.estado in ('pagada', 'cancelada'))
      ) then
        raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
      end if;
    end if;
  end if;

  return new;
end;
$$;
create trigger trg_facturas_emitir before update on public.facturas
  for each row execute function public.emitir_y_proteger_factura();

-- Bloquea el borrado de cualquier factura que ya haya sido emitida.
create or replace function public.bloquear_borrado_factura()
returns trigger
language plpgsql
as $$
begin
  if old.estado <> 'borrador' then
    raise exception 'No se puede eliminar una factura ya emitida (VeriFactu). Usa una factura rectificativa.';
  end if;
  return old;
end;
$$;
create trigger trg_facturas_no_borrar before delete on public.facturas
  for each row execute function public.bloquear_borrado_factura();

-- Las líneas y las OT asociadas de una factura ya emitida tampoco se
-- pueden tocar (hoy updateFactura() borra y reinserta líneas en cada
-- guardado — a partir de aquí eso queda bloqueado por la base de datos si
-- la factura padre ya no es un borrador).
create or replace function public.bloquear_edicion_hijos_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_factura_id text;
begin
  v_factura_id := coalesce(new.factura_id, old.factura_id);
  select estado into v_estado from public.facturas where id = v_factura_id;
  if v_estado is not null and v_estado <> 'borrador' then
    raise exception 'No se pueden modificar las líneas de una factura ya emitida (VeriFactu).';
  end if;
  return coalesce(new, old);
end;
$$;

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
create trigger trg_lineas_factura_inmutable before insert or update or delete on public.lineas_factura
  for each row execute function public.bloquear_edicion_hijos_factura();

-- OT importadas en cada factura (trazabilidad) --------------------------------
create table public.factura_ot (
  factura_id text not null references public.facturas(id) on delete cascade,
  ot_id      text not null references public.ordenes_trabajo(id) on delete restrict,
  primary key (factura_id, ot_id)
);
create index on public.factura_ot (ot_id);
create trigger trg_factura_ot_inmutable before insert or update or delete on public.factura_ot
  for each row execute function public.bloquear_edicion_hijos_factura();

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
