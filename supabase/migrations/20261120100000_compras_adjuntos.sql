-- Compras: adjuntar la factura del proveedor (PDF o foto).
--
--   · Bucket PRIVADO `facturas-proveedor`, ruta «<empresa>/<compra>/<uuid>.<ext>». Leer, subir y borrar exige el módulo
--     «compras» y estar en la carpeta de tu empresa; subir y borrar, además, la suscripción en vigor (leer y exportar
--     siguen funcionando al caducar, como el resto de los datos).
--   · Tabla `compra_adjuntos` = la lista oficial de archivos de cada compra. Solo se escribe por funciones: comprueban que
--     el archivo existe de verdad en el almacenamiento y toman de ahí su tamaño y tipo (no del navegador).
--   · NO se borran solos: la ley obliga a guardar las facturas recibidas durante años. Se van con la empresa (si se elimina)
--     o cuando el taller los quita; una compra anulada conserva los suyos pero no admite más ni se pueden quitar.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas-proveedor', 'facturas-proveedor', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy facturas_proveedor_leer on storage.objects for select to authenticated
  using (bucket_id = 'facturas-proveedor' and (public.es_super_admin()
    or ((storage.foldername(name))[1] = public.mi_empresa_id() and (select public.tiene_modulo('compras')))));
-- Subir: carpeta de tu empresa, compra de tu empresa, módulo y suscripción en vigor.
create policy facturas_proveedor_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas-proveedor' and (public.es_super_admin()
    or ((storage.foldername(name))[1] = public.mi_empresa_id() and (select public.tiene_modulo('compras')) and (select public.suscripcion_activa())
        and exists (select 1 from public.compras c where c.id = (storage.foldername(name))[2] and c.empresa_id = public.mi_empresa_id()))));
create policy facturas_proveedor_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'facturas-proveedor' and (public.es_super_admin()
    or ((storage.foldername(name))[1] = public.mi_empresa_id() and (select public.tiene_modulo('compras')) and (select public.suscripcion_activa()))));

create table public.compra_adjuntos (
  id          text primary key default gen_random_uuid()::text,
  empresa_id  text not null references public.empresas(id) on delete cascade,
  compra_id   text not null references public.compras(id) on delete cascade,
  ruta        text not null unique,
  nombre      text not null check (char_length(btrim(nombre)) between 1 and 200),
  tipo        text not null check (tipo in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamano      bigint not null check (tamano between 1 and 10485760),
  subido_por  uuid,
  created_at  timestamptz not null default now()
);
create index on public.compra_adjuntos (compra_id);
create index on public.compra_adjuntos (empresa_id);

alter table public.compra_adjuntos enable row level security;
create policy compra_adjuntos_leer on public.compra_adjuntos for select to authenticated
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('compras')));
create trigger trg_suscripcion_activa before insert or update or delete on public.compra_adjuntos
  for each statement execute function public.exigir_suscripcion_activa();

/**
 * Da de alta un archivo ya subido al almacenamiento. Devuelve el id del adjunto. Máximo 10 por compra.
 * El tamaño y el tipo se leen del archivo guardado, no de lo que diga el navegador.
 */
create or replace function public.registrar_adjunto_compra(p_compra_id text, p_ruta text, p_nombre text)
returns text
language plpgsql security definer set search_path = public, storage
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  c record;
  o record;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 200);
  v_id text;
begin
  select * into c from public.compras where id = p_compra_id and empresa_id = v_empresa for update;
  if not found then raise exception 'La compra no existe.' using errcode = 'P0001'; end if;
  if c.estado = 'anulada' then raise exception 'Una compra anulada no admite más archivos.' using errcode = 'P0001'; end if;
  if p_ruta is null or p_ruta not like v_empresa || '/' || p_compra_id || '/%' or p_ruta like '%..%' then
    raise exception 'La ruta del archivo no es válida.' using errcode = 'P0001';
  end if;
  if v_nombre = '' then v_nombre := 'factura'; end if;
  if (select count(*) from public.compra_adjuntos where compra_id = p_compra_id) >= 10 then
    raise exception 'Una compra admite como máximo 10 archivos.' using errcode = 'P0001';
  end if;
  select name, metadata into o from storage.objects where bucket_id = 'facturas-proveedor' and name = p_ruta;
  if not found then raise exception 'El archivo no se ha subido: inténtalo de nuevo.' using errcode = 'P0001'; end if;
  begin
    insert into public.compra_adjuntos (empresa_id, compra_id, ruta, nombre, tipo, tamano, subido_por)
    values (v_empresa, p_compra_id, p_ruta, v_nombre, coalesce(o.metadata->>'mimetype', ''), coalesce((o.metadata->>'size')::bigint, 0), auth.uid())
    returning id into v_id;
  exception
    when unique_violation then raise exception 'Ese archivo ya está adjunto.' using errcode = 'P0001';
    when check_violation then raise exception 'El archivo debe ser un PDF o una imagen (JPG, PNG o WebP) de hasta 10 MB.' using errcode = 'P0001';
  end;
  return v_id;
end;
$$;

/** Quita un adjunto de la lista y devuelve su ruta, para que quien llama borre también el archivo. */
create or replace function public.borrar_adjunto_compra(p_id text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_empresa text := public.compras_empresa_o_error();
  a record;
  c record;
begin
  select * into a from public.compra_adjuntos where id = p_id and empresa_id = v_empresa for update;
  if not found then raise exception 'El archivo no existe.' using errcode = 'P0001'; end if;
  select estado into c from public.compras where id = a.compra_id;
  if c.estado = 'anulada' then raise exception 'Los archivos de una compra anulada se conservan.' using errcode = 'P0001'; end if;
  delete from public.compra_adjuntos where id = p_id;
  return a.ruta;
end;
$$;

revoke all on function public.registrar_adjunto_compra(text, text, text) from public, anon;
revoke all on function public.borrar_adjunto_compra(text) from public, anon;
grant execute on function public.registrar_adjunto_compra(text, text, text) to authenticated;
grant execute on function public.borrar_adjunto_compra(text) to authenticated;

-- El espacio ocupado cuenta también estos archivos.
create or replace function public.uso_almacenamiento()
returns table (empresa_id text, bytes bigint, archivos bigint)
language sql
stable
security definer
set search_path = public, storage
as $$
  select (storage.foldername(o.name))[1], coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint, count(*)::bigint
  from storage.objects o
  where o.bucket_id in ('fotos-recepcion', 'inspecciones', 'logos-empresas', 'facturas-proveedor')
    and ((auth.uid() is null or public.es_super_admin()) or (storage.foldername(o.name))[1] = public.mi_empresa_id())
  group by 1
$$;
revoke all on function public.uso_almacenamiento() from public, anon;
grant execute on function public.uso_almacenamiento() to authenticated, service_role;
