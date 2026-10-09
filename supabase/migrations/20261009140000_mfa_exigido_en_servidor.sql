-- Segundo factor (TOTP) exigido en la base de datos, no solo en la pantalla.
--
-- Si un usuario tiene un factor TOTP verificado, su sesión solo vale cuando ha pasado el código
-- (el token lleva aal = 'aal2'). Con solo la contraseña (aal1) deja de pertenecer a ninguna
-- empresa y de ser super admin: todas las políticas RLS (22 de 25, más las 8 de Storage) pasan
-- por mi_empresa_id() / es_super_admin(), así que un único cambio aquí las cierra todas, incluso
-- si alguien llama a la API directamente con un token aal1 saltándose la interfaz.
--
-- Quien no tiene factor verificado no nota ningún cambio. Si un usuario pierde su dispositivo,
-- se le quita el factor desde el panel de Supabase (Authentication > Users > el usuario >
-- Remove factor) y vuelve a entrar solo con la contraseña.
--
-- Las Edge Functions (que usan la clave de servicio y se saltan RLS) hacen la misma comprobación
-- con _shared/mfa.ts.

create or replace function public.sesion_sin_segundo_factor()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    -- Camino rápido: la sesión ya pasó el segundo factor.
    when coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then false
    else exists (
      select 1 from auth.mfa_factors f
       where f.user_id = auth.uid() and f.status = 'verified'
    )
  end
$$;

-- Las políticas se evalúan con los permisos del usuario, así que debe poder llamarla;
-- solo revela si SU PROPIA sesión necesita aún el segundo factor.
revoke all on function public.sesion_sin_segundo_factor() from public, anon;
grant execute on function public.sesion_sin_segundo_factor() to authenticated;

create or replace function public.mi_empresa_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select empresa_id from public.perfiles
   where id = auth.uid() and not public.sesion_sin_segundo_factor()
$$;

create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select rol = 'super_admin' from public.perfiles
      where id = auth.uid() and not public.sesion_sin_segundo_factor()),
    false)
$$;

-- Esta política no pasa por las funciones anteriores (cada usuario edita su propia fila):
-- también debe exigir el segundo factor.
alter policy perfiles_update_propio on public.perfiles
  using (id = (select auth.uid()) and not public.sesion_sin_segundo_factor())
  with check (id = (select auth.uid()) and not public.sesion_sin_segundo_factor());
