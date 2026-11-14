-- Inspección digital, fase C: métricas y seguimiento automático por correo.
--   · Métricas para la pestaña Rentabilidad: informes enviados, respondidos, importe propuesto y aprobado,
--     reparto por mecánico y lo que más se rechaza. Solo con el módulo Rentabilidad, como el resto de agregados.
--   · Seguimiento: un correo (una sola vez por informe) a los 5 días si el cliente no ha respondido y otro a los
--     30 días si quedaron reparaciones urgentes rechazadas o puntos en «atención» sin resolver. Solo para talleres
--     con los recordatorios automáticos activados y clientes que no pidieron no recibir avisos.

alter table public.inspecciones
  add column seguimiento_sin_responder_en timestamptz,
  add column seguimiento_pendientes_en    timestamptz,
  add column seguimiento_desactivado      boolean not null default false;

-- Solo el servidor anota que envió un recordatorio; el taller puede desactivar el seguimiento de un informe.
create or replace function public.proteger_inspeccion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cambia_aceptacion boolean :=
       new.aceptacion_nombre      is distinct from old.aceptacion_nombre
    or new.aceptacion_en          is distinct from old.aceptacion_en
    or new.aceptacion_total       is distinct from old.aceptacion_total
    or new.aceptacion_texto       is distinct from old.aceptacion_texto
    or new.aceptacion_ip          is distinct from old.aceptacion_ip
    or new.aceptacion_dispositivo is distinct from old.aceptacion_dispositivo;
  cambia_seguimiento boolean :=
       new.seguimiento_sin_responder_en is distinct from old.seguimiento_sin_responder_en
    or new.seguimiento_pendientes_en    is distinct from old.seguimiento_pendientes_en;
begin
  if cambia_aceptacion then
    if old.aceptacion_en is not null then
      raise exception 'La aceptación del cliente ya está registrada y no se puede modificar.' using errcode = 'P0001';
    end if;
    if auth.uid() is not null and not public.es_super_admin() then
      raise exception 'La aceptación del cliente solo se registra desde su portal.' using errcode = 'P0001';
    end if;
  end if;
  if cambia_seguimiento and auth.uid() is not null and not public.es_super_admin() then
    raise exception 'Los recordatorios automáticos los anota el servidor.' using errcode = 'P0001';
  end if;
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;
  if new.estado = 'respondida' and old.estado is distinct from 'respondida' then
    raise exception 'La respuesta del cliente solo se registra desde su portal.';
  end if;
  if old.estado = 'respondida' and (new.estado is distinct from old.estado or new.respondida_en is distinct from old.respondida_en) then
    raise exception 'El cliente ya respondió a esta inspección: no se puede reabrir.';
  end if;
  if old.estado in ('enviada', 'respondida') and new.nota_general is distinct from old.nota_general then
    raise exception 'La inspección ya se envió al cliente. Reábrela para cambiarla.';
  end if;
  return new;
end;
$$;

-- Métricas -----------------------------------------------------------------------------------------------
-- Informes ENVIADOS en el rango (por fecha de envío). «Propuesto» = reparaciones con precio de los puntos
-- urgentes y en atención; «aprobado» = las que el cliente aprobó.
create or replace function public.inspecciones_metricas(p_desde date, p_hasta date)
returns table (enviadas bigint, respondidas bigint, con_aprobacion bigint, propuesto numeric, aprobado numeric)
language sql
stable
set search_path = public
as $$
  with base as (
    select i.id, i.estado from public.inspecciones i
     where i.empresa_id = public.mi_empresa_id()
       and (select public.tiene_modulo('rentabilidad'))
       and i.estado in ('enviada', 'respondida')
       and i.enviada_en >= p_desde::timestamptz and i.enviada_en < (p_hasta + 1)::timestamptz
  ), pts as (
    select b.id, p.decision, p.precio
      from base b join public.inspeccion_puntos p on p.inspeccion_id = b.id
     where p.estado in ('urgente', 'atencion') and p.precio > 0
  )
  select
    (select count(*) from base),
    (select count(*) from base where estado = 'respondida'),
    (select count(distinct id) from pts where decision = 'aprobado'),
    coalesce((select sum(precio) from pts), 0),
    coalesce((select sum(precio) from pts where decision = 'aprobado'), 0)
$$;
revoke all on function public.inspecciones_metricas(date, date) from public, anon;
grant execute on function public.inspecciones_metricas(date, date) to authenticated;

