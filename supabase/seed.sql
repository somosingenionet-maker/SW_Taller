-- Datos de demostración. Se aplican con `supabase db reset`.
-- Los IDs coinciden con los de la app (veh-1...) para conservar las
-- referencias cruzadas durante la migración incremental desde localStorage.

insert into public.vehiculos
  (id, marca, modelo, anio, color, combustible, matricula, bastidor, kilometraje,
   itv_vencimiento, seguro_vencimiento, impuesto_vencimiento, fecha_registro)
values
  ('veh-1','Toyota','Auris Hybrid',2019,'Blanco','hibrido','2840-KPT','SB1ZA3JE40E819385',142500,'2026-07-15','2026-10-10','2027-05-20','2022-03-12'),
  ('veh-2','Seat','León TSI',2021,'Gris','gasolina','8912-LMN','VSSZZZ5FZHR041920',95400,'2026-06-25','2026-06-18','2027-05-20','2023-01-15'),
  ('veh-3','Peugeot','3008 BlueHDi',2018,'Negro','diesel','5531-KXT','VF3JRHNYHHS592183',188300,'2026-12-05','2026-09-01','2027-05-20','2021-08-04'),
  ('veh-4','Volkswagen','Golf TDI',2017,'Azul','diesel','4410-JVZ','WVWZZZAUZGW289410',119800,'2027-02-14','2026-11-15','2027-05-20','2020-11-20'),
  ('veh-5','BMW','Serie 3 320d',2022,'Plata','diesel','0123-MBL','WBA8C51040A591280',62000,'2028-04-10','2026-07-30','2027-05-20','2024-04-10')
on conflict (id) do nothing;
