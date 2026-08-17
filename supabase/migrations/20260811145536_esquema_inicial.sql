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
  modulos     text[] not null default array['vehiculos','clientes','taller','alertas','rentabilidad','facturas','inventario','citas'],
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

-- ============================================================================
--  INVENTARIO (productos + libro de movimientos de stock)
-- ============================================================================
create table public.productos (
  id             text primary key default gen_random_uuid()::text,
  empresa_id     text not null references public.empresas(id) on delete cascade,
  nombre         text not null,
  descripcion    text,
  sku            text,
  precio_venta   numeric(12,2) not null default 0,
  costo          numeric(12,2) not null default 0,
  stock_actual   numeric(12,2) not null default 0,
  stock_minimo   numeric(12,2) not null default 0,
  unidad         text not null default 'unidad',
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.productos (empresa_id);
create trigger trg_productos_updated before update on public.productos
  for each row execute function public.set_updated_at();
create trigger trg_productos_empresa before insert on public.productos
  for each row execute function public.set_empresa_id();

-- Libro de movimientos de stock: fuente de verdad, solo se inserta (nunca se
-- edita ni se borra — una corrección se hace con un movimiento 'ajuste'
-- nuevo, no reescribiendo uno viejo). `productos.stock_actual` solo lo toca
-- el trigger de abajo; nada más debe escribir en esa columna.
create table public.movimientos_stock (
  id           text primary key default gen_random_uuid()::text,
  producto_id  text not null references public.productos(id) on delete cascade,
  tipo         text not null check (tipo in ('entrada','salida','ajuste')),
  cantidad     numeric(12,2) not null,
  motivo       text,
  ot_id        text references public.ordenes_trabajo(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint movimientos_stock_cantidad_valida
    check ((tipo in ('entrada','salida') and cantidad > 0) or tipo = 'ajuste')
);
create index on public.movimientos_stock (producto_id);
create index on public.movimientos_stock (ot_id);

-- Aplica el delta de cada movimiento a productos.stock_actual. No hace falta
-- `for update` explícito: igual que set_numero_factura(), todo el
-- read-modify-write ocurre en una única sentencia UPDATE, que ya serializa
-- por fila.
create or replace function public.aplicar_movimiento_stock()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_delta numeric(12,2);
begin
  v_delta := case when new.tipo = 'salida' then -new.cantidad else new.cantidad end;
  update public.productos set stock_actual = stock_actual + v_delta where id = new.producto_id;
  return new;
end;
$$;
create trigger trg_movimientos_aplicar after insert on public.movimientos_stock
  for each row execute function public.aplicar_movimiento_stock();

-- Líneas de la OT (mano de obra o producto de inventario) ---------------------
-- `tipo = 'producto'` siempre va ligado a una fila de `productos` (nunca
-- texto libre) — de ahí el constraint de abajo; `descripcion` se sincroniza
-- con `productos.nombre` vía trigger (ver trg_lineas_ot_descripcion más abajo).
create table public.lineas_ot (
  id              text primary key default gen_random_uuid()::text,
  ot_id           text not null references public.ordenes_trabajo(id) on delete cascade,
  tipo            text not null check (tipo in ('mano_de_obra','producto')),
  producto_id     text references public.productos(id) on delete restrict,
  descripcion     text not null default '',
  cantidad        numeric(12,2) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  costo_unitario  numeric(12,2),
  subtotal        numeric(12,2) not null default 0,
  posicion        int not null default 0,
  constraint lineas_ot_producto_requerido check (tipo <> 'producto' or producto_id is not null)
);
create index on public.lineas_ot (ot_id);
create index on public.lineas_ot (producto_id);

-- Historial cronológico de eventos de la OT ----------------------------------
create table public.eventos_ot (
  id          text primary key default gen_random_uuid()::text,
  ot_id       text not null references public.ordenes_trabajo(id) on delete cascade,
  fecha       timestamptz not null default now(),
  descripcion text not null
);
create index on public.eventos_ot (ot_id);

-- Helper: estado actual de una OT, reutilizado por los triggers de stock de
-- abajo (mismo patrón que mi_empresa_id()/es_super_admin()).
create or replace function public.estado_de_ot(p_ot_id text)
returns text
language sql stable security definer set search_path = public
as $$
  select estado from public.ordenes_trabajo where id = p_ot_id
$$;

-- Sincroniza descripcion con el nombre del producto cuando tipo='producto' —
-- garantiza a nivel de base de datos que una línea de producto solo tiene un
-- nombre (el del catálogo), no texto libre independiente.
create or replace function public.sincronizar_descripcion_producto()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.tipo = 'producto' then
    select nombre into new.descripcion from public.productos where id = new.producto_id;
  end if;
  return new;
end;
$$;
create trigger trg_lineas_ot_descripcion before insert or update on public.lineas_ot
  for each row execute function public.sincronizar_descripcion_producto();

-- --------------------------------------------------------------------------
-- Descuento de stock ligado al ciclo de vida de la OT y sus líneas.
-- Regla de negocio: el stock se descuenta quede reservado en firme al pasar
-- de 'presupuesto' a 'recibido' (cliente ya aprobó, coche ya está en el
-- taller) — nunca al añadir la línea mientras sigue en 'presupuesto'. Una
-- vez la OT ha dejado 'presupuesto', cualquier alta/edición/baja de una
-- línea de producto ajusta el stock al momento.
--
-- Los 4 triggers de abajo son los primeros triggers AFTER de este esquema
-- (el resto son BEFORE porque mutan su propia fila antes de guardarla); solo
-- generan un efecto secundario en movimientos_stock, así que no necesitan
-- interceptar la escritura.
-- --------------------------------------------------------------------------

-- 1) Transición presupuesto -> recibido: descuenta todas las líneas de
--    producto que ya tuviera la OT en ese momento.
create or replace function public.descontar_stock_transicion_ot()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  r record;
begin
  if old.estado = 'presupuesto' and new.estado = 'recibido' then
    for r in
      select producto_id, cantidad from public.lineas_ot
      where ot_id = new.id and tipo = 'producto'
    loop
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, ot_id)
      values (r.producto_id, 'salida', r.cantidad, 'Recepción OT ' || new.numero, new.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger trg_ot_stock_transicion after update on public.ordenes_trabajo
  for each row execute function public.descontar_stock_transicion_ot();

-- 2) Línea de producto añadida a una OT que YA no está en 'presupuesto'
--    (pieza añadida durante la reparación, u OT creada directamente como
--    'recibido') — descuento inmediato.
create or replace function public.descontar_stock_linea_nueva()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_numero text;
begin
  if new.tipo = 'producto' then
    v_estado := public.estado_de_ot(new.ot_id);
    if v_estado is not null and v_estado <> 'presupuesto' then
      select numero into v_numero from public.ordenes_trabajo where id = new.ot_id;
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, ot_id)
      values (new.producto_id, 'salida', new.cantidad, 'Línea añadida en OT ' || v_numero, new.ot_id);
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_lineas_ot_stock_insert after insert on public.lineas_ot
  for each row execute function public.descontar_stock_linea_nueva();

