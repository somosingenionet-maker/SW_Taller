-- Seguimiento automático de inspecciones, a diario (08:30 UTC). Va aparte de la migración de la fase C para
-- aplicarla DESPUÉS de desplegar la Edge Function `seguimiento-inspecciones`: el cron nunca llama a una función
-- que aún no existe.
select cron.schedule(
  'seguimiento-inspecciones',
  '30 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/seguimiento-inspecciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
