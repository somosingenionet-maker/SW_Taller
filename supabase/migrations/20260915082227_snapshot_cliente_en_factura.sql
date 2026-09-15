-- Hasta ahora una factura solo guardaba cliente_id — su nombre/NIF/
-- dirección se resolvían en vivo contra la tabla clientes cada vez que se
-- imprimía o descargaba. Eso es incorrecto para una factura ya EMITIDA:
-- si el cliente cambia de dirección, corrige su NIF, o (el caso que
-- motivó esto) se anonimiza tras pedir el borrado de sus datos, todas sus
-- facturas pasadas cambiarían de contenido retroactivamente — justo lo
-- que VeriFactu exige que NUNCA pase con una factura ya emitida.
--
-- A partir de aquí, al emitir se congela una copia de los datos del
-- cliente en la propia factura. Una vez emitida, esta copia es tan
-- inmutable como el resto del contenido (el propio trigger ya lo impedía
-- para hash/qr/importes — se añade aquí). Los borradores siguen sin
-- snapshot: como todavía se pueden editar (incluso cambiar de cliente),
-- se resuelven en vivo hasta el momento de emitir.
alter table public.facturas
  add column cliente_nombre_snapshot text,
  add column cliente_apellidos_snapshot text,
  add column cliente_nif_snapshot text,
  add column cliente_correo_snapshot text,
  add column cliente_telefono_snapshot text,
  add column cliente_direccion_snapshot text,
  add column cliente_ciudad_snapshot text,
  add column cliente_pais_snapshot text;

comment on column public.facturas.cliente_nombre_snapshot is
  'Copia del nombre del cliente en el momento de emitir — null en un borrador (se resuelve en vivo hasta entonces). Una vez emitida, inmutable como el resto del contenido.';

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
  v_cliente       record;
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

    -- Congela los datos del cliente tal como están AHORA — a partir de
    -- aquí ya no importa si el cliente cambia, se anonimiza, o se borra
    -- (siempre que quede bloqueado por FK mientras tenga facturas).
    select nombre, apellidos, nif_nie_pasaporte, correo, telefono, direccion, ciudad, pais
      into v_cliente
      from public.clientes where id = new.cliente_id;
    new.cliente_nombre_snapshot := v_cliente.nombre;
    new.cliente_apellidos_snapshot := v_cliente.apellidos;
    new.cliente_nif_snapshot := v_cliente.nif_nie_pasaporte;
    new.cliente_correo_snapshot := v_cliente.correo;
    new.cliente_telefono_snapshot := v_cliente.telefono;
    new.cliente_direccion_snapshot := v_cliente.direccion;
    new.cliente_ciudad_snapshot := v_cliente.ciudad;
    new.cliente_pais_snapshot := v_cliente.pais;

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
       or new.cliente_nombre_snapshot is distinct from old.cliente_nombre_snapshot
       or new.cliente_apellidos_snapshot is distinct from old.cliente_apellidos_snapshot
       or new.cliente_nif_snapshot is distinct from old.cliente_nif_snapshot
       or new.cliente_correo_snapshot is distinct from old.cliente_correo_snapshot
       or new.cliente_telefono_snapshot is distinct from old.cliente_telefono_snapshot
       or new.cliente_direccion_snapshot is distinct from old.cliente_direccion_snapshot
       or new.cliente_ciudad_snapshot is distinct from old.cliente_ciudad_snapshot
       or new.cliente_pais_snapshot is distinct from old.cliente_pais_snapshot
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
