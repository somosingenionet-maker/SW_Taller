-- Revisión pre-ITV.
--
--   · Plantilla de inspección «Pre-ITV» del sistema, como la estándar: no se edita, pero el taller puede crear la
--     suya a partir de ella. Los puntos siguen los capítulos del Manual de procedimiento de inspección de las
--     estaciones ITV (versión 7.9, en vigor desde el 01/01/2026, Ministerio de Industria y Turismo), sección I
--     (turismos y furgonetas), quedándose con lo que el mecánico puede comprobar en el taller. Los apartados que
--     no aplican a un turismo (antiempotramiento, tacógrafo, gálibo, mercancías…) no están; lo que solo llevan
--     algunos coches (enganche, GLP, eCall) se marca «no aplica» cuando no lo tenga.
--   · `ordenes_trabajo.es_pre_itv`: el coche viene a pasar la ITV. La inspección de esa orden usa la Pre-ITV salvo
--     que se elija otra (también cuando la abre el mecánico desde su portal).
--   · `crear_inspeccion(orden, 'pre-itv')` y `crear_plantilla_inspeccion(nombre, 'pre-itv')` aceptan la Pre-ITV.

alter table public.ordenes_trabajo add column if not exists es_pre_itv boolean not null default false;

create or replace function public.plantilla_inspeccion_pre_itv()
returns table (categoria text, nombre text, posicion int)
language sql
immutable
set search_path = public
as $$
  select v.categoria, v.nombre, v.posicion
  from (values
    ('1. Identificación', 'Documentación del vehículo y seguro en vigor', 1),
    ('1. Identificación', 'Número de bastidor legible', 2),
    ('1. Identificación', 'Placas de matrícula', 3),
    ('2. Exterior, carrocería y chasis', 'Carrocería, bajos y corrosión', 4),
    ('2. Exterior, carrocería y chasis', 'Enganche de remolque (si lo lleva)', 5),
    ('2. Exterior, carrocería y chasis', 'Guardabarros y paragolpes', 6),
    ('2. Exterior, carrocería y chasis', 'Limpiaparabrisas y lavaparabrisas', 7),
    ('2. Exterior, carrocería y chasis', 'Puertas, cerraduras y bisagras', 8),
    ('2. Exterior, carrocería y chasis', 'Retrovisores', 9),
    ('2. Exterior, carrocería y chasis', 'Parabrisas y lunas (impactos, grietas, láminas)', 10),
    ('3. Interior', 'Asientos y anclajes', 11),
    ('3. Interior', 'Cinturones de seguridad y anclajes', 12),
    ('3. Interior', 'Airbags (testigo apagado y sin obstáculos)', 13),
    ('3. Interior', 'Desempañado y antivaho', 14),
    ('3. Interior', 'Velocímetro y cuentakilómetros', 15),
    ('3. Interior', 'Llamada de emergencia eCall (si la lleva)', 16),
    ('4. Alumbrado y señalización', 'Luces de cruce y carretera (y reglaje)', 17),
    ('4. Alumbrado y señalización', 'Luces de posición', 18),
    ('4. Alumbrado y señalización', 'Luces de circulación diurna', 19),
    ('4. Alumbrado y señalización', 'Intermitentes y luz de emergencia', 20),
    ('4. Alumbrado y señalización', 'Luces de freno (incluida la tercera)', 21),
    ('4. Alumbrado y señalización', 'Luz de marcha atrás', 22),
    ('4. Alumbrado y señalización', 'Antinieblas', 23),
    ('4. Alumbrado y señalización', 'Luz de matrícula', 24),
    ('4. Alumbrado y señalización', 'Catadióptricos', 25),
    ('4. Alumbrado y señalización', 'Testigos de luces en el cuadro', 26),
    ('4. Alumbrado y señalización', 'Claxon', 27),
    ('5. Emisiones', 'Ruido del escape', 28),
    ('5. Emisiones', 'Gases u opacidad y testigo de motor (OBD sin averías)', 29),
    ('6. Frenos', 'Freno de servicio: eficacia y equilibrio', 30),
    ('6. Frenos', 'Freno de mano', 31),
    ('6. Frenos', 'ABS (testigo apagado)', 32),
    ('6. Frenos', 'Pedal de freno', 33),
    ('6. Frenos', 'Servofreno y bomba de freno', 34),
    ('6. Frenos', 'Tubos y latiguillos', 35),
    ('6. Frenos', 'Pastillas y zapatas', 36),
    ('6. Frenos', 'Discos y tambores', 37),
    ('6. Frenos', 'Bombines, pinzas y fugas de líquido', 38),
    ('7. Dirección', 'Alineación (desviación de ruedas)', 39),
    ('7. Dirección', 'Volante y columna', 40),
    ('7. Dirección', 'Caja de dirección y fuelles', 41),
    ('7. Dirección', 'Rótulas y bieletas', 42),
    ('7. Dirección', 'Dirección asistida', 43),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Rodamientos y holguras de ejes', 44),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Llantas y tornillos', 45),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Neumáticos delanteros (dibujo ≥ 1,6 mm, medida)', 46),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Neumáticos traseros (dibujo ≥ 1,6 mm, medida)', 47),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Amortiguadores', 48),
    ('8. Ejes, ruedas, neumáticos y suspensión', 'Muelles, brazos y silentblocks', 49),
    ('9. Motor y transmisión', 'Fugas y estado general del motor', 50),
    ('9. Motor y transmisión', 'Sistema de combustible (fugas)', 51),
    ('9. Motor y transmisión', 'Escape: fugas y sujeción', 52),
    ('9. Motor y transmisión', 'Transmisión: palieres, fuelles y homocinéticas', 53),
    ('9. Motor y transmisión', 'Instalación de gas GLP o GNC (si la lleva)', 54),
    ('10. Otros', 'Reformas sin homologar', 55)
  ) as v(categoria, nombre, posicion)
