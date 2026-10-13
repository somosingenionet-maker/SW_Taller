-- Fin real del periodo pagado (la próxima renovación). `acceso_hasta` incluye unos días de margen
-- tras ese fin para no cortar el acceso por un cobro que tarda; mostrárselo al taller como «pagado
-- hasta» sería engañoso. El webhook de Stripe rellena esta columna.
alter table public.empresas add column periodo_fin timestamptz;

-- Empresas que ya pagaron antes de existir esta columna: acceso_hasta menos el margen (3 días).
update public.empresas
   set periodo_fin = acceso_hasta - interval '3 days'
 where stripe_subscription_id is not null and acceso_hasta is not null;

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
    'periodoFin', e.periodo_fin,
    'pruebaHasta', e.prueba_hasta,
    'plan', e.plan_facturacion,
    'cancelarAlFinal', e.cancelar_al_final,
    'tieneCliente', e.stripe_customer_id is not null,
    'puedeEscribir', (e.acceso_hasta is null or e.acceso_hasta > now())
  )
  from public.empresas e
  where e.id = public.mi_empresa_id()
$$;
