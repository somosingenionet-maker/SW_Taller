-- Catálogo de servicios para la mano de obra de las órdenes (antes solo lo usaba la inspección).
--
--   · El precio pasa a ser opcional: la lista base llega sin precio porque cada taller cobra distinto. Sin precio,
--     al elegir el servicio en una orden el precio se escribe a mano; en la inspección no se sugiere importe.
--   · Lista base para cada taller nuevo (y para los que aún no tienen ninguno). Es solo un punto de partida:
--     el taller la edita, desactiva o borra desde Ajustes → Servicios.

alter table public.servicios_predefinidos alter column precio drop not null;

-- La lista base. Se ejecuta con los permisos del dueño (la usa el disparador del alta, que corre sin
-- usuario de taller); solo inserta si el taller no tiene ningún servicio, así que repetirla no duplica.
create or replace function public.sembrar_servicios_base(p_empresa_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.servicios_predefinidos where empresa_id = p_empresa_id) then
    return;
  end if;
  insert into public.servicios_predefinidos (empresa_id, nombre, reparacion, precio)
  select p_empresa_id, v.nombre, v.reparacion, null
  from (values
    ('Mano de obra (hora)',              'Mano de obra'),
    ('Diagnosis electrónica',            'Diagnosis electrónica con equipo de diagnosis'),
    ('Revisión general',                 'Revisión general del vehículo'),
    ('Revisión previa a la ITV',         'Revisión previa a la ITV'),
    ('Cambio de aceite y filtro',        'Cambio de aceite de motor y filtro de aceite'),
    ('Filtro de aire',                   'Sustitución del filtro de aire'),
    ('Filtro de habitáculo',             'Sustitución del filtro de habitáculo'),
    ('Filtro de combustible',            'Sustitución del filtro de combustible'),
    ('Bujías',                           'Sustitución de bujías'),
    ('Pastillas de freno delanteras',    'Sustitución de pastillas de freno delanteras'),
    ('Pastillas de freno traseras',      'Sustitución de pastillas de freno traseras'),
    ('Discos y pastillas delanteros',    'Sustitución de discos y pastillas de freno delanteros'),
    ('Discos y pastillas traseros',      'Sustitución de discos y pastillas de freno traseros'),
    ('Líquido de frenos',                'Sustitución y purgado del líquido de frenos'),
    ('Líquido refrigerante',             'Sustitución del líquido refrigerante'),
    ('Kit de distribución',              'Sustitución del kit de distribución y bomba de agua'),
    ('Correa de accesorios',             'Sustitución de la correa de accesorios'),
    ('Kit de embrague',                  'Sustitución del kit de embrague'),
    ('Amortiguadores',                   'Sustitución de amortiguadores'),
    ('Batería',                          'Sustitución de la batería'),
    ('Montaje y equilibrado',            'Montaje y equilibrado de neumáticos'),
    ('Alineado de dirección',            'Alineado de la dirección'),
    ('Carga de aire acondicionado',      'Revisión y carga de gas del aire acondicionado'),
    ('Escobillas',                       'Sustitución de escobillas limpiaparabrisas'),
    ('Lámparas',                         'Sustitución de lámparas')
  ) as v(nombre, reparacion);
end;
$$;
revoke all on function public.sembrar_servicios_base(text) from public, anon, authenticated;

create or replace function public.trg_empresa_servicios_base()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sembrar_servicios_base(new.id);
  return new;
end;
$$;
revoke all on function public.trg_empresa_servicios_base() from public, anon, authenticated;

create trigger trg_empresas_servicios_base after insert on public.empresas
  for each row execute function public.trg_empresa_servicios_base();

-- Talleres que ya existen y no tienen ningún servicio.
select public.sembrar_servicios_base(e.id) from public.empresas e;
