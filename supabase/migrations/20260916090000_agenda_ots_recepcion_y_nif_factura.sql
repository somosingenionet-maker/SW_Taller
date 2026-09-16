-- 1) Al agendar una cita para un cliente nuevo, ahora se crea el cliente de
--    verdad con solo lo esencial (nombre, apellidos, teléfono) — el NIF se
--    completa más tarde, cuando trae el coche o se le factura. Eso hace
--    posible, por primera vez, un cliente sin NIF — y facturas.numero se
--    asigna en el momento de EMITIR, no de crear el borrador, así que hay
--    que evitar que se emita una factura para un cliente sin NIF (lo exige
--    la normativa de facturación electrónica). Antes esto no podía pasar
--    porque clientes.nif_nie_pasaporte siempre se rellenaba al dar de alta
--    desde el CRM.
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
    select nombre, apellidos, nif_nie_pasaporte, correo, telefono, direccion, ciudad, pais
      into v_cliente
      from public.clientes where id = new.cliente_id;

    if v_cliente.nif_nie_pasaporte is null or btrim(v_cliente.nif_nie_pasaporte) = '' then
      raise exception 'El cliente no tiene NIF/NIE/Pasaporte registrado — complétalo en su ficha antes de emitir la factura.';
    end if;

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

-- 2) La Agenda mostraba solo citas programadas — pero lo que de verdad
--    responde "¿qué va a entrar al taller?" es la fecha de recepción de
--    cada OT, venga o no de una cita convertida (una OT creada directo
--    desde Taller, sin pasar por Agenda, antes no aparecía en ningún
--    calendario). No se usa la fecha estimada de entrega: cuánto tarda una
--    reparación no se sabe de antemano, así que esa fecha no es fiable
--    para planificar. Se excluyen 'presupuesto' (aún no ha entrado, esa
--    fecha es solo la de la solicitud) y 'cancelado' (nunca llegó a entrar).
create or replace function public.ordenes_por_rango_recepcion(p_desde date, p_hasta date)
returns table (
  id text,
  numero text,
  estado text,
  fecha_recepcion date,
  vehiculo_marca text,
  vehiculo_modelo text,
  vehiculo_matricula text,
  cliente_nombre text,
  cliente_apellidos text
)
language sql
stable
security invoker
set search_path = public
as $$
  select o.id, o.numero, o.estado, o.fecha_recepcion,
         v.marca, v.modelo, v.matricula,
         c.nombre, c.apellidos
  from ordenes_trabajo o
  join vehiculos v on v.id = o.vehiculo_id
  join clientes c on c.id = o.cliente_id
  where o.estado not in ('presupuesto', 'cancelado')
    and o.fecha_recepcion between p_desde and p_hasta
  order by o.fecha_recepcion;
$$;
