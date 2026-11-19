-- Módulo «Avisos» (antes «Alertas»): avisos personalizados a un cliente («neumáticos en 6 meses») y ajustes de avisos por taller.

-- 1) Ajustes por taller -------------------------------------------------------------------------
-- Cuántos días antes del vencimiento se avisa, y qué vencimientos (ITV, seguro, impuesto) quiere vigilar cada taller.
-- Los talleres que ya existen conservan lo que recibían hasta ahora (los tres); los nuevos empiezan solo con la ITV:
-- el seguro y el impuesto no son negocio del taller y obligan a mantener esas fechas al día.
alter table public.empresas
  add column avisos_antelacion_dias smallint not null default 14 check (avisos_antelacion_dias in (7, 14, 30)),
  add column avisos_itv             boolean  not null default true,
  add column avisos_seguro          boolean  not null default false,
  add column avisos_impuesto        boolean  not null default false;
update public.empresas set avisos_seguro = true, avisos_impuesto = true;
grant update (avisos_antelacion_dias, avisos_itv, avisos_seguro, avisos_impuesto) on public.empresas to authenticated;

-- 2) Avisos personalizados ---------------------------------------------------------------------
-- Un recordatorio puntual para un cliente (y, si quiere, un coche): qué decirle y cuándo. Sale solo por correo si el cliente
-- tiene; si no, aparece en «Para hoy» para mandarlo por WhatsApp. `avisar_en` es el día EN QUE SE AVISA (no el de un vencimiento).
create table public.avisos_cliente (
  id            text primary key default gen_random_uuid()::text,
  empresa_id    text not null references public.empresas(id) on delete cascade,
  cliente_id    text not null references public.clientes(id) on delete cascade,
  vehiculo_id   text references public.vehiculos(id) on delete cascade,
  motivo        text not null check (char_length(btrim(motivo)) between 1 and 80),
  /** Texto para el cliente, con variables {{cliente}}, {{vehiculo}}, {{empresa}}. Vacío = texto por defecto. */
  mensaje       text not null default '' check (char_length(mensaje) <= 1500),
  /** Nota interna del taller: el cliente no la ve. */
  nota          text check (nota is null or char_length(nota) <= 500),
  avisar_en     date,
  avisar_km     int check (avisar_km is null or avisar_km > 0),
  /** Cada cuántos meses vuelve a programarse tras avisar (solo con fecha). Null = una sola vez. */
  repetir_meses smallint check (repetir_meses is null or repetir_meses between 1 and 60),
  estado        text not null default 'programado' check (estado in ('programado', 'enviado', 'hecho', 'descartado')),
  enviado_en    timestamptz,
  canal         text check (canal is null or canal in ('email', 'whatsapp')),
  /** Orden desde la que se creó (al entregar el coche), si procede. */
  orden_id      text references public.ordenes_trabajo(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint avisos_cliente_cuando_chk check (avisar_en is not null or avisar_km is not null),
  constraint avisos_cliente_repetir_chk check (repetir_meses is null or avisar_en is not null)
);
create index on public.avisos_cliente (empresa_id, estado);
create index on public.avisos_cliente (cliente_id);
create index on public.avisos_cliente (vehiculo_id);
create trigger trg_avisos_cliente_updated before update on public.avisos_cliente for each row execute function public.set_updated_at();
create trigger trg_avisos_cliente_empresa before insert on public.avisos_cliente for each row execute function public.set_empresa_id();
create trigger trg_suscripcion_activa before insert or update or delete on public.avisos_cliente for each statement execute function public.exigir_suscripcion_activa();

alter table public.avisos_cliente enable row level security;
-- Mismo permiso que las alertas (módulo «alertas»). Además, el cliente, el coche y la orden tienen que ser del mismo taller.
create policy avisos_cliente_tenant on public.avisos_cliente for all to authenticated
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas')))
  with check (
    ((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas'))
    and exists (select 1 from public.clientes c where c.id = cliente_id and c.empresa_id = avisos_cliente.empresa_id)
    and (vehiculo_id is null or exists (select 1 from public.vehiculos v where v.id = vehiculo_id and v.empresa_id = avisos_cliente.empresa_id))
    and (orden_id is null or exists (select 1 from public.ordenes_trabajo o where o.id = orden_id and o.empresa_id = avisos_cliente.empresa_id))
  );

-- 3) El historial de notificaciones admite los avisos personalizados ---------------------------------
alter table public.notificaciones_cliente drop constraint notificaciones_cliente_tipo_evento_check;
alter table public.notificaciones_cliente add constraint notificaciones_cliente_tipo_evento_check
  check (tipo_evento in ('mantenimiento_preventivo', 'itv_proxima', 'vencimiento_seguro', 'impuesto_proximo',
                         'reparacion_lista', 'cambio_aceite', 'aceite_vencido', 'aceite_resumen', 'aviso_personalizado'));