$$;
revoke all on function public.plantilla_inspeccion_pre_itv() from public, anon;
grant execute on function public.plantilla_inspeccion_pre_itv() to authenticated, service_role;

-- crear_inspeccion: además de las plantillas del taller y la estándar, la Pre-ITV ('pre-itv'). Sin plantilla
-- elegida, una orden marcada como pre-ITV usa la Pre-ITV.
create or replace function public.crear_inspeccion(p_orden_id text, p_plantilla_id text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_ot record;
  v_id text;
  v_plantilla text;
  v_nombre_plantilla text;
  v_pre_itv boolean := false;
  v_filas int;
begin
  select id, empresa_id, vehiculo_id, cliente_id, kilometraje_entrada, estado, tecnico_asignado, es_pre_itv
    into v_ot from public.ordenes_trabajo where id = p_orden_id;
  if not found then
    raise exception 'Orden no encontrada.';
  end if;
  if v_ot.estado = 'cancelado' then
    raise exception 'No se puede inspeccionar una orden cancelada.';
  end if;

  select id into v_id from public.inspecciones where orden_id = p_orden_id;
  if v_id is not null then
    return v_id;
  end if;

  -- Plantilla: la pedida (de este taller, o la Pre-ITV); si no, la Pre-ITV si la orden es pre-ITV; si no, la de
  -- por defecto del taller; si no, la estándar del sistema.
  if p_plantilla_id = 'pre-itv' then
    v_pre_itv := true;
  elsif p_plantilla_id is not null then
    select id, nombre into v_plantilla, v_nombre_plantilla
      from public.plantillas_inspeccion where id = p_plantilla_id and empresa_id = v_ot.empresa_id;
    if v_plantilla is null then
      raise exception 'La plantilla elegida no existe.';
    end if;
  elsif v_ot.es_pre_itv then
    v_pre_itv := true;
  else
    select id, nombre into v_plantilla, v_nombre_plantilla
      from public.plantillas_inspeccion where empresa_id = v_ot.empresa_id and es_defecto;
  end if;

  insert into public.inspecciones (empresa_id, orden_id, vehiculo_id, cliente_id, km, realizada_por, plantilla_nombre)
  values (v_ot.empresa_id, v_ot.id, v_ot.vehiculo_id, v_ot.cliente_id, nullif(v_ot.kilometraje_entrada, 0), v_ot.tecnico_asignado,
          case when v_pre_itv then 'Pre-ITV' else coalesce(v_nombre_plantilla, 'Estándar') end)
  returning id into v_id;

  if v_pre_itv then
    insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_ot.empresa_id, p.categoria, p.nombre, p.posicion from public.plantilla_inspeccion_pre_itv() p;
  elsif v_plantilla is not null then
    insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion, servicio_nombre, reparacion_sugerida, precio_sugerido)
    select v_id, v_ot.empresa_id, p.categoria, p.nombre, row_number() over (order by p.posicion, p.id)::int,
           s.nombre, s.reparacion, s.precio
      from public.plantilla_inspeccion_puntos p
      left join public.servicios_predefinidos s on s.id = p.servicio_id and s.activo
     where p.plantilla_id = v_plantilla;
    get diagnostics v_filas = row_count;
    if v_filas = 0 then
      raise exception 'La plantilla elegida no tiene ningún punto. Añade puntos en Ajustes → Inspección.';
    end if;
  else
    insert into public.inspeccion_puntos (inspeccion_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_ot.empresa_id, p.categoria, p.nombre, p.posicion from public.plantilla_inspeccion_estandar() p;
  end if;

  return v_id;
end;
$$;
revoke all on function public.crear_inspeccion(text, text) from public, anon;
grant execute on function public.crear_inspeccion(text, text) to authenticated, service_role;

-- crear_plantilla_inspeccion: origen null = estándar, 'pre-itv' = Pre-ITV, otro = copiar una del taller.
create or replace function public.crear_plantilla_inspeccion(p_nombre text, p_origen text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_empresa text := public.mi_empresa_id();
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_id      text;
begin
  if v_empresa is null then raise exception 'No autorizado.' using errcode = 'P0001'; end if;
  if char_length(v_nombre) < 1 or char_length(v_nombre) > 60 then
    raise exception 'El nombre de la plantilla debe tener entre 1 y 60 caracteres.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.plantillas_inspeccion where empresa_id = v_empresa and lower(btrim(nombre)) = lower(v_nombre)) then
    raise exception 'Ya tienes una plantilla con ese nombre.' using errcode = 'P0001';
  end if;
  if p_origen is not null and p_origen <> 'pre-itv'
     and not exists (select 1 from public.plantillas_inspeccion where id = p_origen and empresa_id = v_empresa) then
    raise exception 'La plantilla de origen no existe.' using errcode = 'P0001';
  end if;

  -- La primera plantilla del taller pasa a ser la de por defecto, salvo que sea una copia de la Pre-ITV (no es
  -- la revisión de todos los días).
  insert into public.plantillas_inspeccion (empresa_id, nombre, es_defecto)
  values (v_empresa, v_nombre,
          p_origen is distinct from 'pre-itv' and not exists (select 1 from public.plantillas_inspeccion where empresa_id = v_empresa))
  returning id into v_id;

  if p_origen is null then
    insert into public.plantilla_inspeccion_puntos (plantilla_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_empresa, e.categoria, e.nombre, e.posicion from public.plantilla_inspeccion_estandar() e;
  elsif p_origen = 'pre-itv' then
    insert into public.plantilla_inspeccion_puntos (plantilla_id, empresa_id, categoria, nombre, posicion)
    select v_id, v_empresa, e.categoria, e.nombre, e.posicion from public.plantilla_inspeccion_pre_itv() e;
  else
    insert into public.plantilla_inspeccion_puntos (plantilla_id, empresa_id, categoria, nombre, posicion, servicio_id)
    select v_id, v_empresa, o.categoria, o.nombre, o.posicion, o.servicio_id
      from public.plantilla_inspeccion_puntos o where o.plantilla_id = p_origen;
  end if;
  return v_id;
end;
$$;
revoke all on function public.crear_plantilla_inspeccion(text, text) from public, anon;
grant execute on function public.crear_plantilla_inspeccion(text, text) to authenticated;
