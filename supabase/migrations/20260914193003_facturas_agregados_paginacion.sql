-- Rentabilidad y las tarjetas KPI de Facturas necesitan totales agregados
-- (cuántas, cuánto), no las filas completas — hasta ahora se traía TODA la
-- tabla de facturas al navegador solo para sumarla ahí. Estas funciones
-- calculan los agregados en el propio Postgres (rápido y barato sin
-- importar cuántas facturas acumule la empresa con los años), dejando la
-- lista de filas completas para una consulta aparte, paginada de verdad.
--
-- `security invoker` (el valor por defecto, explícito aquí para que quede
-- claro): la función corre con los permisos de quien la llama, así que la
-- política RLS de `facturas` (ya scoped por empresa) se sigue aplicando
-- dentro del `from facturas` de la función exactamente igual que en una
-- consulta directa — no hace falta pasar el empresa_id a mano.

create or replace function public.facturas_resumen(mes_actual text default to_char(current_date, 'YYYY-MM'))
returns table (
  total_facturas bigint,
  facturas_pagadas bigint,
  importe_pendiente numeric,
  importe_cobrado numeric,
  facturas_mes_actual bigint,
  importe_mes_actual numeric,
  facturas_vencidas bigint,
  importe_vencido numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*),
    count(*) filter (where estado = 'pagada'),
    coalesce(sum(total) filter (where estado in ('emitida', 'vencida')), 0),
    coalesce(sum(total) filter (where estado = 'pagada'), 0),
    count(*) filter (where estado in ('emitida', 'pagada') and to_char(fecha, 'YYYY-MM') = mes_actual),
    coalesce(sum(total) filter (where estado in ('emitida', 'pagada') and to_char(fecha, 'YYYY-MM') = mes_actual), 0),
    count(*) filter (where estado = 'vencida'),
    coalesce(sum(total) filter (where estado = 'vencida'), 0)
  from public.facturas;
$$;

create or replace function public.facturas_por_periodo(agrupacion text)
returns table (clave text, cantidad bigint, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    case agrupacion
      when 'año' then to_char(fecha, 'YYYY')
      when 'mes' then to_char(fecha, 'YYYY-MM')
      else to_char(date_trunc('week', fecha)::date, 'YYYY-MM-DD')
    end as clave,
    count(*) as cantidad,
    sum(total) as total
  from public.facturas
  group by 1
  order by 1 desc;
$$;
