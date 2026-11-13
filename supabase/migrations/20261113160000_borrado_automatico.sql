-- Borrado automático de cuentas abandonadas (pruebas que nadie convirtió y bajas), con avisos.
--
-- Política (decidida el 2026-11-13): la cuenta que lleva MÁS DE 90 DÍAS sin acceso (pasado el fin de
-- la prueba o de la suscripción, `acceso_hasta`) se elimina por completo, solo si:
--   · no tiene ninguna factura emitida ni registro de facturación (las facturas se conservan por
--     ley y es el taller quien debe exportarlas: esas cuentas NO se borran solas, quedan «retenidas»
--     a la espera de decisión manual);
--   · su suscripción no figura como activa (si figura activa pero lleva 90 días sin renovar acceso,
--     algo no cuadra con Stripe: se deja para revisión manual);
--   · no está suspendida a mano ni es una cuenta sin límite (acceso_hasta nulo: la demo).
-- Antes se avisa por correo a los administradores del taller: un primer aviso (con al menos 14 días
-- de margen) y un último aviso 7 días antes. Sin aviso enviado con éxito NUNCA se borra.
--
-- Esta migración solo prepara los datos: la lógica (avisos, borrado de archivos y de la empresa)
-- vive en la Edge Function `limpiar-empresas`, que la dispara un cron diario.

alter table public.empresas
  add column if not exists borrado_aviso1_en   timestamptz,
  add column if not exists borrado_aviso2_en   timestamptz,
  add column if not exists borrado_previsto_en timestamptz;
comment on column public.empresas.borrado_previsto_en is
  'Fecha a partir de la cual se borrará la cuenta si sigue abandonada (se fija al enviar el primer aviso). Solo la escribe la función limpiar-empresas.';

-- Interruptor general (lo cambia el super administrador desde su panel). Activado por defecto.
alter table public.plataforma_config
  add column if not exists borrado_automatico_activo boolean not null default true;
grant update (borrado_automatico_activo) on public.plataforma_config to authenticated;

-- Constancia de lo que se ha borrado (sin datos personales: id, nombre del taller y recuentos), para
-- poder confirmar por escrito el borrado si un cliente lo pide (contrato de encargo, apartado 4).
create table if not exists public.empresas_borradas (
  id               text not null,
  nombre           text not null,
  creada_en        timestamptz,
  acceso_hasta     timestamptz,
  estado           text,
  aviso1_en        timestamptz,
  aviso2_en        timestamptz,
  usuarios         int not null default 0,
  clientes         int not null default 0,
  vehiculos        int not null default 0,
  ordenes          int not null default 0,
  archivos         int not null default 0,
  motivo           text not null default 'abandonada',
  borrada_en       timestamptz not null default now()
);
alter table public.empresas_borradas enable row level security;
revoke all on public.empresas_borradas from anon, authenticated;
grant select on public.empresas_borradas to authenticated;
drop policy if exists empresas_borradas_select on public.empresas_borradas;
create policy empresas_borradas_select on public.empresas_borradas for select to authenticated using (public.es_super_admin());

-- Cuentas cuyo acceso ya terminó, con todo lo necesario para decidir qué hacer con cada una.
-- La usan la Edge Function (service role: auth.uid() nulo) y el panel del super administrador.
create or replace function public.cuentas_terminadas()
returns table (
  empresa_id text, nombre text, creada_en timestamptz, acceso_hasta timestamptz, estado text,
  fin_conservacion timestamptz, retencion text,
  aviso1_en timestamptz, aviso2_en timestamptz, borrado_previsto_en timestamptz,
  correos_aviso text[], usuarios bigint, clientes bigint, vehiculos bigint, ordenes bigint, facturas_emitidas bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.nombre, e.created_at, e.acceso_hasta, e.estado_suscripcion,
    e.acceso_hasta + interval '90 days',
    case
      when e.estado_suscripcion = 'activa' then 'suscripcion_activa'
      when (select count(*) from public.facturas f where f.empresa_id = e.id and f.estado <> 'borrador') > 0
        or exists (select 1 from public.registros_facturacion r where r.empresa_id = e.id) then 'facturas_emitidas'
      else null
    end,
    e.borrado_aviso1_en, e.borrado_aviso2_en, e.borrado_previsto_en,
    (select array_agg(p.email order by p.email) from public.perfiles p
       where p.empresa_id = e.id and p.rol = 'admin' and p.activo and p.email is not null and p.email <> ''),
    (select count(*) from public.perfiles p where p.empresa_id = e.id),
    (select count(*) from public.clientes c where c.empresa_id = e.id),
    (select count(*) from public.vehiculos v where v.empresa_id = e.id),
    (select count(*) from public.ordenes_trabajo o where o.empresa_id = e.id),
    (select count(*) from public.facturas f where f.empresa_id = e.id and f.estado <> 'borrador')
  from public.empresas e
  where e.activo
    and e.acceso_hasta is not null
    and e.acceso_hasta < now()
    -- El servidor (service role) lo ve todo; un usuario, solo si es super administrador.
    and (auth.uid() is null or public.es_super_admin())
  order by e.acceso_hasta
$$;
revoke all on function public.cuentas_terminadas() from public, anon;
grant execute on function public.cuentas_terminadas() to authenticated, service_role;

-- Cron diario (03:15 UTC): llama a la función con el mismo secreto que los demás.
select cron.schedule(
  'limpieza-empresas-abandonadas',
  '15 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/limpiar-empresas',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