-- 3) Cambio de cantidad en una línea de producto ya guardada (tipo/producto
--    quedan fijos tras crearse la línea — lo impone la UI — así que este
--    trigger solo maneja el delta de cantidad).
create or replace function public.ajustar_stock_linea_editada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_numero text;
  v_delta  numeric(12,2);
begin
  if new.tipo = 'producto' and new.cantidad <> old.cantidad then
    v_estado := public.estado_de_ot(new.ot_id);
    if v_estado is not null and v_estado <> 'presupuesto' then
      select numero into v_numero from public.ordenes_trabajo where id = new.ot_id;
      v_delta := new.cantidad - old.cantidad;
      if v_delta > 0 then
        insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, ot_id)
        values (new.producto_id, 'salida', v_delta, 'Ajuste de cantidad en OT ' || v_numero, new.ot_id);
      else
        insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, ot_id)
        values (new.producto_id, 'entrada', -v_delta, 'Ajuste de cantidad en OT ' || v_numero, new.ot_id);
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_lineas_ot_stock_update after update on public.lineas_ot
  for each row execute function public.ajustar_stock_linea_editada();

-- 4) Baja de una línea de producto de una OT que ya no está en
--    'presupuesto' — revierte el stock consumido. Si la línea se borra en
--    cascada por borrar la OT entera, la fila padre ya no existe en ese
--    punto de la transacción y estado_de_ot() devuelve null: no se revierte
--    (mismo no-objetivo aceptado que "cancelada no revierte VeriFactu").
create or replace function public.revertir_stock_linea_borrada()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_estado text;
  v_numero text;
begin
  if old.tipo = 'producto' then
    v_estado := public.estado_de_ot(old.ot_id);
    if v_estado is not null and v_estado <> 'presupuesto' then
      select numero into v_numero from public.ordenes_trabajo where id = old.ot_id;
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, ot_id)
      values (old.producto_id, 'entrada', old.cantidad, 'Línea eliminada en OT ' || v_numero, old.ot_id);
    end if;
  end if;
  return old;
end;
$$;
create trigger trg_lineas_ot_stock_delete after delete on public.lineas_ot
  for each row execute function public.revertir_stock_linea_borrada();

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
  tipo_evento text not null check (tipo_evento in ('mantenimiento_preventivo','itv_proxima','vencimiento_seguro','impuesto_proximo','reparacion_lista')),
  created_at  timestamptz not null default now()
);
create index on public.notificaciones_cliente (empresa_id);
create index on public.notificaciones_cliente (cliente_id);
create trigger trg_notificaciones_empresa before insert on public.notificaciones_cliente
  for each row execute function public.set_empresa_id();

