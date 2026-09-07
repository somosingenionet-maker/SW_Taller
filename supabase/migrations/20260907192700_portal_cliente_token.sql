-- Portal del Cliente: enlace personal sin login para que el cliente del
-- taller vea el estado de su vehículo, apruebe presupuestos, y consulte sus
-- vencimientos y facturas. El acceso se valida por este token aleatorio
-- contra la Edge Function portal-cliente (con la service role, sin pasar
-- nunca por RLS directamente) — no hace falta ninguna política nueva.
alter table public.clientes add column portal_token text unique;
comment on column public.clientes.portal_token is
  'Token aleatorio del enlace público del Portal del Cliente. Null hasta que el taller lo genera desde el CRM. Se valida en la Edge Function portal-cliente (service role); nunca se expone vía RLS directa.';
