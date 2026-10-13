-- Suscripciones: prueba gratuita, plan de pago (Stripe) y modo solo lectura al caducar.
--
-- Modelo: cada empresa tiene `acceso_hasta`, el instante hasta el que puede ESCRIBIR datos.
--   * null  -> sin límite (empresa demo, fundadores o cuentas dadas de alta a mano por el super admin).
--   * futuro -> puede escribir. Lo fija el alta (prueba de N días) y lo prolonga el webhook de Stripe
--              con cada cobro correcto (fin del periodo + unos días de margen).
--   * pasado -> modo SOLO LECTURA: sigue viendo y exportando sus datos (el contrato de encargo promete
--              30 días para exportarlos tras la baja) pero no inserta, edita ni borra.
-- Un impago o una cancelación no necesitan lógica extra: simplemente nadie prolonga `acceso_hasta`.
--
-- La regla se aplica en la base de datos con disparadores de sentencia (no con RLS): un UPDATE o DELETE
-- bloqueado por RLS no da error, solo afecta a 0 filas, y el taller vería «guardado» sin que se guarde.
-- Con el disparador falla con un mensaje claro, y tampoco se puede saltar llamando a la API directamente.

alter table public.empresas
  add column estado_suscripcion text not null default 'activa'
    check (estado_suscripcion in ('prueba', 'activa', 'impago', 'cancelada')),
  add column acceso_hasta timestamptz,
  add column prueba_hasta timestamptz,
  add column plan_facturacion text check (plan_facturacion in ('mensual', 'anual')),
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column cancelar_al_final boolean not null default false,
  add column terminos_aceptados_en timestamptz,
  add column terminos_version text;

-- Los clientes NO pueden escribir estas columnas: empresas solo concede UPDATE sobre una lista
-- explícita de columnas de configuración (migración endurecer_seguridad), y estas no están en ella.

-- Eventos de Stripe ya procesados (el webhook puede recibir el mismo evento más de una vez).
create table public.stripe_eventos (
  id text primary key,
  tipo text not null,
  procesado_en timestamptz not null default now()
);
alter table public.stripe_eventos enable row level security;
revoke all on public.stripe_eventos from anon, authenticated;

-- ¿Puede la empresa del usuario actual escribir datos?
create or replace function public.suscripcion_activa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select e.acceso_hasta is null or e.acceso_hasta > now()
       from public.empresas e
      where e.id = public.mi_empresa_id()),
    false)
$$;
revoke all on function public.suscripcion_activa() from public, anon;
grant execute on function public.suscripcion_activa() to authenticated;

-- Estado para la pantalla de Suscripción (funciona también en modo solo lectura).
create or replace function public.mi_suscripcion()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'estado', case
      when e.acceso_hasta is null then 'sin_limite'
      when e.acceso_hasta <= now() then 'vencida'
      when e.estado_suscripcion = 'prueba' then 'prueba'
      else e.estado_suscripcion
    end,
    'estadoStripe', e.estado_suscripcion,
    'accesoHasta', e.acceso_hasta,
    'pruebaHasta', e.prueba_hasta,
    'plan', e.plan_facturacion,
    'cancelarAlFinal', e.cancelar_al_final,
    'tieneCliente', e.stripe_customer_id is not null,
    'puedeEscribir', (e.acceso_hasta is null or e.acceso_hasta > now())
  )
  from public.empresas e
  where e.id = public.mi_empresa_id()
$$;
revoke all on function public.mi_suscripcion() from public, anon;
grant execute on function public.mi_suscripcion() to authenticated;

-- Escritura bloqueada al caducar, en TODAS las tablas de negocio con RLS (menos las excluidas).
-- Sentencia (no fila) para comprobar una sola vez por operación. Las Edge Functions (service role,
-- sin auth.uid()) y el super admin quedan fuera: el cron de VeriFactu y los portales siguen funcionando.
create or replace function public.exigir_suscripcion_activa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.es_super_admin() or public.suscripcion_activa() then
    return null;
  end if;
  raise exception 'Tu periodo de prueba o tu suscripción ha terminado. Puedes consultar y exportar tus datos, pero no modificarlos. Suscríbete desde el botón «Suscripción».'
    using errcode = 'P0001', hint = 'suscripcion_vencida';
end;
$$;
revoke all on function public.exigir_suscripcion_activa() from public, anon, authenticated;

do $$
declare
  t record;
  excluidas text[] := array['empresas', 'perfiles', 'plataforma_config', 'stripe_eventos', 'rate_limits'];
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and c.relname <> all (excluidas)
  loop
    execute format(
      'create trigger trg_suscripcion_activa before insert or update or delete on public.%I
         for each statement execute function public.exigir_suscripcion_activa()', t.relname);
  end loop;
end $$;

-- Para el webhook de Stripe (solo service role): prolonga el acceso sin acortarlo nunca.
create or replace function public.extender_acceso(p_empresa_id text, p_hasta timestamptz)
returns void
language sql
security definer
set search_path = public
as $$
  update public.empresas
     set acceso_hasta = greatest(coalesce(acceso_hasta, '-infinity'::timestamptz), p_hasta)
   where id = p_empresa_id
$$;
revoke all on function public.extender_acceso(text, timestamptz) from public, anon, authenticated;
