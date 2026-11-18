-- Cuentas por pagar: marcar varias compras como pagadas de una vez (lo habitual: se pagan juntas las facturas de un proveedor).
-- Todo o nada: si alguna ya no está pendiente, no existe o es de otra empresa, no se marca ninguna.
create or replace function public.marcar_pago_compras(p_ids text[], p_fecha_pago date)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  v_ids text[];
  v_n int;
  v_malas text;
begin
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_ids, '{}'::text[])) x where x is not null and x <> '';
  if cardinality(v_ids) = 0 then raise exception 'Elige al menos una compra.' using errcode = 'P0001'; end if;
  if cardinality(v_ids) > 200 then raise exception 'Demasiadas compras de una vez (máximo 200).' using errcode = 'P0001'; end if;
  if p_fecha_pago is null then raise exception 'Indica la fecha de pago.' using errcode = 'P0001'; end if;
  if p_fecha_pago < date '2000-01-01' or p_fecha_pago > current_date + 2 then
    raise exception 'La fecha de pago no es válida (no puede ser futura).' using errcode = 'P0001';
  end if;

  -- Se bloquean las filas para que nadie las cambie mientras se comprueban.
  perform 1 from public.compras where id = any(v_ids) and empresa_id = v_empresa for update;
  select count(*) into v_n from public.compras where id = any(v_ids) and empresa_id = v_empresa and estado = 'pendiente';
  if v_n <> cardinality(v_ids) then
    raise exception 'Alguna de las compras ya no está pendiente o no existe: recarga la lista.' using errcode = 'P0001';
  end if;
  select string_agg(numero, ', ' order by numero) into v_malas
    from public.compras where id = any(v_ids) and empresa_id = v_empresa and fecha > p_fecha_pago;
  if v_malas is not null then
    raise exception 'La fecha de pago no puede ser anterior a la de la factura (%).', v_malas using errcode = 'P0001';
  end if;

  update public.compras set estado = 'pagada', fecha_pago = p_fecha_pago where id = any(v_ids) and empresa_id = v_empresa;
  return v_n;
end;
$$;
revoke all on function public.marcar_pago_compras(text[], date) from public, anon;
grant execute on function public.marcar_pago_compras(text[], date) to authenticated;
