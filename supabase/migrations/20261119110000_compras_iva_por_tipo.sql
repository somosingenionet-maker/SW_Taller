-- Compras: el IVA se calcula como en una factura (sobre la base de cada tipo, no línea a línea) y las cantidades y precios se
-- redondean a 2 decimales antes de calcular. Se quita la columna `cuota` de las líneas: la cuota de cada tipo se obtiene de su base.
alter table public.compra_lineas drop column cuota;

/**
 * Registra una compra con sus líneas. p_lineas: [{producto_id?, descripcion, cantidad, precio_unitario, iva_pct}].
 * Las líneas con producto_id suman al stock del producto (entrada) y, si p_actualizar_coste, fijan su coste al precio pagado.
 * Los importes los calcula el servidor, como en una factura: cada línea = redondeo(cantidad × precio) y el IVA se calcula sobre la
 * BASE de cada tipo (suma de las líneas con ese IVA), no línea a línea; así el total coincide con el de la factura del proveedor.
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
  v_desc text; v_cant numeric; v_precio numeric; v_iva numeric; v_sub numeric;
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
    -- Cantidad y precio a 2 decimales (como se guardan): el importe se calcula con lo que queda guardado.
    v_cant := round((l->>'cantidad')::numeric, 2);
    v_precio := round((l->>'precio_unitario')::numeric, 2);
    v_iva := round(coalesce((l->>'iva_pct')::numeric, 21), 2);
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
    insert into public.compra_lineas (compra_id, posicion, producto_id, descripcion, cantidad, precio_unitario, iva_pct, subtotal)
    values (v_id, v_pos, v_prod_id, left(v_desc, 200), v_cant, v_precio, v_iva, v_sub);
    v_pos := v_pos + 1;
    v_base := v_base + v_sub;
    if v_prod_id is not null then
      insert into public.movimientos_stock (producto_id, tipo, cantidad, motivo, compra_id)
      values (v_prod_id, 'entrada', v_cant, left('Compra ' || v_numero || ' · ' || v_prov.nombre, 200), v_id);
      if coalesce(p_actualizar_coste, false) then
        update public.productos set costo = v_precio where id = v_prod_id;
      end if;
    end if;
  end loop;

  -- IVA por tipo sobre la base de cada tipo.
  select coalesce(sum(round(g.base_tipo * g.iva_pct / 100, 2)), 0) into v_total_iva
    from (select iva_pct, sum(subtotal) as base_tipo from public.compra_lineas where compra_id = v_id group by iva_pct) g;
  update public.compras set base = v_base, iva = v_total_iva, total = v_base + v_total_iva where id = v_id;
  return v_id;
end;
$$;

revoke all on function public.guardar_compra(text, text, date, date, text, boolean, date, boolean, jsonb) from public, anon;
grant execute on function public.guardar_compra(text, text, date, date, text, boolean, date, boolean, jsonb) to authenticated;
