-- Huella (hash) y URL del QR de factura, ajustados a la especificación
-- técnica oficial de la AEAT para VERI*FACTU:
--   · "Detalle de las especificaciones técnicas para generación de la huella
--     o hash de los registros de facturación" (v0.1.2)
--   · "Detalle de las especificaciones técnicas del código QR de la factura
--     y de la URL del servicio de cotejo" (v0.5.0)
--
-- Qué cambia respecto a la fórmula anterior (que usaba otro formato y por
-- tanto no habría coincidido con el cálculo de la AEAT):
--   1. La cadena de entrada es "Campo=valor&Campo=valor..." con los 8 campos
--      del registro de alta en el orden oficial: IDEmisorFactura,
--      NumSerieFactura, FechaExpedicionFactura (DD-MM-AAAA), TipoFactura,
--      CuotaTotal, ImporteTotal, Huella (la anterior, vacía en la primera) y
--      FechaHoraHusoGenRegistro (ISO 8601 con huso horario).
--   2. El resultado es SHA-256 en hexadecimal y en MAYÚSCULAS (antes, minúsculas).
--   3. El NIF del emisor se normaliza (sin guiones ni espacios, mayúsculas)
--      tanto en la huella como en el QR; la AEAT exige 9 caracteres.
--   4. En la URL del QR, el número de serie va codificado como URL (UTF-8),
--      p. ej. "&" pasa a "%26". Antes iba sin codificar.
--
-- Verificado contra los 3 vectores de prueba publicados en la propia
-- especificación (primer registro, registro encadenado y anulación).
--
-- TipoFactura se fija en F1 (factura completa): hoy todas las facturas de
-- Doonty Motor se emiten a un cliente identificado con NIF. Si algún día se
-- admiten facturas simplificadas (F2) o rectificativas (R1..R5), este valor
-- debe salir de la propia factura.

create or replace function public.aeat_nif_normalizado(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g');
$$;

-- FechaHoraHusoGenRegistro: hora local de España con su desfase, p. ej.
-- 2024-01-01T19:20:30+01:00 (invierno) o ...+02:00 (verano).
create or replace function public.aeat_fecha_hora_huso(p timestamptz)
returns text
language sql
immutable
set search_path = public
as $$
  select to_char(t.l, 'YYYY-MM-DD"T"HH24:MI:SS')
         || case when t.o < 0 then '-' else '+' end
         || lpad((abs(t.o) / 3600)::text, 2, '0')
         || ':'
         || lpad(((abs(t.o) % 3600) / 60)::text, 2, '0')
  from (
    select p at time zone 'Europe/Madrid' as l,
           extract(epoch from ((p at time zone 'Europe/Madrid') - (p at time zone 'UTC')))::int as o
  ) t;
$$;

-- Codificación de URL (UTF-8, %XX en mayúsculas) de todo lo que no sea un
-- carácter no reservado.
create or replace function public.aeat_url_encode(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(
    case
      when c.ch ~ '^[A-Za-z0-9._~-]$' then c.ch
      else (
        select string_agg('%' || upper(lpad(to_hex(get_byte(x.b, i)), 2, '0')), '' order by i)
        from (select convert_to(c.ch, 'UTF8') as b) x,
             generate_series(0, length(x.b) - 1) as i
      )
    end, '' order by c.ord), '')
  from regexp_split_to_table(coalesce(p, ''), '') with ordinality as c(ch, ord);
$$;

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

    -- La AEAT exige un NIF de 9 caracteres para el emisor; sin él ni la
    -- huella ni el QR serían válidos.
    v_nif := public.aeat_nif_normalizado(v_nif);
    if length(v_nif) <> 9 then
      raise exception 'El NIF de la empresa emisora no es válido (debe tener 9 caracteres) — corrígelo en Configuración de empresa → Fiscal antes de emitir facturas.';
    end if;

    -- El número correlativo real se asigna AQUÍ (al emitir), nunca al crear
    -- el borrador — así un borrador descartado nunca deja un hueco en la
    -- numeración (obligatoria por ley que sea correlativa y sin saltos).
    new.numero := v_prefijo || lpad(v_siguiente::text, 4, '0');
    new.fecha_emision_hash := now();

    -- Cadena de la huella según la especificación oficial de la AEAT
    -- (ver cabecera de esta migración).
    v_cadena := 'IDEmisorFactura=' || v_nif
      || '&NumSerieFactura=' || btrim(new.numero)
      || '&FechaExpedicionFactura=' || to_char(new.fecha, 'DD-MM-YYYY')
      || '&TipoFactura=F1'
      || '&CuotaTotal=' || new.total_iva::text
      || '&ImporteTotal=' || new.total::text
      || '&Huella=' || coalesce(v_hash_anterior, '')
      || '&FechaHoraHusoGenRegistro=' || public.aeat_fecha_hora_huso(new.fecha_emision_hash);
    -- digest() vive en el esquema `extensions` en Supabase (no en `public`),
    -- por eso se cualifica: la función usa search_path = public a propósito
    -- por seguridad y no lo incluye por defecto.
    new.hash := upper(encode(extensions.digest(convert_to(v_cadena, 'UTF8'), 'sha256'::text), 'hex'));
    new.hash_anterior := v_hash_anterior;
    new.qr_url := 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
      || '?nif=' || v_nif
      || '&numserie=' || public.aeat_url_encode(new.numero)
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
