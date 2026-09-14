-- El QR de verificación VeriFactu se sigue calculando al emitir (columna
-- qr_url, sin cambios), pero se deja oculto por defecto en la factura
-- impresa/descargada: VeriFactu no es obligatorio hasta 2027 (empresas:
-- 1 ene 2027; autónomos: 1 jul 2027) y el formato exacto del QR aún no está
-- contrastado contra la especificación oficial vigente de la AEAT — mejor
-- no mostrarle al cliente un enlace sin validar. Cada empresa lo activa
-- desde Configuración cuando quiera adoptarlo antes de esa fecha.
alter table public.empresas add column factura_mostrar_qr boolean not null default false;
comment on column public.empresas.factura_mostrar_qr is
  'Si se muestra el QR de verificación VeriFactu en las facturas impresas/descargadas. false por defecto — activar solo tras validar el formato contra la especificación oficial de la AEAT.';
