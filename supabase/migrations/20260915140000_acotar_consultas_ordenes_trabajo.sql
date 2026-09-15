-- Acompaña el reparto de App.tsx: hasta ahora se cargaba TODO el histórico
-- de ordenes_trabajo (con líneas y eventos) en cada login y se repartía a 5
-- pestañas — crecía sin límite con la antigüedad del taller. Se sustituye
-- por consultas acotadas por consumidor; estas dos funciones sirven a los
-- dos casos que dependían de tener el array completo en memoria, no de sus
-- filas:

-- 1) La numeración de OT era `'OT-' + año + '-' + (ordenes.length + 1)` en
--    el cliente — funcionaba solo porque `ordenes` tenía SIEMPRE el histórico
--    completo. En cuanto un consumidor pase a tener una versión acotada,
--    `.length` deja de ser el conteo real y puede generar un número que ya
--    existe (ordenes_trabajo.numero es unique: la creación de la OT
--    fallaría). Se mueve el conteo al servidor, con el mismo formato.
create or replace function public.siguiente_numero_ot()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  select count(*) into v_count from ordenes_trabajo;
  return 'OT-' || extract(year from now())::text || '-' || lpad((v_count + 1)::text, 3, '0');
end;
$$;

-- 2) El KPI "Con OT Abierta" del CRM solo necesita un conteo de clientes
--    distintos con una OT en curso — no los datos de esas OTs.
create or replace function public.contar_clientes_con_ot_abierta()
returns int
language sql
security invoker
set search_path = public
as $$
  select count(distinct cliente_id)::int
  from ordenes_trabajo
  where estado in ('presupuesto', 'recibido', 'en_reparacion', 'listo');
$$;
