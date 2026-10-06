-- VERI*FACTU (modalidad "solo VERI*FACTU"): registros de facturación
-- encadenados y cola de envío a la AEAT.
--
-- Qué añade:
--   1. `registros_facturacion`: un registro de ALTA al emitir una factura y un
--      registro de ANULACIÓN al cancelarla, encadenados por huella dentro de
--      cada empresa (obligado a emitir facturas). Es de solo-añadir: lo único
--      que cambia después de crearse es el estado del envío a la AEAT.
--   2. Estado de envío por registro (pendiente / aceptado / rechazado ...),
--      que consume la Edge Function `verifactu-enviar`.
--   3. Configuración por empresa: envío activo, entorno (pruebas/producción) y
--      número de instalación (único e inmutable, lo exige la AEAT: cada
--      facturación independiente necesita el suyo y no puede repetirse nunca).
--   4. `empresa_certificados_verifactu`: el certificado electrónico de cada
--      taller, CIFRADO por la Edge Function antes de guardarse. Sin políticas
--      RLS: solo el service_role puede leerlo, nunca un cliente.
--   5. La huella pasa a calcularse en `aeat_encadenar_registro()`, común a
--      altas y anulaciones, con la fórmula oficial de la AEAT.
--
-- Corrige además un fallo de multi-taller: `facturas.numero` era UNIQUE a
-- nivel GLOBAL, de modo que dos talleres distintos no podían emitir ambos
-- "FAC-0001". La unicidad correcta es por empresa.

-- 0) Corrección grave: una empresa solo podía emitir UNA factura --------------------
-- `bloquear_cambio_numeracion_factura` impide tocar el contador de numeración
-- cuando la empresa ya tiene facturas emitidas — pero la propia emisión
-- (`emitir_y_proteger_factura`) incrementa ese contador con un UPDATE sobre
-- `empresas`, así que, a partir de la segunda factura, el bloqueo saltaba
-- contra el propio sistema y la emisión fallaba siempre con "No se puede
-- cambiar la numeración de facturas". El bloqueo existe para impedir cambios
-- MANUALES, que llegan con profundidad de trigger 1; los que hace la emisión
-- llegan anidados dentro del trigger de facturas (profundidad 2).
create or replace function public.bloquear_cambio_numeracion_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if pg_trigger_depth() = 1
     and (new.factura_prefijo is distinct from old.factura_prefijo
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

-- 1) Unicidad del número de factura por empresa (no global) -------------------
alter table public.facturas drop constraint if exists facturas_numero_key;
alter table public.facturas
  add constraint facturas_empresa_numero_key unique (empresa_id, numero);

-- 2) Configuración VERI*FACTU por empresa ---------------------------------------
alter table public.empresas
  add column if not exists verifactu_envio_activo boolean not null default false,
  add column if not exists verifactu_entorno text not null default 'pruebas'
    check (verifactu_entorno in ('pruebas', 'produccion')),
  add column if not exists verifactu_numero_instalacion text not null default gen_random_uuid()::text;

-- 3) Certificado del taller (cifrado por la Edge Function) -----------------------
create table if not exists public.empresa_certificados_verifactu (
  empresa_id     text primary key references public.empresas(id) on delete cascade,
  p12_cifrado    text not null,
  clave_cifrada  text not null,
  titular_nif    text,
  titular_nombre text,
  valido_desde   timestamptz,
  valido_hasta   timestamptz,
  subido_en      timestamptz not null default now()
);
alter table public.empresa_certificados_verifactu enable row level security;
-- Sin políticas a propósito: ni siquiera el admin de la empresa puede leer el
-- contenido cifrado. Solo el service_role (Edge Functions).
revoke all on public.empresa_certificados_verifactu from anon, authenticated;
grant all on public.empresa_certificados_verifactu to service_role;

