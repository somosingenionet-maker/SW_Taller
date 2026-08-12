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

insert into public.tecnicos (id, nombre, especialidad, activo)
values
  ('tec-1','Miguel Ángel','Mecánica general y motor',true),
  ('tec-2','Raúl García','Electricidad y diagnosis',true)
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

-- ── Órdenes de trabajo ──────────────────────────────────────────────────────
insert into public.ordenes_trabajo
  (id, numero, vehiculo_id, cliente_id, estado, fecha_recepcion, fecha_estimada_entrega,
   fecha_entrega, kilometraje_entrada, kilometraje_salida, descripcion_problema, diagnostico,
   tecnico_asignado, subtotal, iva_pct, total_iva, total, notas, presupuesto_estado, updated_at)
values
  ('ot-1','OT-2026-001','veh-4','cli-3','entregado','2026-05-10','2026-05-13','2026-05-13',114000,114005,
   'El coche no arranca bien por las mañanas y a veces se apaga solo.',
   'Batería de arranque en mal estado. Tensión en frío: 9.8V. Recomendada sustitución inmediata.',
   'Miguel Ángel',205,21,43.05,248.05,'Fallo de arranque inicial por baja tensión con clima invernal.',null,'2026-05-13T10:00:00.000Z'),
  ('ot-2','OT-2026-002','veh-4','cli-3','en_reparacion','2026-06-10','2026-06-14',null,119800,null,
   'Luz de revisión encendida. Consumo de aceite elevado.',
   'Revisión diagnóstico: código P0011 (distribución árbol de levas). Requiere cambio de aceite y revisión de la válvula de control de distribución.',
   'Miguel Ángel',303,21,63.63,366.63,null,null,'2026-06-10T09:00:00.000Z'),
  ('ot-3','OT-2026-003','veh-4','cli-2','presupuesto','2026-06-12','2026-06-16',null,95400,null,
   'Ruido metálico en la parte delantera al frenar.',
   'Pastillas de freno delanteras al límite. Discos con marcas de desgaste. Recomiendo cambio completo del sistema delantero.',
   'Raúl García',305,21,64.05,369.05,null,'enviado','2026-06-12T08:00:00.000Z'),
  ('ot-4','OT-2026-004','veh-4','cli-1','recibido','2026-06-12',null,null,62000,null,
   'Revisión previa al verano. Quiere revisar aire acondicionado y frenos traseros.',
   null,'Raúl García',0,21,0,0,null,null,'2026-06-12T11:00:00.000Z')
on conflict (id) do nothing;

insert into public.lineas_ot (id, ot_id, tipo, descripcion, cantidad, precio_unitario, costo_unitario, subtotal, posicion)
values
  ('lot-1-1','ot-1','pieza','Batería Varta E39 AGM 70Ah',1,175,110,175,0),
  ('lot-1-2','ot-1','mano_de_obra','Mano de obra sustitución batería',0.5,60,25,30,1),
  ('lot-2-1','ot-2','pieza','Aceite motor 5W30 (5L)',1,45,28,45,0),
  ('lot-2-2','ot-2','pieza','Filtro de aceite',1,18,8,18,1),
  ('lot-2-3','ot-2','pieza','Válvula control distribución VW',1,120,75,120,2),
  ('lot-2-4','ot-2','mano_de_obra','Mano de obra diagnóstico y reparación',2,60,25,120,3),
  ('lot-3-1','ot-3','pieza','Kit pastillas Brembo delanteras',1,85,50,85,0),
  ('lot-3-2','ot-3','pieza','Discos de freno delanteros (par)',1,130,80,130,1),
  ('lot-3-3','ot-3','mano_de_obra','Sustitución frenos delanteros',1.5,60,25,90,2)
on conflict (id) do nothing;

insert into public.eventos_ot (ot_id, fecha, descripcion)
values
  ('ot-1','2026-05-10T09:00:00.000Z','Vehículo recibido en taller'),
  ('ot-1','2026-05-10T11:30:00.000Z','Presupuesto generado'),
  ('ot-1','2026-05-10T12:00:00.000Z','Presupuesto enviado al cliente'),
  ('ot-1','2026-05-10T14:00:00.000Z','Reparación iniciada'),
  ('ot-1','2026-05-13T09:00:00.000Z','Trabajo completado'),
  ('ot-1','2026-05-13T10:00:00.000Z','Vehículo entregado al cliente'),
  ('ot-2','2026-06-10T09:00:00.000Z','Vehículo recibido en taller'),
  ('ot-2','2026-06-10T10:00:00.000Z','Presupuesto generado'),
  ('ot-2','2026-06-10T10:30:00.000Z','Presupuesto enviado al cliente'),
  ('ot-2','2026-06-11T08:00:00.000Z','Reparación iniciada'),
  ('ot-3','2026-06-12T08:00:00.000Z','Presupuesto creado'),
  ('ot-3','2026-06-12T08:30:00.000Z','Presupuesto enviado al cliente'),
  ('ot-4','2026-06-12T11:00:00.000Z','Vehículo recibido en taller');
