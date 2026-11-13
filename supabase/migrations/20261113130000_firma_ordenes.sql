-- Firma en pantalla del cliente en el mostrador: sobre el presupuesto (aceptación del importe) y
-- sobre la entrega del vehículo (conformidad al recogerlo). Es una firma electrónica SIMPLE: deja
-- constancia de quién firmó, qué y cuándo, pero no sustituye a un certificado ni a la firma de un
-- documento que la ley exija con garantías reforzadas.
--
-- Reglas:
--   · Una vez firmada no se puede cambiar ni borrar (disparador): para otra firma habría que crear
--     otra orden. Así lo firmado es siempre lo que se ve.
--   · La hora y el importe los fija el SERVIDOR al firmar (no el navegador): el importe es el total
--     de la orden en ese momento. Si después se modifican las líneas, la ficha avisa de que el
--     importe ya no coincide con el firmado.
--   · El dibujo (PNG) pesa unos KB y no viaja en los listados: solo se pide al abrir la orden.

alter table public.ordenes_trabajo
  add column if not exists firma_presupuesto        text,
  add column if not exists firma_presupuesto_nombre text,
  add column if not exists firma_presupuesto_en     timestamptz,
  add column if not exists firma_presupuesto_total  numeric(12,2),
  add column if not exists firma_entrega            text,
  add column if not exists firma_entrega_nombre     text,
  add column if not exists firma_entrega_en         timestamptz;

alter table public.ordenes_trabajo
  add constraint ot_firma_presupuesto_png_chk check (firma_presupuesto is null or (firma_presupuesto like 'data:image/png;base64,%' and length(firma_presupuesto) <= 250000)),
  add constraint ot_firma_entrega_png_chk     check (firma_entrega     is null or (firma_entrega     like 'data:image/png;base64,%' and length(firma_entrega)     <= 250000)),
  -- O está firmada del todo (dibujo, nombre, hora) o no lo está.
  add constraint ot_firma_presupuesto_completa_chk check ((firma_presupuesto is null) = (firma_presupuesto_en is null) and (firma_presupuesto is null) = (firma_presupuesto_nombre is null) and (firma_presupuesto is null) = (firma_presupuesto_total is null)),
  add constraint ot_firma_entrega_completa_chk     check ((firma_entrega is null) = (firma_entrega_en is null) and (firma_entrega is null) = (firma_entrega_nombre is null));

-- Lo firmado no se toca.
create or replace function public.proteger_firmas_orden()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.firma_presupuesto is not null and (
       new.firma_presupuesto is distinct from old.firma_presupuesto
    or new.firma_presupuesto_nombre is distinct from old.firma_presupuesto_nombre
    or new.firma_presupuesto_en is distinct from old.firma_presupuesto_en
    or new.firma_presupuesto_total is distinct from old.firma_presupuesto_total) then
    raise exception 'La firma del presupuesto ya está registrada y no se puede modificar.' using errcode = 'P0001';
  end if;
  if old.firma_entrega is not null and (
       new.firma_entrega is distinct from old.firma_entrega
    or new.firma_entrega_nombre is distinct from old.firma_entrega_nombre
    or new.firma_entrega_en is distinct from old.firma_entrega_en) then
    raise exception 'La firma de la entrega ya está registrada y no se puede modificar.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_firmas_orden() from public, anon, authenticated;

drop trigger if exists trg_ot_proteger_firmas on public.ordenes_trabajo;
create trigger trg_ot_proteger_firmas
  before update on public.ordenes_trabajo
  for each row execute function public.proteger_firmas_orden();

-- Firmar. SECURITY INVOKER: se ejecuta con los permisos de quien llama (su RLS limita a las órdenes
-- de su taller y el control de suscripción se aplica igual que en cualquier otra escritura).
create or replace function public.firmar_orden(p_ot_id text, p_tipo text, p_png text, p_nombre text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  ot record;
  nombre text := regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  texto text;
begin
  if p_tipo not in ('presupuesto', 'entrega') then
    raise exception 'Tipo de firma no reconocido.' using errcode = 'P0001';
  end if;
  if length(nombre) < 2 or length(nombre) > 120 then
    raise exception 'Escribe el nombre de quien firma (entre 2 y 120 caracteres).' using errcode = 'P0001';
  end if;
  if p_png is null or p_png not like 'data:image/png;base64,%' or length(p_png) > 250000 or length(p_png) < 200 then
    raise exception 'La firma no es válida. Vuelve a dibujarla.' using errcode = 'P0001';
  end if;

  select id, numero, estado, total, firma_presupuesto, firma_entrega into ot from public.ordenes_trabajo where id = p_ot_id;
  if not found then
    raise exception 'Orden no encontrada.' using errcode = 'P0001';
  end if;
  if ot.estado = 'cancelado' then
    raise exception 'La orden está cancelada: no se puede firmar.' using errcode = 'P0001';
  end if;

  if p_tipo = 'presupuesto' then
    if ot.firma_presupuesto is not null then
      raise exception 'El presupuesto ya está firmado.' using errcode = 'P0001';
    end if;
    if coalesce(ot.total, 0) <= 0 then
      raise exception 'El presupuesto no tiene importe: añade líneas antes de firmarlo.' using errcode = 'P0001';
    end if;
    update public.ordenes_trabajo
       set firma_presupuesto = p_png, firma_presupuesto_nombre = nombre, firma_presupuesto_en = now(), firma_presupuesto_total = ot.total
     where id = ot.id;
    texto := 'Presupuesto firmado en pantalla por ' || nombre || ' (importe ' || replace(to_char(ot.total, 'FM9999990.00'), '.', ',') || ' €).';
  else
    if ot.firma_entrega is not null then
      raise exception 'La entrega ya está firmada.' using errcode = 'P0001';
    end if;
    if ot.estado not in ('listo', 'entregado') then
      raise exception 'La entrega se firma cuando el vehículo está listo.' using errcode = 'P0001';
    end if;
    update public.ordenes_trabajo
       set firma_entrega = p_png, firma_entrega_nombre = nombre, firma_entrega_en = now()
     where id = ot.id;
    texto := 'Entrega del vehículo firmada en pantalla por ' || nombre || '.';
  end if;

  insert into public.eventos_ot (ot_id, fecha, descripcion) values (ot.id, now(), texto);
end;
$$;
revoke all on function public.firmar_orden(text, text, text, text) from public, anon;
grant execute on function public.firmar_orden(text, text, text, text) to authenticated;
