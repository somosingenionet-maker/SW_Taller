-- La vista Lista de Órdenes de Trabajo es la única que de verdad necesita
-- "hojear todo el histórico" (el Tablero solo enseña trabajo activo, ya
-- acotado por naturaleza) — hasta ahora se traían TODAS las OTs de la
-- empresa (con líneas y eventos) solo para filtrar/paginar en el navegador.
-- Esta función busca y pagina en el propio Postgres: solo trae la página
-- visible, con la búsqueda (número, matrícula, vehículo, cliente) resuelta
-- en SQL en vez de en el cliente.
create or replace function public.buscar_ordenes(
  p_termino text default '',
  p_estado text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id text,
  numero text,
  estado text,
  fecha_recepcion date,
  presupuesto_estado text,
  presupuesto_aprobado boolean,
  notificacion_enviada boolean,
  total numeric,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_matricula text,
  cliente_nombre text,
  cliente_apellidos text,
  tareas_total bigint,
  tareas_hechas bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select o.*, v.marca as v_marca, v.modelo as v_modelo, v.matricula as v_matricula,
           c.nombre as c_nombre, c.apellidos as c_apellidos
    from ordenes_trabajo o
    join vehiculos v on v.id = o.vehiculo_id
    join clientes c on c.id = o.cliente_id
    where (p_estado is null or o.estado = p_estado)
      and (
        p_termino = '' or
        o.numero ilike '%' || p_termino || '%' or
        v.matricula ilike '%' || p_termino || '%' or
        (v.marca || ' ' || v.modelo) ilike '%' || p_termino || '%' or
        (c.nombre || ' ' || c.apellidos) ilike '%' || p_termino || '%'
      )
  ),
  tareas as (
    select ot_id,
      count(*) filter (where tipo = 'mano_de_obra') as total,
      count(*) filter (where tipo = 'mano_de_obra' and completado) as hechas
    from lineas_ot
    where ot_id in (select id from base)
    group by ot_id
  )
  select
    b.id, b.numero, b.estado, b.fecha_recepcion,
    b.presupuesto_estado, b.presupuesto_aprobado, b.notificacion_enviada,
    b.total, b.v_marca, b.v_modelo, b.v_matricula, b.c_nombre, b.c_apellidos,
    coalesce(t.total, 0), coalesce(t.hechas, 0),
    count(*) over ()
  from base b
  left join tareas t on t.ot_id = b.id
  order by b.updated_at desc
  limit p_limit offset p_offset;
$$;
