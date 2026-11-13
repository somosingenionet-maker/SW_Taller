-- Permisos por módulo EN EL SERVIDOR.
--
-- Hasta ahora `perfiles.modulos` solo servía para enseñar u ocultar pestañas: la base de datos
-- separaba por TALLER (RLS) pero no por MÓDULO, así que un usuario sin «Facturas» seguía pudiendo
-- leerlas llamando directamente a la API. Aquí se cierra para los datos que pertenecen a UN módulo.
--
-- Qué se protege (el módulo que se exige entre paréntesis):
--   · facturas, lineas_factura, factura_ot, registros_facturacion (VeriFactu) ...... facturas
--   · citas ................................................................... citas
--   · alertas y notificaciones_cliente ........................................ alertas
--   · interacciones_cliente (notas del CRM) ................................... clientes
--   · productos (inventario) .................................................. inventario o taller
--   · movimientos_stock: leer → inventario; crear → inventario o taller
--   · rentabilidad_* (márgenes, costes, ranking de clientes y técnicos) ....... rentabilidad
--
-- Qué NO se protege a propósito: clientes, vehículos, cliente_vehiculo, técnicos y las órdenes de
-- trabajo (con sus líneas e historial). Los usan casi todos los módulos (el Taller, la Agenda, las
-- Facturas y las Alertas necesitan ver nombres y matrículas) y separarlos rompería flujos que hoy
-- funcionan. Tampoco se oculta el COSTE de cada línea de una orden a quien puede ver esa orden:
-- eso exigiría permisos por columna.
--
-- Reglas: los administradores y el super administrador tienen todos los módulos (un administrador
-- siempre puede darse cualquier módulo a sí mismo). Un usuario inactivo no tiene ninguno.

create or replace function public.tiene_modulo(p_modulo text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_super_admin() or exists (
    select 1 from public.perfiles p
     where p.id = auth.uid()
       and p.activo
       and p.empresa_id is not null
       and not public.sesion_sin_segundo_factor()
       and (p.rol = 'admin' or p_modulo = any (p.modulos))
  )
$$;
revoke all on function public.tiene_modulo(text) from public, anon;
grant execute on function public.tiene_modulo(text) to authenticated;

-- Facturación ----------------------------------------------------------------------------------
alter policy facturas_tenant on public.facturas
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('facturas')))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('facturas')));

alter policy lineas_factura_tenant on public.lineas_factura
  using ((es_super_admin() or exists (select 1 from public.facturas f where f.id = lineas_factura.factura_id and f.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('facturas')))
  with check ((es_super_admin() or exists (select 1 from public.facturas f where f.id = lineas_factura.factura_id and f.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('facturas')));

alter policy factura_ot_tenant on public.factura_ot
  using ((es_super_admin() or exists (select 1 from public.facturas f where f.id = factura_ot.factura_id and f.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('facturas')))
  with check ((es_super_admin() or exists (select 1 from public.facturas f where f.id = factura_ot.factura_id and f.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('facturas')));

alter policy registros_facturacion_select on public.registros_facturacion
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('facturas')));

-- Agenda ---------------------------------------------------------------------------------------
alter policy citas_tenant on public.citas
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('citas')))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('citas')));

-- Alertas y avisos a clientes -------------------------------------------------------------------
alter policy alertas_tenant on public.alertas
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas')))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas')));

alter policy notificaciones_cliente_tenant on public.notificaciones_cliente
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas')))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and (select public.tiene_modulo('alertas')));

