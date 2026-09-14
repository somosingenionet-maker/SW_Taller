-- Rentabilidad (AnalyticsTab) calculaba todo en el navegador a partir del
-- array completo de OTs — igual problema de fondo que ya se resolvió en
-- Facturas: el coste crece con el histórico acumulado en vez de mantenerse
-- constante. Estas 4 funciones mueven cada agregado a Postgres.

-- Totales de un período (se llama dos veces desde el cliente: período
-- actual y período anterior, para calcular el delta).
create or replace function public.rentabilidad_periodo(p_start date, p_end date)
returns table (
  facturacion numeric,
  entregadas bigint,
  tiempo_medio_dias numeric,
  mano_obra_total numeric,
  mano_obra_costo numeric,
  producto_total numeric,
  producto_costo numeric,
  canceladas bigint,
  ots_total bigint,
  presupuestos_total bigint,
  presupuestos_convertidos bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with periodo as (
    select * from ordenes_trabajo
    where fecha_recepcion >= p_start and fecha_recepcion <= p_end
  ),
  entregadas_cte as (
    select * from periodo where estado = 'entregado'
  ),
  lineas_entregadas as (
    select l.tipo, l.subtotal, coalesce(l.costo_unitario, 0) * l.cantidad as costo
    from lineas_ot l
    join entregadas_cte e on e.id = l.ot_id
  )
  select
    coalesce((select sum(total) from entregadas_cte), 0),
    (select count(*) from entregadas_cte),
    (select avg(fecha_entrega - fecha_recepcion) from entregadas_cte where fecha_entrega is not null),
    coalesce((select sum(subtotal) from lineas_entregadas where tipo = 'mano_de_obra'), 0),
    coalesce((select sum(costo) from lineas_entregadas where tipo = 'mano_de_obra'), 0),
    coalesce((select sum(subtotal) from lineas_entregadas where tipo = 'producto'), 0),
    coalesce((select sum(costo) from lineas_entregadas where tipo = 'producto'), 0),
    (select count(*) from periodo where estado = 'cancelado'),
    (select count(*) from periodo),
    (select count(*) from periodo where estado <> 'cancelado'
       and (estado = 'presupuesto' or presupuesto_aprobado or presupuesto_estado = 'enviado')),
    (select count(*) from periodo where presupuesto_aprobado);
$$;

-- Recuento por estado, siempre sobre todo el histórico (el panel "Estado
-- actual del taller" no se filtra por período) — pero es un simple
-- group by, barato sin importar cuántas OTs acumule la empresa.
create or replace function public.rentabilidad_estado_actual()
returns table (estado text, cantidad bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select estado, count(*) from ordenes_trabajo group by estado;
$$;

create or replace function public.rentabilidad_tecnicos(p_start date, p_end date)
returns table (nombre text, ots bigint, facturado numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select tecnico_asignado, count(*), sum(total)
  from ordenes_trabajo
  where estado = 'entregado' and tecnico_asignado is not null
    and fecha_recepcion >= p_start and fecha_recepcion <= p_end
  group by tecnico_asignado
  order by sum(total) desc;
$$;

create or replace function public.rentabilidad_top_clientes(p_limit int default 5)
returns table (cliente_id text, visitas bigint, facturado numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select cliente_id, count(*), sum(total)
  from ordenes_trabajo
  where estado = 'entregado'
  group by cliente_id
  order by sum(total) desc
  limit p_limit;
$$;
