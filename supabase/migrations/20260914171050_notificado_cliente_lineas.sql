-- El aviso al cliente de "se añadió trabajo extra" pasa de vivir en estado
-- efímero de React a persistirse por línea — así sobrevive a recargar la
-- página, a cambiar de pestaña, y queda auditable como el resto de la app.
-- Default true: las líneas ya existentes (parte del presupuesto/recepción
-- original) nunca necesitaron aviso — solo las que se añadan después.
alter table public.lineas_ot add column notificado_cliente boolean not null default true;
comment on column public.lineas_ot.notificado_cliente is
  'false cuando la línea se añadió tras la recepción y el taller aún no le avisó al cliente del cargo extra (WhatsApp/email desde el detalle de la OT). true por defecto.';
