-- Compras y proveedores (tanda 1): proveedores, facturas/gastos recibidos con su IVA, entrada de stock y coste.
--
-- Diseño:
--   · Todo se escribe por funciones (guardar_compra, editar_datos_compra, marcar_pago_compra, anular_compra): así la compra,
--     sus líneas, sus totales y el stock se guardan JUNTOS o no se guarda nada, y los totales los calcula el servidor.
--     Las tablas compras y compra_lineas solo se pueden LEER por API (no hay políticas de escritura).
--   · Como las facturas emitidas, una compra no se reescribe: se puede corregir el número, las fechas y las notas, marcarla
--     pagada o anularla (la anulación devuelve el stock). Para cambiar importes o líneas se anula y se vuelve a registrar.
--   · Módulo propio «compras» (datos fiscales): los administradores lo tienen siempre; el resto, si se lo dan.
--   · Proveedores: datos simples, con políticas normales (también exigen el módulo).

-- 1) Módulo 'compras' --------------------------------------------------------------------------
alter table public.perfiles alter column modulos set default
  array['vehiculos','clientes','taller','alertas','rentabilidad','facturas','inventario','citas','compras'];
-- Quien ya ve Facturas (y los administradores) ve también Compras; el resto, solo si un administrador se lo da.
update public.perfiles set modulos = array_append(modulos, 'compras')
  where not ('compras' = any(modulos)) and (rol = 'admin' or 'facturas' = any(modulos));

-- 2) Proveedores -------------------------------------------------------------------------------
create table public.proveedores (
  id          text primary key default gen_random_uuid()::text,
  empresa_id  text not null references public.empresas(id) on delete cascade,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 120),
  nif         text check (nif is null or char_length(nif) <= 20),
  telefono    text check (telefono is null or char_length(telefono) <= 30),
  correo      text check (correo is null or char_length(correo) <= 254),
  contacto    text check (contacto is null or char_length(contacto) <= 120),
  direccion   text check (direccion is null or char_length(direccion) <= 250),
  dias_pago   int not null default 0 check (dias_pago between 0 and 365),
  notas       text check (notas is null or char_length(notas) <= 1000),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index proveedores_nombre_uq on public.proveedores (empresa_id, lower(btrim(nombre)));
create unique index proveedores_nif_uq on public.proveedores (empresa_id, upper(btrim(nif))) where nif is not null and btrim(nif) <> '';
create index on public.proveedores (empresa_id);
create trigger trg_proveedores_updated before update on public.proveedores for each row execute function public.set_updated_at();
create trigger trg_proveedores_empresa before insert on public.proveedores for each row execute function public.set_empresa_id();

-- 3) Compras y sus líneas ----------------------------------------------------------------------
create table public.compras (
  id                text primary key default gen_random_uuid()::text,
  empresa_id        text not null references public.empresas(id) on delete cascade,
  proveedor_id      text not null references public.proveedores(id) on delete restrict,
  /** Número de la factura (o albarán) del proveedor. */
  numero            text not null check (char_length(btrim(numero)) between 1 and 60),
  fecha             date not null check (fecha >= date '2000-01-01'),
  fecha_vencimiento date,
  estado            text not null default 'pendiente' check (estado in ('pendiente','pagada','anulada')),
  fecha_pago        date,
  base              numeric(12,2) not null default 0,
  iva               numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  notas             text check (notas is null or char_length(notas) <= 1000),
  anulada_en        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint compras_pago_coherente check (estado <> 'pagada' or fecha_pago is not null),
  constraint compras_vencimiento_valido check (fecha_vencimiento is null or fecha_vencimiento >= fecha)
);
-- La misma factura de un proveedor no se puede registrar dos veces (salvo que la anterior esté anulada).
create unique index compras_numero_uq on public.compras (empresa_id, proveedor_id, lower(btrim(numero))) where estado <> 'anulada';
create index on public.compras (empresa_id, fecha);
create index on public.compras (proveedor_id);
create trigger trg_compras_updated before update on public.compras for each row execute function public.set_updated_at();
create trigger trg_compras_empresa before insert on public.compras for each row execute function public.set_empresa_id();

