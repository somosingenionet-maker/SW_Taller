-- La subida con upsert:true (CompanySettingsPanel.tsx) fallaba con
-- "new row violates row-level security policy": el servicio de Storage
-- necesita internamente un SELECT sobre storage.objects (para saber si el
-- archivo ya existe y decidir insert vs update) y solo habíamos definido
-- INSERT/UPDATE/DELETE en la migración anterior — faltaba la de lectura.
create policy "logos_empresas_leer_propio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'logos-empresas'
    and (es_super_admin() or (storage.foldername(name))[1] = mi_empresa_id())
  );
