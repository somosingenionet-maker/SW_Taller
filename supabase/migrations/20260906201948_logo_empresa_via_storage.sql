-- El logo de empresa se guardaba solo como base64 incrustado en la propia
-- fila (empresas.logo_base64), pensado para renderizar dentro de la app
-- (header, PDF de factura, impresión de OT). Al reutilizar ese mismo base64
-- incrustándolo en el <img> del HTML de los recordatorios por email, Gmail
-- empezó a marcar esos correos como spam — incrustar imágenes en base64
-- dentro de un email es una señal clásica de spam/phishing para los filtros,
-- a diferencia de una <img src="https://..."> a un fichero alojado de verdad.
--
-- Solución: subir el logo también a Supabase Storage (bucket público) y
-- guardar su URL pública en empresas.logo_url. Los emails de
-- enviar-recordatorios usan esta URL en vez del base64; el resto de la app
-- (header, facturas, impresión de OT) sigue usando logo_base64 sin cambios.

insert into storage.buckets (id, name, public)
values ('logos-empresas', 'logos-empresas', true)
on conflict (id) do nothing;

-- Cada empresa solo puede escribir dentro de su propia carpeta
-- (logos-empresas/<empresa_id>/...); la lectura pública no necesita política
-- porque el bucket es público (se sirve por /storage/v1/object/public/...).
create policy "logos_empresas_insertar_propio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'logos-empresas'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id()::text)
  );

create policy "logos_empresas_actualizar_propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'logos-empresas'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id()::text)
  )
  with check (
    bucket_id = 'logos-empresas'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id()::text)
  );

create policy "logos_empresas_borrar_propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos-empresas'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id()::text)
  );

alter table public.empresas add column logo_url text;
comment on column public.empresas.logo_url is
  'URL pública (Supabase Storage, bucket logos-empresas) del logo. Se usa en el <img> de los emails de recordatorio — nunca se incrusta el logo en base64 en el HTML del correo porque dispara filtros de spam. El resto de la app sigue usando logo_base64.';
