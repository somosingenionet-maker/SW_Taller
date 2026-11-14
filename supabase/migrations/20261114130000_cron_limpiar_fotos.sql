-- Borrado diario de fotos caducadas (04:00 UTC). Va aparte de la migración de la inspección digital para
-- aplicarla DESPUÉS de desplegar la Edge Function `limpiar-fotos`: así el cron nunca llama a una función
-- que aún no existe.
select cron.schedule(
  'limpieza-fotos-caducadas',
  '0 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/limpiar-fotos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
