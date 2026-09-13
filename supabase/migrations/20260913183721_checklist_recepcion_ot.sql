-- Checklist de recepción con fotos: al recibir un vehículo en el taller
-- (presupuesto→recibido o alta directa como recepción), se guarda una
-- comprobación fija de estado del vehículo, observaciones libres y fotos —
-- documentación real de en qué estado entró, útil ante una reclamación por
-- un daño que ya existía antes de que el taller lo tocara.
alter table public.ordenes_trabajo
  add column checklist_recepcion jsonb,
  add column checklist_observaciones text,
  add column fotos_recepcion text[] not null default '{}';

comment on column public.ordenes_trabajo.checklist_recepcion is
  'Array [{item, ok}] con la comprobación fija de recepción. Null en OTs creadas antes de esta función.';
comment on column public.ordenes_trabajo.fotos_recepcion is
  'URLs públicas (Storage, bucket fotos-recepcion) de las fotos tomadas al recibir el vehículo.';

-- Bucket público para las fotos de recepción — igual patrón que
-- logos-empresas: cada empresa solo puede escribir en su propia carpeta
-- (fotos-recepcion/<empresa_id>/...), la lectura pública no necesita
-- política porque el bucket es público.
insert into storage.buckets (id, name, public)
values ('fotos-recepcion', 'fotos-recepcion', true)
on conflict (id) do nothing;

create policy "fotos_recepcion_leer_propio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-recepcion'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  );

create policy "fotos_recepcion_insertar_propio"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-recepcion'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  );

create policy "fotos_recepcion_actualizar_propio"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos-recepcion'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  )
  with check (
    bucket_id = 'fotos-recepcion'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  );

create policy "fotos_recepcion_borrar_propio"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-recepcion'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  );