-- ============================================================================
--  AGENDA DE CITAS
--  Admite datos libres (contacto_nombre/telefono/vehiculo_descripcion) para
--  clientes o vehículos que aún no están registrados — se completan al
--  convertir la cita en OT. Es la primera tabla del esquema con hora
--  (timestamptz), no solo fecha.
-- ============================================================================
create table public.citas (
  id                   text primary key default gen_random_uuid()::text,
  empresa_id           text not null references public.empresas(id) on delete cascade,
  fecha_hora           timestamptz not null,
  duracion_minutos     int not null default 60,
  cliente_id           text references public.clientes(id) on delete set null,
  vehiculo_id          text references public.vehiculos(id) on delete set null,
  contacto_nombre      text,
  contacto_telefono    text,
  vehiculo_descripcion text,
  motivo               text not null default '',
  tecnico_id           text references public.tecnicos(id) on delete set null,
  estado               text not null default 'pendiente' check (estado in ('pendiente','confirmada','cancelada','convertida')),
  notas                text,
  ot_id                text references public.ordenes_trabajo(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint citas_cliente_o_contacto check (cliente_id is not null or contacto_nombre is not null)
);
create index on public.citas (empresa_id);
create index on public.citas (fecha_hora);
create trigger trg_citas_updated before update on public.citas
  for each row execute function public.set_updated_at();
create trigger trg_citas_empresa before insert on public.citas
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
alter table public.productos              enable row level security;
alter table public.movimientos_stock      enable row level security;
alter table public.alertas                enable row level security;
alter table public.notificaciones_cliente enable row level security;
alter table public.citas                  enable row level security;
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
    es_super_admin()
    or (
      empresa_id = mi_empresa_id()
      and exists (select 1 from public.perfiles p where p.id = auth.uid() and p.rol = 'admin')
    )
  )
  with check (
    rol <> 'super_admin'
    and (es_super_admin() or empresa_id = mi_empresa_id())
  );