create or replace function public.inspecciones_metricas_mecanicos(p_desde date, p_hasta date)
returns table (mecanico text, informes bigint, propuesto numeric, aprobado numeric)
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(btrim(i.realizada_por), ''), 'Sin asignar'),
         count(distinct i.id),
         coalesce(sum(p.precio) filter (where p.estado in ('urgente', 'atencion') and p.precio > 0), 0),
         coalesce(sum(p.precio) filter (where p.estado in ('urgente', 'atencion') and p.precio > 0 and p.decision = 'aprobado'), 0)
    from public.inspecciones i
    left join public.inspeccion_puntos p on p.inspeccion_id = i.id
   where i.empresa_id = public.mi_empresa_id()
     and (select public.tiene_modulo('rentabilidad'))
     and i.estado in ('enviada', 'respondida')
     and i.enviada_en >= p_desde::timestamptz and i.enviada_en < (p_hasta + 1)::timestamptz
   group by 1
   order by 4 desc, 2 desc
$$;
revoke all on function public.inspecciones_metricas_mecanicos(date, date) from public, anon;
grant execute on function public.inspecciones_metricas_mecanicos(date, date) to authenticated;

-- Lo que más se rechaza: puntos que el cliente rechazó, de los informes ya respondidos del rango.
create or replace function public.inspecciones_mas_rechazadas(p_desde date, p_hasta date)
returns table (punto text, rechazados bigint, total bigint)
language sql
stable
set search_path = public
as $$
  select p.nombre,
         count(*) filter (where p.decision = 'rechazado'),
         count(*)
    from public.inspecciones i
    join public.inspeccion_puntos p on p.inspeccion_id = i.id
   where i.empresa_id = public.mi_empresa_id()
     and (select public.tiene_modulo('rentabilidad'))
     and i.estado = 'respondida'
     and i.enviada_en >= p_desde::timestamptz and i.enviada_en < (p_hasta + 1)::timestamptz
     and p.estado in ('urgente', 'atencion') and p.precio > 0 and p.decision is not null
   group by p.nombre
  having count(*) filter (where p.decision = 'rechazado') > 0
   order by 2 desc, 3 desc, 1
   limit 5
$$;
revoke all on function public.inspecciones_mas_rechazadas(date, date) from public, anon;
grant execute on function public.inspecciones_mas_rechazadas(date, date) to authenticated;

-- Seguimiento: candidatos a recibir un recordatorio. Solo para el servidor ---------------------------------------
create or replace function public.seguimientos_inspeccion_pendientes()
returns table (
  inspeccion_id text, tipo text, empresa_id text, cliente_id text, vehiculo_id text, orden_id text,
  enviada_en timestamptz, respondida_en timestamptz, puntos jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, 'sin_responder', i.empresa_id, i.cliente_id, i.vehiculo_id, i.orden_id, i.enviada_en, i.respondida_en, '[]'::jsonb
    from public.inspecciones i
    join public.empresas e on e.id = i.empresa_id
   where auth.uid() is null
     and e.activo and e.recordatorios_automaticos_activos and (e.acceso_hasta is null or e.acceso_hasta > now())
     and not i.seguimiento_desactivado
     and i.estado = 'enviada' and i.enviada_en <= now() - interval '5 days'
     and i.seguimiento_sin_responder_en is null
  union all
  select i.id, 'pendientes', i.empresa_id, i.cliente_id, i.vehiculo_id, i.orden_id, i.enviada_en, i.respondida_en,
         (select jsonb_agg(jsonb_build_object('nombre', p.nombre, 'categoria', p.categoria, 'estado', p.estado, 'nota', p.nota) order by p.posicion)
            from public.inspeccion_puntos p
           where p.inspeccion_id = i.id and p.estado in ('urgente', 'atencion') and p.decision is distinct from 'aprobado')
    from public.inspecciones i
    join public.empresas e on e.id = i.empresa_id
   where auth.uid() is null
     and e.activo and e.recordatorios_automaticos_activos and (e.acceso_hasta is null or e.acceso_hasta > now())
     and not i.seguimiento_desactivado
     and i.estado = 'respondida' and i.respondida_en <= now() - interval '30 days'
     and i.seguimiento_pendientes_en is null
     and exists (select 1 from public.inspeccion_puntos p
                  where p.inspeccion_id = i.id and p.estado in ('urgente', 'atencion') and p.decision is distinct from 'aprobado')
$$;
revoke all on function public.seguimientos_inspeccion_pendientes() from public, anon, authenticated;
grant execute on function public.seguimientos_inspeccion_pendientes() to service_role;
