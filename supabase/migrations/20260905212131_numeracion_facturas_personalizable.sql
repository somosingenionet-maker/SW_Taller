-- Numeración de facturas personalizable por empresa, y corrige un hueco de
-- numeración: hasta ahora el número correlativo se asignaba al CREAR el
-- borrador, así que un borrador descartado sin emitir dejaba un hueco
-- permanente en la numeración (ilegal: debe ser correlativa y sin saltos).
--
-- A partir de esta migración el número real solo se asigna al EMITIR (el
-- borrador usa un marcador temporal interno, "BORRADOR-<id>", que nunca se
-- expone al usuario). Además, el prefijo y el próximo número son editables
-- por la propia empresa (útil para continuar la numeración de un sistema
-- anterior), pero solo mientras no exista ninguna factura emitida —
-- después queda bloqueado por trg_empresas_bloquear_numeracion.

-- El borrador NO consume numeración real todavía (eso rompería la
-- correlatividad legal si el borrador se descarta sin emitir): se le pone
-- un marcador temporal único, solo para satisfacer NOT NULL/UNIQUE hasta
-- que se emita. El número real (prefijo + contador de la empresa) se
-- asigna en emitir_y_proteger_factura(), en el momento de emitir.
create or replace function public.set_numero_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.numero is null then
    new.numero := 'BORRADOR-' || new.id;
  end if;
  return new;
end;
$$;

-- Reemplaza emitir_y_proteger_factura(): ahora también asigna el número
-- real (prefijo + contador de la empresa) en el momento de emitir, en vez
-- de en la creación del borrador.
create or replace function public.emitir_y_proteger_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_hash_anterior text;
  v_nif           text;
  v_prefijo       text;
  v_siguiente     int;
  v_cadena        text;
begin
  if old.estado = 'borrador' and new.estado = 'emitida' then
    -- `for update` bloquea la fila de la empresa hasta el commit, así dos
    -- emisiones concurrentes de la misma empresa se serializan: ni se
    -- pisan el número correlativo, ni lee ninguna la huella "anterior" que
    -- la otra está a punto de sobrescribir.
    select nif, factura_prefijo, siguiente_numero_factura, ultimo_hash_factura
      into v_nif, v_prefijo, v_siguiente, v_hash_anterior
      from public.empresas where id = new.empresa_id for update;

    -- El número correlativo real se asigna AQUÍ (al emitir), nunca al crear
    -- el borrador — así un borrador descartado nunca deja un hueco en la
    -- numeración (obligatoria por ley que sea correlativa y sin saltos).
    new.numero := v_prefijo || lpad(v_siguiente::text, 4, '0');
    new.fecha_emision_hash := now();
    -- Cadena a verificar contra la especificación oficial antes de producción.
    v_cadena := coalesce(v_hash_anterior, '') || '|' || coalesce(v_nif, '') || '|' || new.numero
      || '|' || new.fecha::text || '|' || new.total::text;
    -- digest() vive en el esquema `extensions` en Supabase (no en `public`),
    -- por eso se cualifica: la función usa search_path = public a propósito
    -- por seguridad y no lo incluye por defecto.
    new.hash := encode(extensions.digest(v_cadena::bytea, 'sha256'::text), 'hex');
    new.hash_anterior := v_hash_anterior;
    new.qr_url := 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
      || '?nif=' || coalesce(v_nif, '')
      || '&numserie=' || new.numero
      || '&fecha=' || to_char(new.fecha, 'DD-MM-YYYY')
      || '&importe=' || new.total::text;

    update public.empresas
      set ultimo_hash_factura = new.hash, siguiente_numero_factura = siguiente_numero_factura + 1
      where id = new.empresa_id;

  elsif old.estado <> 'borrador' then
    if new.numero <> old.numero or new.cliente_id <> old.cliente_id
       or new.vehiculo_id is distinct from old.vehiculo_id
       or new.fecha <> old.fecha or new.fecha_vencimiento <> old.fecha_vencimiento
       or new.subtotal <> old.subtotal or new.iva_pct <> old.iva_pct
       or new.total_iva <> old.total_iva or new.total <> old.total
       or new.notas <> old.notas or new.empresa_id <> old.empresa_id
       or new.hash is distinct from old.hash or new.hash_anterior is distinct from old.hash_anterior
       or new.qr_url is distinct from old.qr_url
    then
      raise exception 'No se puede modificar el contenido de una factura ya emitida (VeriFactu). Usa una factura rectificativa.';
    end if;

    if new.estado <> old.estado then
      if not (
        (old.estado = 'emitida' and new.estado in ('pagada', 'vencida', 'cancelada')) or
        (old.estado = 'vencida' and new.estado in ('pagada', 'cancelada'))
      ) then
        raise exception 'Transición de estado no permitida: % -> %', old.estado, new.estado;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- Prefijo de numeración de facturas, personalizable por empresa (p.ej.
-- para continuar la numeración de un sistema anterior con un prefijo
-- propio). Junto con `siguiente_numero_factura` forma el número real, que
-- se asigna solo al emitir (ver emitir_y_proteger_factura más arriba).
alter table public.empresas
  add column factura_prefijo text not null default 'FAC-';

comment on column public.empresas.factura_prefijo is
  'Prefijo de la numeración de facturas (p.ej. "FAC-"). Editable por la propia empresa solo antes de emitir su primera factura — después queda bloqueado (ver trg_empresas_bloquear_numeracion).';
comment on column public.empresas.siguiente_numero_factura is
  'Próximo número de factura a asignar, AL EMITIR (no al crear el borrador). Editable por la propia empresa solo antes de emitir su primera factura, para poder continuar una numeración previa.';

-- Evita que se cambie el prefijo o el contador de numeración en cuanto la
-- empresa ya tiene alguna factura emitida — así no se puede romper a
-- mitad de camino la correlatividad de una serie ya empezada.
create or replace function public.bloquear_cambio_numeracion_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.factura_prefijo is distinct from old.factura_prefijo
      or new.siguiente_numero_factura is distinct from old.siguiente_numero_factura)
     and exists (
       select 1 from public.facturas f
       where f.empresa_id = new.id and f.estado <> 'borrador'
     )
  then
    raise exception 'No se puede cambiar la numeración de facturas: esta empresa ya tiene facturas emitidas.';
  end if;
  return new;
end;
$$;
create trigger trg_empresas_bloquear_numeracion before update on public.empresas
  for each row execute function public.bloquear_cambio_numeracion_factura();