create table public.compra_lineas (
  id              text primary key default gen_random_uuid()::text,
  compra_id       text not null references public.compras(id) on delete cascade,
  posicion        int not null default 0,
  producto_id     text references public.productos(id) on delete set null,
  descripcion     text not null check (char_length(btrim(descripcion)) between 1 and 200),
  cantidad        numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario >= 0),
  iva_pct         numeric(5,2) not null default 21 check (iva_pct between 0 and 100),
  subtotal        numeric(12,2) not null,
  cuota           numeric(12,2) not null
);
create index on public.compra_lineas (compra_id);
create index on public.compra_lineas (producto_id);

-- Cada entrada de stock sabe de qué compra viene.
alter table public.movimientos_stock add column compra_id text references public.compras(id) on delete set null;
create index on public.movimientos_stock (compra_id);

-- 4) Políticas: leer con el módulo; escribir solo por las funciones de abajo ---------------------
alter table public.proveedores enable row level security;
alter table public.compras enable row level security;
alter table public.compra_lineas enable row level security;

create policy proveedores_tenant on public.proveedores for all to authenticated
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('compras')))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('compras')));
create policy compras_leer on public.compras for select to authenticated
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('compras')));
create policy compra_lineas_leer on public.compra_lineas for select to authenticated
  using ((es_super_admin() or exists (select 1 from public.compras c where c.id = compra_lineas.compra_id and c.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('compras')));

-- Bloqueo de escritura al caducar la suscripción, como el resto de tablas de negocio.
create trigger trg_suscripcion_activa before insert or update or delete on public.proveedores for each statement execute function public.exigir_suscripcion_activa();
create trigger trg_suscripcion_activa before insert or update or delete on public.compras for each statement execute function public.exigir_suscripcion_activa();
create trigger trg_suscripcion_activa before insert or update or delete on public.compra_lineas for each statement execute function public.exigir_suscripcion_activa();

-- 5) Funciones ---------------------------------------------------------------------------------

-- Comprobaciones comunes: sesión de usuario, módulo, y devuelve la empresa del usuario.
create or replace function public.compras_empresa_o_error()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare v_empresa text;
begin
  if auth.uid() is null then raise exception 'Hace falta iniciar sesión.' using errcode = 'P0001'; end if;
  if not public.tiene_modulo('compras') then raise exception 'No tienes acceso a Compras.' using errcode = 'P0001'; end if;
  v_empresa := public.mi_empresa_id();
  if v_empresa is null then raise exception 'No se ha podido identificar tu empresa.' using errcode = 'P0001'; end if;
  return v_empresa;
end;
$$;
revoke all on function public.compras_empresa_o_error() from public, anon, authenticated;

/**
 * Registra una compra con sus líneas. p_lineas: [{producto_id?, descripcion, cantidad, precio_unitario, iva_pct}].
 * Las líneas con producto_id suman al stock del producto (entrada) y, si p_actualizar_coste, fijan su coste al precio pagado.
 * Los importes los calcula el servidor: subtotal = redondeo(cantidad × precio), cuota = redondeo(subtotal × IVA / 100) por línea.
 */
