-- Unicidad POR TALLER, no global. Tres fallos de multi-taller que con un solo taller no
-- se ven y con dos revientan:
--
-- 1) vehiculos.matricula y vehiculos.bastidor eran UNIQUE entre TODOS los talleres: si un
--    coche pasa de un taller a otro (muy habitual), el segundo no podía registrarlo — y
--    el error revelaba que esa matrícula existe en otro taller. Además, el bastidor es
--    opcional en el formulario y sin él se guarda '': el segundo vehículo sin bastidor
--    de un mismo taller ya fallaba.
-- 2) ordenes_trabajo.numero era UNIQUE global, y el número se calculaba contando las órdenes
--    visibles (count + 1): el segundo taller chocaba con el primero en su primera orden
--    (OT-2026-001), y dentro de un taller, borrar una orden o crear dos a la vez generaba
--    un número repetido (y el taller no podía volver a crear órdenes).
--
-- Ahora: matrícula y bastidor únicos dentro de cada taller (la matrícula sin espacios,
-- guiones ni mayúsculas), bastidor opcional, y el número de orden lo asigna un trigger
-- con un bloqueo por taller: máximo + 1 dentro del año, sin huecos que reutilizar ni
-- carreras.

-- 1) Vehículos ---------------------------------------------------------------------
alter table public.vehiculos drop constraint if exists vehiculos_matricula_key;
alter table public.vehiculos drop constraint if exists vehiculos_bastidor_key;

create unique index vehiculos_empresa_matricula_uq
  on public.vehiculos (empresa_id, upper(regexp_replace(matricula, '[\s-]', '', 'g')));
create unique index vehiculos_empresa_bastidor_uq
  on public.vehiculos (empresa_id, upper(bastidor))
  where bastidor <> '';

-- 2) Órdenes de trabajo ------------------------------------------------------------
alter table public.ordenes_trabajo drop constraint if exists ordenes_trabajo_numero_key;
alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_empresa_numero_key unique (empresa_id, numero);

-- Se ejecuta DESPUÉS de set_empresa_id (los triggers BEFORE corren por orden alfabético:
-- trg_ot_empresa < trg_ot_numero), así que empresa_id ya está rellenado.
create or replace function public.asignar_numero_ot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefijo text;
  v_max     int;
begin
  if new.numero is not null and btrim(new.numero) <> '' then
    return new;
  end if;

  -- Serializa la asignación de números de un mismo taller hasta el fin de la transacción.
  perform pg_advisory_xact_lock(hashtext('ot-numero:' || new.empresa_id));

  v_prefijo := 'OT-' || extract(year from now())::text || '-';
  select coalesce(max((regexp_match(numero, '^' || v_prefijo || '(\d+)$'))[1]::int), 0)
    into v_max
    from public.ordenes_trabajo
   where empresa_id = new.empresa_id
     and numero like v_prefijo || '%';

  new.numero := v_prefijo || lpad((v_max + 1)::text, 3, '0');
  return new;
end;
$$;

create trigger trg_ot_numero before insert on public.ordenes_trabajo
  for each row execute function public.asignar_numero_ot();

revoke all on function public.asignar_numero_ot() from public, anon, authenticated;
