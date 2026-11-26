-- Las fechas de ITV, seguro e impuesto del vehículo ahora son opcionales (antes el alta las inventaba).
-- Si se borra una fecha que estaba puesta, también se quita su aviso: si no, se seguiría avisando al cliente
-- de un vencimiento que ya no consta. Poner o cambiar la fecha funciona igual que antes.
create or replace function public.sincronizar_alertas_vencimiento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_alerta_id text;
begin
  if new.itv_vencimiento is null and old.itv_vencimiento is not null then
    delete from public.alertas where vehiculo_id = new.id and tipo = 'itv';
  elsif new.itv_vencimiento is distinct from old.itv_vencimiento and new.itv_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'itv' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'itv',
        'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.',
        'activa', new.itv_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.itv_vencimiento,
        descripcion = 'Inspección Técnica obligatoria (ITV) programada para el vencimiento: ' || new.itv_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  if new.seguro_vencimiento is null and old.seguro_vencimiento is not null then
    delete from public.alertas where vehiculo_id = new.id and tipo = 'seguro';
  elsif new.seguro_vencimiento is distinct from old.seguro_vencimiento and new.seguro_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'seguro' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'seguro',
        'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.', 'activa', new.seguro_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.seguro_vencimiento,
        descripcion = 'Póliza de seguro con vencimiento el ' || new.seguro_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  if new.impuesto_vencimiento is null and old.impuesto_vencimiento is not null then
    delete from public.alertas where vehiculo_id = new.id and tipo = 'impuesto';
  elsif new.impuesto_vencimiento is distinct from old.impuesto_vencimiento and new.impuesto_vencimiento is not null then
    select id into v_alerta_id from public.alertas
      where vehiculo_id = new.id and tipo = 'impuesto' order by created_at desc limit 1;
    if v_alerta_id is null then
      insert into public.alertas (empresa_id, vehiculo_id, tipo, descripcion, estado, fecha_limite)
      values (new.empresa_id, new.id, 'impuesto',
        'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.', 'activa', new.impuesto_vencimiento);
    else
      update public.alertas set estado = 'activa', fecha_limite = new.impuesto_vencimiento,
        descripcion = 'Impuesto de circulación con vencimiento el ' || new.impuesto_vencimiento || '.'
        where id = v_alerta_id;
    end if;
  end if;

  return new;
end;
$function$;