create or replace function public.guardar_compra(
  p_proveedor_id text, p_numero text, p_fecha date, p_vencimiento date, p_notas text,
  p_pagada boolean, p_fecha_pago date, p_actualizar_coste boolean, p_lineas jsonb
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  v_prov record;
  v_id text;
  l jsonb;
  v_pos int := 0;
  v_prod_id text; v_prod_nombre text;
  v_desc text; v_cant numeric; v_precio numeric; v_iva numeric; v_sub numeric; v_cuota numeric;
  v_base numeric := 0; v_total_iva numeric := 0;
  v_numero text := btrim(coalesce(p_numero, ''));
begin
  select * into v_prov from public.proveedores where id = p_proveedor_id and empresa_id = v_empresa;
  if not found then raise exception 'El proveedor no existe.' using errcode = 'P0001'; end if;
  if not v_prov.activo then raise exception 'El proveedor está desactivado: actívalo para registrarle compras.' using errcode = 'P0001'; end if;
  if v_numero = '' then raise exception 'Escribe el número de la factura del proveedor.' using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha < date '2000-01-01' or p_fecha > current_date + 2 then
    raise exception 'La fecha de la factura no es válida (no puede ser futura).' using errcode = 'P0001';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'El vencimiento no puede ser anterior a la fecha de la factura.' using errcode = 'P0001';
  end if;
  if coalesce(p_pagada, false) and p_fecha_pago is not null and p_fecha_pago < p_fecha then
    raise exception 'La fecha de pago no puede ser anterior a la de la factura.' using errcode = 'P0001';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Añade al menos una línea.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_lineas) > 100 then raise exception 'Demasiadas líneas (máximo 100).' using errcode = 'P0001'; end if;

  begin
    insert into public.compras (empresa_id, proveedor_id, numero, fecha, fecha_vencimiento, estado, fecha_pago, notas)
    values (v_empresa, p_proveedor_id, v_numero, p_fecha, p_vencimiento,
            case when coalesce(p_pagada, false) then 'pagada' else 'pendiente' end,
            case when coalesce(p_pagada, false) then coalesce(p_fecha_pago, p_fecha) end,
            nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya has registrado la factura % de %.', v_numero, v_prov.nombre using errcode = 'P0001';
  end;

  for l in select * from jsonb_array_elements(p_lineas) loop
    v_cant := (l->>'cantidad')::numeric;
    v_precio := (l->>'precio_unitario')::numeric;
    v_iva := coalesce((l->>'iva_pct')::numeric, 21);
    v_desc := btrim(coalesce(l->>'descripcion', ''));
    if v_cant is null or v_cant <= 0 then raise exception 'La cantidad de cada línea debe ser mayor que cero.' using errcode = 'P0001'; end if;
    if v_precio is null or v_precio < 0 then raise exception 'El precio de cada línea no puede ser negativo.' using errcode = 'P0001'; end if;
    if v_iva < 0 or v_iva > 100 then raise exception 'El IVA de cada línea debe estar entre 0 y 100.' using errcode = 'P0001'; end if;
    v_prod_id := null;
    if nullif(l->>'producto_id', '') is not null then
      select id, nombre into v_prod_id, v_prod_nombre from public.productos where id = l->>'producto_id' and empresa_id = v_empresa;
      if not found then raise exception 'Uno de los productos no existe.' using errcode = 'P0001'; end if;
      if v_desc = '' then v_desc := v_prod_nombre; end if;
    end if;
    if v_desc = '' then raise exception 'Cada línea necesita una descripción.' using errcode = 'P0001'; end if;
    v_sub := round(v_cant * v_precio, 2);
    v_cuota := round(v_sub * v_iva / 100, 2);
    insert into public.compra_lineas (compra_id, posicion, producto_id, descripcion, cantidad, precio_unitario, iva_pct, subtotal, cuota)
    values (v_id, v_pos, v_prod_id, left(v_desc, 200), v_cant, v_precio, v_iva, v_sub, v_cuota);
    v_pos := v_pos + 1;
    v_base := v_base + v_sub;
    v_total_iva := v_total_iva + v_cuota;
    if v_prod_id is not null then
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, compra_id)
      values (v_prod_id, 'entrada', v_cant, left('Compra ' || v_numero || ' · ' || v_prov.nombre, 200), v_id);
      if coalesce(p_actualizar_coste, false) then
        update public.productos set costo = v_precio where id = v_prod_id;
      end if;
    end if;
  end loop;

  update public.compras set base = v_base, iva = v_total_iva, total = v_base + v_total_iva where id = v_id;
  return v_id;
end;
$$;

