-- Red de seguridad del envío a la AEAT: cada 5 minutos se llama a la Edge Function
-- verifactu-enviar, que reintenta lo que haya quedado pendiente o con error (la
-- app ya la dispara en el momento de emitir/cancelar una factura, pero esa
-- llamada puede perderse si la persona cierra el navegador).
--
-- Mismo mecanismo que los recordatorios diarios: los secretos se leen de Vault por
-- nombre, nunca en texto plano en este archivo versionado. Si no hay ninguna empresa
-- con el envío activo la función responde de inmediato sin hacer nada.
--
-- Aplicar DESPUÉS de desplegar la función verifactu-enviar.
select cron.schedule(
  'verifactu-envio',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/verifactu-enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