-- Tablas raíz de negocio: acceso total al personal autenticado de la misma
-- empresa (o al super admin, aunque en la práctica no las usa).
do $$
declare t text;
begin
  foreach t in array array[
    'vehiculos','clientes','tecnicos','ordenes_trabajo','alertas',
    'notificaciones_cliente','facturas','productos','citas'
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

-- movimientos_stock: libro inmutable — deliberadamente sin política de
-- update/delete (con RLS activo y sin política, esas operaciones quedan
-- denegadas por defecto para cualquier rol; una corrección se hace con un
-- movimiento 'ajuste' nuevo, no editando uno existente).
create policy "movimientos_stock_select" on public.movimientos_stock
  for select to authenticated
  using (es_super_admin() or exists (
    select 1 from public.productos p where p.id = movimientos_stock.producto_id and p.empresa_id = mi_empresa_id()
  ));
create policy "movimientos_stock_insert" on public.movimientos_stock
  for insert to authenticated
  with check (es_super_admin() or exists (
    select 1 from public.productos p where p.id = movimientos_stock.producto_id and p.empresa_id = mi_empresa_id()
  ));

-- Los perfiles ya existentes se crearon antes de que 'inventario' formara
-- parte del default de `modulos` — se los añadimos para que los admins de
-- empresas ya dadas de alta vean la pestaña nueva sin tocar nada a mano.
update public.perfiles
  set modulos = array_append(modulos, 'inventario')
  where not ('inventario' = any(modulos));

-- Mismo backfill para 'citas' (agenda de citas).
update public.perfiles
  set modulos = array_append(modulos, 'citas')
  where not ('citas' = any(modulos));

-- Configuración de plataforma: fila única (branding global — logo de Tibox).
-- Se lee en la pantalla de login (antes de autenticar), por eso el select es
-- público; solo el super admin puede modificarla.
create table public.plataforma_config (
  id text primary key default 'global',
  logo_base64 text,
  constraint plataforma_config_fila_unica check (id = 'global')
);
insert into public.plataforma_config (id, logo_base64) values ('global', null);

alter table public.plataforma_config enable row level security;

create policy "plataforma_config_select_publico" on public.plataforma_config
  for select to anon, authenticated
  using (true);
create policy "plataforma_config_update_super_admin" on public.plataforma_config
  for update to authenticated
  using (es_super_admin())
  with check (es_super_admin());

-- Privilegios de tabla para los roles de Supabase. La RLS sigue aplicando el
-- filtrado por fila para anon/authenticated; service_role saltará la RLS y
-- necesita estos GRANT para las operaciones de servidor (Edge Functions, seed).
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

-- ============================================================================
--  RECORDATORIOS AUTOMÁTICOS POR EMAIL
--  Reutiliza `alertas` (ITV, seguro, impuesto, mantenimiento) como fuente de
--  qué recordar. Antes de esto solo ITV se creaba automáticamente al dar de
--  alta un vehículo (código en App.tsx) y "atender" una alerta la marcaba
--  `atendida` para siempre sin volver a crearla — sin arreglar eso, los
--  recordatorios automáticos no tendrían casi nada de qué avisar y dejarían
--  de funcionar después del primer ciclo. Se resuelve con triggers.
-- ============================================================================

alter table public.alertas
  add column recordatorio_enviado_en timestamptz;

alter table public.notificaciones_cliente
  add column origen text not null default 'manual' check (origen in ('manual','automatico'));

-- Por defecto DESACTIVADO (opt-in): enviar email real tiene coste y
-- reputación, y los tenants de demo/pruebas tienen correos de cliente
-- ficticios — nunca debe dispararse sin que el admin de esa empresa lo
-- active explícitamente.
alter table public.empresas
  add column recordatorios_automaticos_activos boolean not null default false;

-- Plantillas de mensaje personalizables por tipo de alerta (itv/seguro/
-- impuesto/mantenimiento). Claves ausentes o vacías = se usa el texto por
-- defecto (definido en el frontend y en la Edge Function). Admite variables
-- {{cliente}}, {{vehiculo}}, {{empresa}}, {{fecha}}, {{km}}.
alter table public.empresas
  add column plantillas_recordatorios jsonb not null default '{}'::jsonb;

-- Reabre el ciclo de recordatorio cuando una alerta se renueva (cambia su
-- fecha límite o su kilometraje límite) — así el siguiente vencimiento
-- vuelve a poder recordarse.
create or replace function public.reset_recordatorio_alerta()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_limite is distinct from old.fecha_limite
     or new.kilometraje_limite is distinct from old.kilometraje_limite then
    new.recordatorio_enviado_en := null;
  end if;
  return new;
end;
$$;
create trigger trg_alertas_reset_recordatorio before update on public.alertas
  for each row execute function public.reset_recordatorio_alerta();

-- Alta de vehículo: crea itv/seguro/impuesto (si el vehículo trae esa fecha)
-- y una alerta inicial de mantenimiento a kilometraje + 15000 (mismo
-- incremento que ya usaba la renovación manual de mantenimiento).
create or replace function public.crear_alertas_vehiculo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.itv_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'itv',
      'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.',
      'activa', new.itv_vencimiento);
  end if;
  if new.seguro_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'seguro',
      'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.',
      'activa', new.seguro_vencimiento);
  end if;
  if new.impuesto_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'impuesto',
      'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.',
      'activa', new.impuesto_vencimiento);
  end if;
  insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, kilometraje_limite)
  values (new.empresa_id, new.id, 'mantenimiento',
    'Revisión de mantenimiento preventivo recomendada a los ' || (new.kilometraje + 15000) || ' km.',
    'activa', new.kilometraje + 15000);
  return new;
end;
$$;
create trigger trg_vehiculos_crear_alertas after insert on public.vehiculos
  for each row execute function public.crear_alertas_vehiculo();

-- Renovación: cuando cambia una fecha de vencimiento del vehículo (lo que ya
-- hace la UI al "Atender Alerta" de itv/seguro/impuesto), reabre/actualiza
-- la misma fila de alerta en vez de dejarla huérfana en 'atendida'.
create or replace function public.sincronizar_alertas_vencimiento()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_alerta_id text;
begin
  if new.itv_vencimiento is distinct from old.itv_vencimiento and new.itv_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'itv' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'itv',
        'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.',
        'activa', new.itv_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.itv_vencimiento,
        descripcion = 'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  if new.seguro_vencimiento is distinct from old.seguro_vencimiento and new.seguro_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'seguro' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'seguro',
        'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.', 'activa', new.seguro_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.seguro_vencimiento,
        descripcion = 'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  if new.impuesto_vencimiento is distinct from old.impuesto_vencimiento and new.impuesto_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'impuesto' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'impuesto',
        'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.', 'activa', new.impuesto_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.impuesto_vencimiento,
        descripcion = 'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  return new;
end;
$$;
create trigger trg_vehiculos_sync_alertas
  after update of itv_vencimiento, seguro_vencimiento, impuesto_vencimiento on public.vehiculos
  for each row execute function public.sincronizar_alertas_vencimiento();

-- Cron diario que llama a la Edge Function enviar-recordatorios. Los
-- secretos se leen de Vault por nombre (nunca en texto plano en este
-- archivo versionado) — se registran una sola vez contra cada proyecto con
-- vault.create_secret(), ver checklist de despliegue.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'recordatorios-diarios',
  '0 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/enviar-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