/** Corrige los datos que no mueven importes ni stock: número, fecha, vencimiento y notas. */
create or replace function public.editar_datos_compra(p_id text, p_numero text, p_fecha date, p_vencimiento date, p_notas text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  c record;
  v_numero text := btrim(coalesce(p_numero, ''));
begin
  select * into c from public.compras where id = p_id and empresa_id = v_empresa for update;
  if not found then raise exception 'La compra no existe.' using errcode = 'P0001'; end if;
  if c.estado = 'anulada' then raise exception 'Una compra anulada no se puede modificar.' using errcode = 'P0001'; end if;
  if v_numero = '' then raise exception 'Escribe el número de la factura del proveedor.' using errcode = 'P0001'; end if;
  if p_fecha is null or p_fecha < date '2000-01-01' or p_fecha > current_date + 2 then
    raise exception 'La fecha de la factura no es válida (no puede ser futura).' using errcode = 'P0001';
  end if;
  if p_vencimiento is not null and p_vencimiento < p_fecha then
    raise exception 'El vencimiento no puede ser anterior a la fecha de la factura.' using errcode = 'P0001';
  end if;
  if c.fecha_pago is not null and c.fecha_pago < p_fecha then
    raise exception 'La fecha de pago es anterior a la nueva fecha de la factura: cámbiala primero.' using errcode = 'P0001';
  end if;
  begin
    update public.compras set numero = v_numero, fecha = p_fecha, fecha_vencimiento = p_vencimiento, notas = nullif(btrim(coalesce(p_notas, '')), '')
     where id = p_id;
  exception when unique_violation then
    raise exception 'Ya has registrado la factura % de este proveedor.', v_numero using errcode = 'P0001';
  end;
end;
$$;

/** Marca una compra como pagada en la fecha dada, o como pendiente si la fecha es nula. */
create or replace function public.marcar_pago_compra(p_id text, p_fecha_pago date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  c record;
begin
  select * into c from public.compras where id = p_id and empresa_id = v_empresa for update;
  if not found then raise exception 'La compra no existe.' using errcode = 'P0001'; end if;
  if c.estado = 'anulada' then raise exception 'Una compra anulada no se puede modificar.' using errcode = 'P0001'; end if;
  if p_fecha_pago is not null and p_fecha_pago < c.fecha then
    raise exception 'La fecha de pago no puede ser anterior a la de la factura.' using errcode = 'P0001';
  end if;
  update public.compras set estado = case when p_fecha_pago is null then 'pendiente' else 'pagada' end, fecha_pago = p_fecha_pago where id = p_id;
end;
$$;

/** Anula una compra: devuelve el stock que entró y deja la factura fuera de los totales. No toca los costes de los productos. */
create or replace function public.anular_compra(p_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  c record;
  l record;
  v_prov text;
begin
  select * into c from public.compras where id = p_id and empresa_id = v_empresa for update;
  if not found then raise exception 'La compra no existe.' using errcode = 'P0001'; end if;
  if c.estado = 'anulada' then raise exception 'Esta compra ya está anulada.' using errcode = 'P0001'; end if;
  select nombre into v_prov from public.proveedores where id = c.proveedor_id;
  for l in select producto_id, sum(cantidad) as cantidad from public.compra_lineas where compra_id = p_id and producto_id is not null group by producto_id loop
    insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, compra_id)
    values (l.producto_id, 'salida', l.cantidad, left('Anulación de la compra ' || c.numero || ' · ' || coalesce(v_prov, ''), 200), p_id);
  end loop;
  update public.compras set estado = 'anulada', anulada_en = now() where id = p_id;
end;
$$;

revoke all on function public.guardar_compra(text, text, date, date, text, boolean, date, boolean, jsonb) from public, anon;
revoke all on function public.editar_datos_compra(text, text, date, date, text) from public, anon;
revoke all on function public.marcar_pago_compra(text, date) from public, anon;
revoke all on function public.anular_compra(text) from public, anon;
grant execute on function public.guardar_compra(text, text, date, date, text, boolean, date, boolean, jsonb) to authenticated;
grant execute on function public.editar_datos_compra(text, text, date, date, text) to authenticated;
grant execute on function public.marcar_pago_compra(text, date) to authenticated;
grant execute on function public.anular_compra(text) to authenticated;
