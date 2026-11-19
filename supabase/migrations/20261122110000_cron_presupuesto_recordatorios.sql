-- Recordatorios de presupuestos sin respuesta, a diario (09:00 UTC). Va aparte de la migración anterior para aplicarla DESPUÉS de
-- desplegar la Edge Function `presupuesto-recordatorios`: el cron nunca llama a una función que aún no existe.
select cron.schedule(
  'presupuesto-recordatorios',
  '0 9 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/presupuesto-recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
