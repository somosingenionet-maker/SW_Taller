-- Avisos automáticos del cambio de aceite, y retirada de la alerta genérica de «mantenimiento».
--
-- La alerta de mantenimiento avisaba «a los 15.000 km del alta» sin saber qué se le hizo al coche
-- ni cuándo: no servía para traer al cliente de vuelta. La sustituye la alerta de ACEITE, que nace
-- del «próximo cambio» que el mecánico o el taller anotan en la ficha del vehículo.
--
-- Con los recordatorios automáticos activados en la empresa, el cliente recibe hasta tres correos
-- por cada cambio, cada uno una sola vez:
--   1) resumen al entregar la orden (filtros cambiados y cuándo le toca volver),
--   2) recordatorio unos días antes del próximo cambio (o al acercarse a los kilómetros),
--   3) último aviso si pasó una semana de la fecha y no ha vuelto.

-- 1) Fuera la alerta de mantenimiento ------------------------------------------------------
delete from public.alertas where tipo = 'mantenimiento';

alter table public.alertas drop constraint alertas_tipo_check;
alter table public.alertas add constraint alertas_tipo_check check (tipo in ('itv', 'seguro', 'impuesto', 'aceite'));

-- Segundo aviso («último aviso») de una alerta ya vencida. Solo lo usa la de aceite.
alter table public.alertas add column if not exists ultimo_aviso_enviado_en timestamptz;

-- El historial de notificaciones conserva las antiguas de mantenimiento y admite las de aceite.
alter table public.notificaciones_cliente drop constraint notificaciones_cliente_tipo_evento_check;
alter table public.notificaciones_cliente add constraint notificaciones_cliente_tipo_evento_check
  check (tipo_evento in ('mantenimiento_preventivo', 'itv_proxima', 'vencimiento_seguro', 'impuesto_proximo',
                         'reparacion_lista', 'cambio_aceite', 'aceite_vencido', 'aceite_resumen'));

-- El alta de un vehículo ya no crea la alerta de mantenimiento.
create or replace function public.crear_alertas_vehiculo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.itv_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'itv',
      'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.',
      'activa', new.itv_vencimiento);
  end if;
  if new.seguro_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'seguro',
      'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.',
      'activa', new.seguro_vencimiento);
  end if;
  if new.impuesto_vencimiento is not null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
    values (new.empresa_id, new.id, 'impuesto',
      'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.',
      'activa', new.impuesto_vencimiento);
  end if;
  return new;
end;
$$;

-- 2) Alerta de aceite: sigue siempre al «próximo cambio» de la ficha ------------------------
-- Una sola alerta de aceite por vehículo. Si la ficha se queda sin próximo cambio (p. ej. al
-- entregar un cambio sin anotar el siguiente), la alerta desaparece: no hay nada que avisar.
-- SECURITY INVOKER: escribe con los permisos de quien cambia la ficha (el taller, con su RLS, o
-- la Edge Function del mecánico con service role).
create or replace function public.sincronizar_alerta_aceite()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id text;
  v_texto text;
begin
  if tg_op = 'UPDATE'
     and new.aceite_proxima_fecha is not distinct from old.aceite_proxima_fecha
     and new.aceite_proximo_km is not distinct from old.aceite_proximo_km then
    return new;
  end if;

  if new.aceite_proxima_fecha is null and new.aceite_proximo_km is null then
    delete from public.alertas where vehiculo_id = new.id and tipo = 'aceite';
    return new;
  end if;

  v_texto := 'Próximo cambio de aceite'
    || case when new.aceite_proxima_fecha is not null then ' el ' || to_char(new.aceite_proxima_fecha, 'DD/MM/YYYY') else '' end
    || case when new.aceite_proximo_km is not null
         then case when new.aceite_proxima_fecha is not null then ' o' else '' end
              || ' a los ' || replace(to_char(new.aceite_proximo_km, 'FM9G999G999'), ',', '.') || ' km'
         else '' end
    || '.';

  select id into v_id from public.alertas
   where vehiculo_id = new.id and tipo = 'aceite' order by created_at desc limit 1;
  if v_id is null then
    insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite, kilometraje_limite)
    values (new.empresa_id, new.id, 'aceite', v_texto, 'activa', new.aceite_proxima_fecha, new.aceite_proximo_km);
  else
    update public.alertas
       set estado = 'activa', descripcion = v_texto,
           fecha_limite = new.aceite_proxima_fecha, kilometraje_limite = new.aceite_proximo_km
     where id = v_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sincronizar_alerta_aceite() from public, anon, authenticated;

drop trigger if exists trg_vehiculos_alerta_aceite on public.vehiculos;
create trigger trg_vehiculos_alerta_aceite
  after insert or update of aceite_proxima_fecha, aceite_proximo_km on public.vehiculos
  for each row execute function public.sincronizar_alerta_aceite();

-- Al cambiar la fecha o los km de una alerta empieza un ciclo nuevo: se pueden volver a enviar
-- tanto el recordatorio como el último aviso.
create or replace function public.reset_recordatorio_alerta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fecha_limite is distinct from old.fecha_limite
     or new.kilometraje_limite is distinct from old.kilometraje_limite then
    new.recordatorio_enviado_en := null;
    new.ultimo_aviso_enviado_en := null;
  end if;
  return new;
end;
$$;

-- Vehículos que ya tuvieran próximo cambio anotado antes de esta migración.
insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite, kilometraje_limite)
select v.empresa_id, v.id, 'aceite',
       'Próximo cambio de aceite' || coalesce(' el ' || to_char(v.aceite_proxima_fecha, 'DD/MM/YYYY'), '') || '.',
       'activa', v.aceite_proxima_fecha, v.aceite_proximo_km
  from public.vehiculos v
 where (v.aceite_proxima_fecha is not null or v.aceite_proximo_km is not null)
   and not exists (select 1 from public.alertas a where a.vehiculo_id = v.id and a.tipo = 'aceite');

-- 3) Resumen al entregar y «no avisar» ------------------------------------------------------
alter table public.ordenes_trabajo add column if not exists aceite_resumen_enviado_en timestamptz;
comment on column public.ordenes_trabajo.aceite_resumen_enviado_en is
  'Cuándo se envió al cliente el correo de resumen del cambio de aceite de esta orden (lote diario). Nulo = no enviado.';

alter table public.clientes add column if not exists no_avisar boolean not null default false;
comment on column public.clientes.no_avisar is
  'El cliente pidió no recibir avisos: ningún envío automático ni forzado le llega. Se marca en su ficha.';