-- Solo metadatos (nunca el contenido) para pintar el estado en la pantalla.
create or replace function public.certificado_verifactu_estado()
returns table (existe boolean, titular_nif text, titular_nombre text,
               valido_desde timestamptz, valido_hasta timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.titular_nif, c.titular_nombre, c.valido_desde, c.valido_hasta
  from public.empresa_certificados_verifactu c
  where c.empresa_id = public.mi_empresa_id()
  union all
  select false, null, null, null, null
  where not exists (
    select 1 from public.empresa_certificados_verifactu c2
    where c2.empresa_id = public.mi_empresa_id()
  );
$$;
grant execute on function public.certificado_verifactu_estado() to authenticated;

-- 4) Registros de facturación ------------------------------------------------------
create table public.registros_facturacion (
  id                        text primary key default gen_random_uuid()::text,
  empresa_id                text not null references public.empresas(id) on delete cascade,
  factura_id                text not null references public.facturas(id) on delete cascade,
  secuencia                 int  not null,
  tipo                      text not null check (tipo in ('alta', 'anulacion')),
  nif_emisor                text not null,
  nombre_razon_emisor       text not null,
  num_serie                 text not null,
  fecha_expedicion          date not null,
  tipo_factura              text,
  cuota_total               numeric(12,2),
  importe_total             numeric(12,2),
  huella                    text not null,
  huella_anterior           text,
  anterior_num_serie        text,
  anterior_fecha_expedicion date,
  fecha_hora_huso           text not null,
  creado_en                 timestamptz not null default now(),
  -- Estado del envío a la AEAT (lo único mutable).
  estado_envio              text not null default 'pendiente'
    check (estado_envio in ('pendiente', 'aceptado', 'aceptado_con_errores', 'rechazado', 'error')),
  intentos                  int not null default 0,
  proximo_intento           timestamptz not null default now(),
  ultimo_intento            timestamptz,
  enviado_en                timestamptz,
  csv_aeat                  text,
  codigo_error              text,
  descripcion_error         text,
  unique (empresa_id, secuencia)
);
create index registros_facturacion_pendientes_idx
  on public.registros_facturacion (empresa_id, secuencia)
  where estado_envio in ('pendiente', 'error');
create index registros_facturacion_factura_idx
  on public.registros_facturacion (factura_id);

alter table public.registros_facturacion enable row level security;
create policy "registros_facturacion_select" on public.registros_facturacion
  for select to authenticated
  using (empresa_id = public.mi_empresa_id() or public.es_super_admin());
grant select on public.registros_facturacion to authenticated;
grant all on public.registros_facturacion to service_role;

-- Solo el estado del envío puede cambiar tras crearse un registro.
create or replace function public.proteger_registro_facturacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.id, new.empresa_id, new.factura_id, new.secuencia, new.tipo, new.nif_emisor,
      new.nombre_razon_emisor, new.num_serie, new.fecha_expedicion, new.tipo_factura,
      new.cuota_total, new.importe_total, new.huella, new.huella_anterior,
      new.anterior_num_serie, new.anterior_fecha_expedicion, new.fecha_hora_huso, new.creado_en)
     is distinct from
     (old.id, old.empresa_id, old.factura_id, old.secuencia, old.tipo, old.nif_emisor,
      old.nombre_razon_emisor, old.num_serie, old.fecha_expedicion, old.tipo_factura,
      old.cuota_total, old.importe_total, old.huella, old.huella_anterior,
      old.anterior_num_serie, old.anterior_fecha_expedicion, old.fecha_hora_huso, old.creado_en)
  then
    raise exception 'Un registro de facturación es inmutable (VERI*FACTU): solo puede cambiar el estado de su envío.';
  end if;
  return new;
end;
$$;
create trigger trg_registros_facturacion_proteger before update on public.registros_facturacion
  for each row execute function public.proteger_registro_facturacion();

