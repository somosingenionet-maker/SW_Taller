-- Recordatorio del día anterior a las citas, a diario (08:00 UTC = 09:00 o 10:00 en Madrid). Va aparte de la
-- migración de reservas para aplicarla DESPUÉS de desplegar la Edge Function `reservas-recordatorios`.
select cron.schedule(
  'recordatorios-citas',
  '0 8 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/reservas-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
