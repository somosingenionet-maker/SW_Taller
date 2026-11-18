# Compras y proveedores (tanda 1, 2026-11-19)

Para qué: que Doonty sepa **qué se compra, a quién se debe y cuánto IVA se soporta**, y que el stock entre solo al registrar la factura del
proveedor. Cierra el círculo con la gestoría: el libro de recibidas y el IVA repercutido − soportado.

## Qué hay
- **Proveedores**: nombre, NIF, contacto, días de pago (proponen el vencimiento), notas; se desactivan en vez de borrarse si tienen compras.
- **Compras** (factura o gasto recibido): proveedor, nº y fecha de la factura, vencimiento, líneas (con o sin producto del inventario) con su IVA,
  estado (pendiente / pagada / anulada; «vencida» es una pendiente fuera de plazo) y notas.
- **Resumen**: pendiente de pagar, vencido y total comprado del periodo.
- **Exportación para la gestoría**: la ventana de Facturas > «Para la gestoría» (y el mismo botón en Compras) incluye ahora las facturas recibidas:
  hoja «Facturas recibidas», CSV propio y «Resumen IVA» con repercutido, soportado y diferencia (orientativa).

## Reglas que importan
- **Todo se escribe por funciones** (`guardar_compra`, `editar_datos_compra`, `marcar_pago_compra`, `anular_compra`): la compra, sus líneas, los
  totales y el stock se guardan juntos o no se guarda nada. Las tablas `compras` y `compra_lineas` solo se leen por la API.
- **IVA como en una factura**: cada línea = redondeo(cantidad × precio) y el IVA se calcula sobre la base de cada tipo (no línea a línea). Cantidades
  y precios se guardan a 2 decimales. Si la factura del proveedor difiere un céntimo, es redondeo suyo.
- **Una compra no se reescribe**: se puede corregir número, fechas y notas, marcarla pagada/pendiente o **anularla** (devuelve el stock; no toca los
  costes). Para cambiar importes o líneas: anular y volver a registrar. La misma factura de un proveedor no se puede registrar dos veces (salvo anulada).
- **Stock**: las líneas con producto suman una *entrada* (con `compra_id` y motivo «Compra F-001 · Proveedor»). Opcionalmente fijan el coste del
  producto al precio pagado (casilla marcada por defecto).
- **Permisos**: módulo propio `compras` (datos fiscales). Administradores siempre; el resto solo si se lo dan; se dio a quien ya veía Facturas.
  Sin el módulo, la base devuelve vacío y rechaza escribir. Datos separados por taller y bloqueo de escritura con suscripción caducada, como el resto.

## Para más adelante
Adjuntar la foto/PDF de la factura (almacenamiento privado y plazos de conservación), cuentas por pagar con avisos de vencimiento, pedido sugerido
al proveedor desde el stock bajo, gastos recurrentes, gastos no deducibles / IVA no deducible, retenciones (IRPF) y recargo de equivalencia.
