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

insert into public.clientes
  (id, nombre, apellidos, nif_nie_pasaporte, correo, telefono, direccion, fecha_registro)
values
  ('cli-1','Alejandro','Gómez Ruiz','45123987M','alejandro.gomez@gmail.com','+34 611 223 344','Calle Mayor 45, 2ºA, Madrid','2024-02-10'),
  ('cli-2','María Pilar','Sánchez Ortiz','02894156X','pilar.sanchez.cortes@outlook.com','+34 655 443 322','Avenida de la Constitución 12, Sevilla','2023-11-05'),
  ('cli-3','Carlos','Benítez Varga','Y1284562P','carlos.benitez@ingenio.es','+34 688 991 122','Paseo de Gracia 89, Barcelona','2025-01-20'),
  ('cli-4','Lucía','Fernández Cobo','71924158W','lucia.fc@gmail.com','+34 600 112 233','Calle Alcalá 120, Madrid','2026-06-05')
on conflict (id) do nothing;

insert into public.interacciones_cliente (id, cliente_id, fecha, tipo, notas)
values
  ('int-cli-1-1','cli-1','2026-05-10','llamada','Solicita presupuesto para la revisión de los 150.000 km de su Toyota Auris.'),
  ('int-cli-1-2','cli-1','2026-05-12','registro_contrato','Registro de la ficha de cliente en el sistema CRM de Backoffice.'),
  ('int-cli-2-1','cli-2','2026-04-18','visita','Usuario habitual. Solicita presupuesto de renting a largo plazo.'),
  ('int-cli-2-2','cli-2','2026-06-01','whatsapp','Consulta si el Seat León (veh-2) está disponible libre de avería.'),
  ('int-cli-3-1','cli-3','2026-05-20','email','Reportó leve ruido metálico en Peugeot 3008 tras entrega. Se agendó revisión.'),
  ('int-cli-4-1','cli-4','2026-06-05','llamada','Nueva cliente. Solicita cita para diagnóstico de ruido en frenos de su BMW Serie 3.')
on conflict (id) do nothing;
