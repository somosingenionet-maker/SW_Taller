-- Endurecimiento del acceso anónimo (defensa en profundidad; la auditoría del 2026-11-14).
--
-- Hoy el RLS ya impide que el rol anónimo (cualquiera con la clave pública de la web) lea o escriba
-- datos, pero conserva los permisos de tabla por defecto de Supabase y puede ejecutar varias funciones.
-- Si algún día se desactivara una política por error, esos permisos serían la única barrera. Se quitan:
--   · permisos de tabla: el anónimo solo conserva leer `plataforma_config` (el logo del login);
--   · ejecución de funciones: solo con sesión iniciada o desde las Edge Functions;
--   · y `empresas_borradas` pasa a tener clave primaria.

-- 1) Tablas -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select on public.plataforma_config to anon;   -- el login muestra el logo antes de autenticarse

-- Lo que se cree de ahora en adelante tampoco queda abierto al anónimo.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- 2) Funciones: ninguna ejecutable por el anónimo ni por PUBLIC (que lo incluye) ----------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke all on function %s from public, anon', r.f);
    -- Quien sí las usa (la app con sesión iniciada y las Edge Functions) las conserva explícitamente.
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;

-- 3) Clave primaria del registro de borrados --------------------------------------------------
alter table public.empresas_borradas add primary key (id);