-- Protege la configuración VERI*FACTU de la empresa.
create or replace function public.proteger_config_verifactu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verifactu_numero_instalacion is distinct from old.verifactu_numero_instalacion then
    raise exception 'El número de instalación VERI*FACTU no se puede modificar.';
  end if;

  if new.verifactu_envio_activo and not old.verifactu_envio_activo then
    if length(public.aeat_nif_normalizado(new.nif)) <> 9 then
      raise exception 'Para activar el envío a la AEAT la empresa necesita un NIF válido de 9 caracteres (Configuración → Fiscal).';
    end if;
    if not exists (select 1 from public.empresa_certificados_verifactu where empresa_id = new.id) then
      raise exception 'Sube primero el certificado electrónico de la empresa para activar el envío a la AEAT.';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_empresas_proteger_verifactu before update on public.empresas
  for each row execute function public.proteger_config_verifactu();

-- 5) Huella y encadenamiento, comunes a altas y anulaciones ---------------------------
-- Debe llamarse con la fila de la empresa ya bloqueada (`for update`) para que
-- dos emisiones simultáneas no lean la misma huella anterior.
create or replace function public.aeat_encadenar_registro(
  p_empresa_id    text,
  p_tipo          text,
  p_factura_id    text,
  p_nif           text,
  p_nombre_emisor text,
  p_num_serie     text,
  p_fecha         date,
  p_tipo_factura  text,
  p_cuota_total   numeric,
  p_importe_total numeric,
  p_ts            timestamptz
)
returns table (huella text, huella_anterior text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ant     record;
  v_ts      text := public.aeat_fecha_hora_huso(p_ts);
  v_cadena  text;
  v_huella  text;
begin
  select r.huella, r.num_serie, r.fecha_expedicion, r.secuencia
    into v_ant
    from public.registros_facturacion r
   where r.empresa_id = p_empresa_id
   order by r.secuencia desc
   limit 1;

  if p_tipo = 'alta' then
    v_cadena := 'IDEmisorFactura=' || p_nif
      || '&NumSerieFactura=' || btrim(p_num_serie)
      || '&FechaExpedicionFactura=' || to_char(p_fecha, 'DD-MM-YYYY')
      || '&TipoFactura=' || p_tipo_factura
      || '&CuotaTotal=' || p_cuota_total::text
      || '&ImporteTotal=' || p_importe_total::text
      || '&Huella=' || coalesce(v_ant.huella, '')
      || '&FechaHoraHusoGenRegistro=' || v_ts;
  else
    v_cadena := 'IDEmisorFacturaAnulada=' || p_nif
      || '&NumSerieFacturaAnulada=' || btrim(p_num_serie)
      || '&FechaExpedicionFacturaAnulada=' || to_char(p_fecha, 'DD-MM-YYYY')
      || '&Huella=' || coalesce(v_ant.huella, '')
      || '&FechaHoraHusoGenRegistro=' || v_ts;
  end if;

  -- digest() vive en el esquema `extensions` en Supabase.
  v_huella := upper(encode(extensions.digest(convert_to(v_cadena, 'UTF8'), 'sha256'::text), 'hex'));

  insert into public.registros_facturacion (
    empresa_id, factura_id, secuencia, tipo, nif_emisor, nombre_razon_emisor,
    num_serie, fecha_expedicion, tipo_factura, cuota_total, importe_total,
    huella, huella_anterior, anterior_num_serie, anterior_fecha_expedicion, fecha_hora_huso
  ) values (
    p_empresa_id, p_factura_id, coalesce(v_ant.secuencia, 0) + 1, p_tipo, p_nif, p_nombre_emisor,
    btrim(p_num_serie), p_fecha, p_tipo_factura, p_cuota_total, p_importe_total,
    v_huella, v_ant.huella, v_ant.num_serie, v_ant.fecha_expedicion, v_ts
  );

  return query select v_huella, v_ant.huella;
end;
$$;
-- Esta función escribe registros fiscales: jamás debe poder llamarse desde un
-- cliente vía /rpc. Solo la invocan los triggers (que se ejecutan como owner).
revoke all on function public.aeat_encadenar_registro(text, text, text, text, text, text, date, text, numeric, numeric, timestamptz)
  from public, anon, authenticated;

-- 6) Trigger de facturas: ahora crea el registro de alta / anulación ------------------
create or replace function public.emitir_y_proteger_factura()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_nif           text;
  v_nombre        text;
  v_prefijo       text;
  v_siguiente     int;
  v_cliente       record;
  v_reg           record;