-- Notas del CRM --------------------------------------------------------------------------------
alter policy interacciones_cliente_tenant on public.interacciones_cliente
  using ((es_super_admin() or exists (select 1 from public.clientes c where c.id = interacciones_cliente.cliente_id and c.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('clientes')))
  with check ((es_super_admin() or exists (select 1 from public.clientes c where c.id = interacciones_cliente.cliente_id and c.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('clientes')));

-- Inventario: el Taller también lo necesita (elige productos en las líneas y crea alguno al vuelo).
alter policy productos_tenant on public.productos
  using (((empresa_id = mi_empresa_id()) or es_super_admin()) and ((select public.tiene_modulo('inventario')) or (select public.tiene_modulo('taller'))))
  with check (((empresa_id = mi_empresa_id()) or es_super_admin()) and ((select public.tiene_modulo('inventario')) or (select public.tiene_modulo('taller'))));

alter policy movimientos_stock_select on public.movimientos_stock
  using ((es_super_admin() or exists (select 1 from public.productos p where p.id = movimientos_stock.producto_id and p.empresa_id = mi_empresa_id())) and (select public.tiene_modulo('inventario')));

alter policy movimientos_stock_insert on public.movimientos_stock
  with check ((es_super_admin() or exists (select 1 from public.productos p where p.id = movimientos_stock.producto_id and p.empresa_id = mi_empresa_id())) and ((select public.tiene_modulo('inventario')) or (select public.tiene_modulo('taller'))));

-- Rentabilidad: las funciones son «security invoker» sobre las órdenes (que ve todo el taller), así
-- que el candado va dentro de cada una. Sin el módulo devuelven vacío / ceros, nunca un error.
create or replace function public.rentabilidad_estado_actual()
returns table(estado text, cantidad bigint)
language sql
stable
set search_path to 'public'
as $$
  select estado, count(*) from ordenes_trabajo
  where (select public.tiene_modulo('rentabilidad'))
  group by estado;
$$;

create or replace function public.rentabilidad_tecnicos(p_start date, p_end date)
returns table(nombre text, ots bigint, facturado numeric)
language sql
stable
set search_path to 'public'
as $$
  select tecnico_asignado, count(*), sum(total)
  from ordenes_trabajo
  where estado = 'entregado' and tecnico_asignado is not null
    and fecha_recepcion >= p_start and fecha_recepcion <= p_end
    and (select public.tiene_modulo('rentabilidad'))
  group by tecnico_asignado
  order by sum(total) desc;
$$;

create or replace function public.rentabilidad_top_clientes(p_limit integer default 5)
returns table(cliente_id text, visitas bigint, facturado numeric)
language sql
stable
set search_path to 'public'
as $$
  select cliente_id, count(*), sum(total)
  from ordenes_trabajo
  where estado = 'entregado'
    and (select public.tiene_modulo('rentabilidad'))
  group by cliente_id
  order by sum(total) desc
  limit p_limit;
$$;

create or replace function public.rentabilidad_periodo(p_start date, p_end date)
returns table(facturacion numeric, entregadas bigint, tiempo_medio_dias numeric, mano_obra_total numeric, mano_obra_costo numeric, producto_total numeric, producto_costo numeric, canceladas bigint, ots_total bigint, presupuestos_total bigint, presupuestos_convertidos bigint)
language sql
stable
set search_path to 'public'
as $$
  with periodo as (
    select * from ordenes_trabajo
    where fecha_recepcion >= p_start and fecha_recepcion <= p_end
      and (select public.tiene_modulo('rentabilidad'))
  ),
  entregadas_cte as (
    select * from periodo where estado = 'entregado'
  ),
  lineas_entregadas as (
    select l.tipo, l.subtotal, coalesce(l.costo_unitario, 0) * l.cantidad as costo
    from lineas_ot l
    join entregadas_cte e on e.id = l.ot_id
  )
  select
    coalesce((select sum(total) from entregadas_cte), 0),
    (select count(*) from entregadas_cte),
    (select avg(fecha_entrega - fecha_recepcion) from entregadas_cte where fecha_entrega is not null),
    coalesce((select sum(subtotal) from lineas_entregadas where tipo = 'mano_de_obra'), 0),
    coalesce((select sum(costo) from lineas_entregadas where tipo = 'mano_de_obra'), 0),
    coalesce((select sum(subtotal) from lineas_entregadas where tipo = 'producto'), 0),
    coalesce((select sum(costo) from lineas_entregadas where tipo = 'producto'), 0),
    (select count(*) from periodo where estado = 'cancelado'),
    (select count(*) from periodo),
    (select count(*) from periodo where estado <> 'cancelado'
       and (estado = 'presupuesto' or presupuesto_aprobado or presupuesto_estado = 'enviado')),
    (select count(*) from periodo where presupuesto_aprobado);
$$;

-- La alerta de aceite se mantiene sola cuando se anota el próximo cambio en la ficha del vehículo.
-- Quien lo anota puede ser un usuario SIN el módulo de alertas (p. ej. el Taller): el disparador
-- tiene que poder escribir en `alertas` igual que los otros dos disparadores de alertas
-- (crear_alertas_vehiculo y sincronizar_alertas_vencimiento, que ya son «security definer»).
alter function public.sincronizar_alerta_aceite() security definer;
