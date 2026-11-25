-- Tipo de vehículo según la ficha técnica: turismo (M1) o furgoneta de mercancías hasta 3.500 kg (N1).
-- Solo cambia cada cuánto pasa la ITV (RD 920/2017): la furgoneta N1 es anual de 6 a 10 años y semestral después.
-- Los coches que ya existen quedan como turismo (lo habitual) y el taller cambia los que sean furgonetas.
alter table public.vehiculos add column if not exists tipo_vehiculo text not null default 'turismo'
  constraint vehiculos_tipo_vehiculo_check check (tipo_vehiculo in ('turismo', 'furgoneta'));

comment on column public.vehiculos.tipo_vehiculo is
  'turismo (M1) o furgoneta de mercancías hasta 3.500 kg (N1), según la ficha técnica; decide la periodicidad de la ITV que se propone.';