begin
  if old.estado = 'borrador' and new.estado = 'emitida' then
    select nombre, apellidos, nif_nie_pasaporte, correo, telefono, direccion, ciudad, pais
      into v_cliente
      from public.clientes where id = new.cliente_id;

    if v_cliente.nif_nie_pasaporte is null or btrim(v_cliente.nif_nie_pasaporte) = '' then
      raise exception 'El cliente no tiene NIF/NIE/Pasaporte registrado — complétalo en su ficha antes de emitir la factura.';
    end if;

    -- `for update` serializa las emisiones de la misma empresa: ni se pisan el
    -- número correlativo, ni se lee una huella "anterior" que otra emisión
    -- está a punto de sobrescribir.
    select nif, factura_prefijo, siguiente_numero_factura,
           coalesce(nullif(btrim(razon_social), ''), nombre)
      into v_nif, v_prefijo, v_siguiente, v_nombre
      from public.empresas where id = new.empresa_id for update;

    v_nif := public.aeat_nif_normalizado(v_nif);
    if length(v_nif) <> 9 then
      raise exception 'El NIF de la empresa emisora no es válido (debe tener 9 caracteres) — corrígelo en Configuración de empresa → Fiscal antes de emitir facturas.';
    end if;

    -- El número real se asigna AQUÍ, al emitir, nunca al crear el borrador:
    -- un borrador descartado no deja huecos en la numeración legal.
    new.numero := v_prefijo || lpad(v_siguiente::text, 4, '0');
    new.fecha_emision_hash := now();

    select * into v_reg from public.aeat_encadenar_registro(
      new.empresa_id, 'alta', new.id, v_nif, v_nombre, new.numero, new.fecha,
      'F1', new.total_iva, new.total, new.fecha_emision_hash);
    new.hash := v_reg.huella;
    new.hash_anterior := v_reg.huella_anterior;
    new.qr_url := 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR'
      || '?nif=' || v_nif
      || '&numserie=' || public.aeat_url_encode(new.numero)
      || '&fecha=' || to_char(new.fecha, 'DD-MM-YYYY')
      || '&importe=' || new.total::text;

    -- Congela los datos del cliente tal como están AHORA.
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

      -- Cancelar una factura ya emitida genera un registro de ANULACIÓN
      -- encadenado, que se enviará a la AEAT igual que el de alta.
      if new.estado = 'cancelada' then
        select nif, coalesce(nullif(btrim(razon_social), ''), nombre)
          into v_nif, v_nombre
          from public.empresas where id = new.empresa_id for update;
        v_nif := public.aeat_nif_normalizado(v_nif);

        select * into v_reg from public.aeat_encadenar_registro(
          new.empresa_id, 'anulacion', new.id, v_nif, v_nombre, new.numero, new.fecha,
          null, null, null, now());

        update public.empresas set ultimo_hash_factura = v_reg.huella where id = new.empresa_id;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- 7) Cadena limpia para las empresas existentes -----------------------------------
-- Las facturas emitidas ANTES de esta migración usaron una huella con otro
-- formato y no tienen registro de facturación. Para que la primera factura
-- nueva de cada empresa arranque la cadena oficial como "PrimerRegistro",
-- se reinicia la cabeza de cadena (la factura ya emitida es inmutable y se
-- conserva tal cual). Hoy solo existe la empresa demo.
update public.empresas e
   set ultimo_hash_factura = null
 where not exists (select 1 from public.registros_facturacion r where r.empresa_id = e.id);
