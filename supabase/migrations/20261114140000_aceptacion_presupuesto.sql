-- Aceptación del presupuesto por el cliente desde el portal (sin dibujar firma).
--
-- Es una aceptación electrónica SIMPLE: lo que vale como prueba es el registro de qué texto aceptó,
-- quién (nombre que escribió), cuándo, por qué importe y desde qué conexión y dispositivo. Reglas:
--   · Solo la escribe el servidor (el portal): un usuario del taller no puede fingir la aceptación.
--   · Una vez registrada no se puede cambiar ni borrar (para otra aceptación, otra orden).
--   · O está completa (nombre, hora, importe, texto) o no existe.
--   · Convive con la firma dibujada del mostrador (`firma_presupuesto`); son dos formas de aceptar.

alter table public.ordenes_trabajo
  add column aceptacion_presupuesto_nombre      text,
  add column aceptacion_presupuesto_en          timestamptz,
  add column aceptacion_presupuesto_total       numeric(12,2),
  add column aceptacion_presupuesto_texto       text,
  add column aceptacion_presupuesto_ip          text,
  add column aceptacion_presupuesto_dispositivo text;

alter table public.ordenes_trabajo
  add constraint ot_aceptacion_completa_chk check (
    (aceptacion_presupuesto_en is null) = (aceptacion_presupuesto_nombre is null)
    and (aceptacion_presupuesto_en is null) = (aceptacion_presupuesto_total is null)
    and (aceptacion_presupuesto_en is null) = (aceptacion_presupuesto_texto is null)
  ),
  add constraint ot_aceptacion_longitudes_chk check (
    char_length(coalesce(aceptacion_presupuesto_nombre, '')) <= 120
    and char_length(coalesce(aceptacion_presupuesto_texto, '')) <= 600
    and char_length(coalesce(aceptacion_presupuesto_ip, '')) <= 64
    and char_length(coalesce(aceptacion_presupuesto_dispositivo, '')) <= 300
  );

create or replace function public.proteger_aceptacion_presupuesto()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cambia boolean :=
       new.aceptacion_presupuesto_nombre      is distinct from old.aceptacion_presupuesto_nombre
    or new.aceptacion_presupuesto_en          is distinct from old.aceptacion_presupuesto_en
    or new.aceptacion_presupuesto_total       is distinct from old.aceptacion_presupuesto_total
    or new.aceptacion_presupuesto_texto       is distinct from old.aceptacion_presupuesto_texto
    or new.aceptacion_presupuesto_ip          is distinct from old.aceptacion_presupuesto_ip
    or new.aceptacion_presupuesto_dispositivo is distinct from old.aceptacion_presupuesto_dispositivo;
begin
  if not cambia then
    return new;
  end if;
  if old.aceptacion_presupuesto_en is not null then
    raise exception 'La aceptación del presupuesto ya está registrada y no se puede modificar.' using errcode = 'P0001';
  end if;
  -- Quien llama con sesión de usuario (el taller) no puede registrarla: solo el servidor (sin usuario).
  if auth.uid() is not null then
    raise exception 'La aceptación del presupuesto solo se registra desde el portal del cliente.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_aceptacion_presupuesto() from public, anon, authenticated;

create trigger trg_ot_proteger_aceptacion
  before update on public.ordenes_trabajo
  for each row execute function public.proteger_aceptacion_presupuesto();
