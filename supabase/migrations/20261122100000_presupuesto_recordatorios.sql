-- Recordatorio automático de presupuestos sin respuesta.
-- Un presupuesto enviado al cliente que sigue sin aceptar ni rechazar recibe, como mucho, dos correos: a los 3 días de
-- enviarlo y a los 7. Solo para talleres con los recordatorios automáticos activados y nunca a clientes con «No avisar».
--
-- Aplicar ANTES de desplegar las funciones `presupuesto-enviar` (v6) y `presupuesto-recordatorios`; el cron va en la migración
-- siguiente, que se aplica DESPUÉS de desplegarlas.

alter table public.ordenes_trabajo
  add column presupuesto_enviado_en timestamptz,
  add column presupuesto_recordatorios smallint not null default 0,
  add column presupuesto_recordado_en timestamptz;

comment on column public.ordenes_trabajo.presupuesto_enviado_en is
  'Cuándo se envió (o se reenvió) el presupuesto al cliente. De aquí cuentan los días para los recordatorios automáticos.';
comment on column public.ordenes_trabajo.presupuesto_recordatorios is
  'Cuántos recordatorios automáticos se han mandado ya por este envío (0, 1 o 2).';

-- Los presupuestos que ya estaban enviados antes de esta función NO reciben avisos retroactivos: se marcan como ya recordados.
update public.ordenes_trabajo
   set presupuesto_enviado_en = coalesce(updated_at, created_at), presupuesto_recordatorios = 2
 where presupuesto_estado = 'enviado';

-- Cada vez que un presupuesto pasa a «enviado» (o se reenvía tras un rechazo) se reinicia la cuenta, lo marque la función o el propio taller a mano.
create or replace function public.ot_marcar_presupuesto_enviado()
returns trigger
language plpgsql
as $$
begin
  if new.presupuesto_estado = 'enviado'
     and (tg_op = 'INSERT'
          or old.presupuesto_estado is distinct from 'enviado'
          or (old.presupuesto_aprobado is not null and new.presupuesto_aprobado is null)) then
    new.presupuesto_enviado_en := now();
    new.presupuesto_recordatorios := 0;
    new.presupuesto_recordado_en := null;
  end if;
  return new;
end;
$$;

create trigger trg_ot_presupuesto_enviado
  before insert or update of presupuesto_estado, presupuesto_aprobado on public.ordenes_trabajo
  for each row execute function public.ot_marcar_presupuesto_enviado();

-- Candidatos a recibir un recordatorio. Solo para el servidor (el cron).
create or replace function public.presupuestos_recordatorio_pendientes()
returns table (
  orden_id text, empresa_id text, cliente_id text, vehiculo_id text, numero text, total numeric,
  enviado_en timestamptz, avisos smallint
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.empresa_id, o.cliente_id, o.vehiculo_id, o.numero, o.total, o.presupuesto_enviado_en, o.presupuesto_recordatorios
    from public.ordenes_trabajo o
    join public.empresas e on e.id = o.empresa_id
   where auth.uid() is null
     and e.activo and e.recordatorios_automaticos_activos and (e.acceso_hasta is null or e.acceso_hasta > now())
     and o.estado in ('presupuesto', 'recibido', 'en_reparacion')
     and o.presupuesto_estado = 'enviado'
     and o.presupuesto_aprobado is null
     and o.aceptacion_presupuesto_en is null
     and o.total > 0
     and o.presupuesto_enviado_en is not null
     and (
          (o.presupuesto_recordatorios = 0 and o.presupuesto_enviado_en <= now() - interval '3 days')
       or (o.presupuesto_recordatorios = 1 and o.presupuesto_enviado_en <= now() - interval '7 days'
           and o.presupuesto_recordado_en <= now() - interval '3 days')
     )
$$;
revoke all on function public.presupuestos_recordatorio_pendientes() from public, anon, authenticated;
grant execute on function public.presupuestos_recordatorio_pendientes() to service_role;
