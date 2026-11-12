-- El kilometraje que se anota al recibir (o entregar) un vehículo en una orden de trabajo pasa a la
-- ficha del vehículo. Antes había que volver a teclearlo en Vehículos, así que la ficha se quedaba
-- vieja y las alertas de mantenimiento por kilómetros no servían.
--
-- Reglas:
--   · La ficha nunca baja: solo se actualiza si el dato de la orden es MAYOR (un despiste al teclear
--     no borra un kilometraje bueno).
--   · Un presupuesto (kilometraje_entrada = 0) no toca nada.
--   · Se hace en la base de datos y no en la pantalla para que valga venga de donde venga la orden
--     (alta directa, recepción de un presupuesto, orden creada desde una cita).
--
-- SECURITY INVOKER a propósito: la actualización de `vehiculos` pasa por la RLS y por el control de
-- suscripción del propio usuario, igual que si editara la ficha a mano. No concede ningún permiso nuevo.

create or replace function public.km_orden_a_vehiculo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  km int := greatest(coalesce(new.kilometraje_entrada, 0), coalesce(new.kilometraje_salida, 0));
begin
  if km > 0 then
    update public.vehiculos
       set kilometraje = km
     where id = new.vehiculo_id
       and empresa_id = new.empresa_id
       and kilometraje < km;
  end if;
  return new;
end;
$$;

revoke all on function public.km_orden_a_vehiculo() from public, anon, authenticated;

drop trigger if exists trg_ot_km_a_vehiculo on public.ordenes_trabajo;
create trigger trg_ot_km_a_vehiculo
  after insert or update of kilometraje_entrada, kilometraje_salida, vehiculo_id
  on public.ordenes_trabajo
  for each row execute function public.km_orden_a_vehiculo();
