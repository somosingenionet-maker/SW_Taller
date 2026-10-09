-- Endurecimiento de seguridad previo al piloto con talleres reales.
--
-- 1) CORRIGE UNA ESCALADA DE PRIVILEGIOS CRÍTICA. La política perfiles_update_propio
--    deja a cada usuario actualizar su propia fila de `perfiles`, y `authenticated`
--    tenía permiso de UPDATE sobre TODAS las columnas. Resultado comprobado en
--    producción (en una transacción que se deshizo): cualquier usuario podía ponerse
--    rol = 'super_admin' o cambiarse a la empresa de otro taller y leer los datos de
--    todos los talleres. Ahora (a) solo se puede actualizar nombre, rol, modulos y
--    activo, y (b) un trigger exige que rol/modulos/activo solo los cambie un
--    administrador de la misma empresa, y que nadie salvo el super admin cree
--    super admins ni mueva usuarios de empresa.
--
-- 1b) La política empresas_update dejaba actualizar la fila de la empresa a CUALQUIER
--    usuario del taller (un mecánico, recepción...) y sobre todas las columnas, incluida
--    `activo` (la marca de cuenta suspendida por impago) y los ajustes fiscales y de
--    VERI*FACTU. Ahora solo el administrador de la empresa (o el super admin), solo sobre
--    las columnas de configuración, y `activo` solo lo cambia el super admin.
--
-- 2) Las funciones internas (triggers, control de límites de peticiones...) eran
--    llamables por cualquiera desde /rest/v1/rpc, incluso sin iniciar sesión. Se
--    quita ese acceso: los triggers se ejecutan igual (Postgres no comprueba EXECUTE
--    al dispararlos) y las Edge Functions usan service_role.
--
-- 3) Avisos de rendimiento del linter de Supabase: auth.uid() evaluado por fila en
--    las políticas de perfiles, search_path sin fijar y claves foráneas sin índice.

-- 1) Perfiles ----------------------------------------------------------------------
revoke update on public.perfiles from anon, authenticated;
grant update (nombre, rol, modulos, activo) on public.perfiles to authenticated;

create or replace function public.proteger_perfil()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol_llamante     text;
  v_empresa_llamante text;
begin
  -- Llamadas del servidor (service_role / Admin API de Auth): sin restricciones.
  if auth.uid() is null then
    return new;
  end if;
  if public.es_super_admin() then
    return new;
  end if;

  if new.empresa_id is distinct from old.empresa_id then
    raise exception 'No se puede cambiar la empresa de un usuario.';
  end if;
  if new.rol = 'super_admin' and old.rol <> 'super_admin' then
    raise exception 'Solo la plataforma puede crear superadministradores.';
  end if;

  if new.rol is distinct from old.rol
     or new.modulos is distinct from old.modulos
     or new.activo is distinct from old.activo then
    select rol, empresa_id into v_rol_llamante, v_empresa_llamante
      from public.perfiles where id = auth.uid();
    if v_rol_llamante is distinct from 'admin' or v_empresa_llamante is distinct from old.empresa_id then
      raise exception 'Solo un administrador de la empresa puede cambiar el rol, los módulos o el estado de un usuario.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_perfiles_proteger before update on public.perfiles
  for each row execute function public.proteger_perfil();


-- 1b) Empresas ---------------------------------------------------------------------
revoke update on public.empresas from anon, authenticated;
grant update (
  nombre, tagline, razon_social, nif, direccion_fiscal, correo, telefono, web, ciudad,
  brand_color, logo_base64, logo_url, activo, siguiente_numero_factura,
  recordatorios_automaticos_activos, plantillas_recordatorios, factura_prefijo,
  factura_mostrar_qr, verifactu_envio_activo, verifactu_entorno
) on public.empresas to authenticated;

alter policy empresas_update on public.empresas
  using (
    public.es_super_admin() or (
      id = public.mi_empresa_id()
      and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.rol = 'admin')
    )
  )
  with check (
    public.es_super_admin() or (
      id = public.mi_empresa_id()
      and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.rol = 'admin')
    )
  );

create or replace function public.proteger_empresa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.es_super_admin() then
    return new;
  end if;
  if new.activo is distinct from old.activo then
    raise exception 'Solo la plataforma puede activar o suspender una empresa.';
  end if;
  return new;
end;
$$;

create trigger trg_empresas_proteger before update on public.empresas
  for each row execute function public.proteger_empresa();

-- 2) Funciones: quitar el acceso público -------------------------------------------
do $$
declare r record;
begin
  -- Funciones de trigger: nadie debe llamarlas por /rpc.
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;

-- Solo las llaman las Edge Functions (service_role).
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
-- Auxiliar interna de los triggers de stock; el cliente no la usa.
revoke all on function public.estado_de_ot(text) from public, anon, authenticated;
-- Las usan las políticas RLS y la app, solo con sesión iniciada.
revoke all on function public.mi_empresa_id() from public, anon;
revoke all on function public.es_super_admin() from public, anon;
revoke all on function public.certificado_verifactu_estado() from public, anon;

-- Lo que se cree de ahora en adelante en este esquema no queda expuesto por defecto:
-- cada función que el cliente deba llamar hay que concederla de forma explícita.
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- 3) Rendimiento y avisos del linter ------------------------------------------------
alter function public.set_updated_at() set search_path = public;
alter function public.bloquear_borrado_factura() set search_path = public;
alter function public.reset_recordatorio_alerta() set search_path = public;

alter policy perfiles_update_propio on public.perfiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy perfiles_update_admin on public.perfiles
  using (
    public.es_super_admin() or (
      empresa_id = public.mi_empresa_id()
      and exists (select 1 from public.perfiles p where p.id = (select auth.uid()) and p.rol = 'admin')
    )
  )
  with check (
    rol <> 'super_admin' and (public.es_super_admin() or empresa_id = public.mi_empresa_id())
  );

create index if not exists citas_cliente_id_idx on public.citas (cliente_id);
create index if not exists citas_ot_id_idx on public.citas (ot_id);
create index if not exists citas_tecnico_id_idx on public.citas (tecnico_id);
create index if not exists citas_vehiculo_id_idx on public.citas (vehiculo_id);
create index if not exists facturas_vehiculo_id_idx on public.facturas (vehiculo_id);
create index if not exists notificaciones_cliente_vehiculo_id_idx on public.notificaciones_cliente (vehiculo_id);
