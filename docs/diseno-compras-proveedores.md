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

## Adjuntar la factura del proveedor (2026-11-20)
- **Dónde**: al registrar la compra («Adjuntar» en el formulario) o después en el detalle. PDF, JPG, PNG o WebP; hasta 10 MB y 10 archivos por compra.
  Las fotos se reducen en el navegador antes de subir (2.400 px, calidad 0,8: se sigue leyendo la letra pequeña); un HEIC se convierte si el navegador sabe.
- **Almacenamiento**: bucket PRIVADO `facturas-proveedor`, ruta `<empresa>/<compra>/<uuid>.<ext>`. Leer, subir y borrar exige el módulo `compras` y estar en
  la carpeta de tu empresa; subir y borrar, además, suscripción en vigor. Se ve con enlaces firmados de 5 minutos.
- **Lista oficial**: tabla `compra_adjuntos`, solo escribible por `registrar_adjunto_compra` / `borrar_adjunto_compra` (comprueban ruta, que el archivo existe
  y toman tamaño y tipo del archivo guardado, no del navegador). Si la subida o el alta falla, la compra queda guardada y se avisa qué archivo repetir.
- **Conservación**: NO hay borrado automático (la ley obliga a guardar las facturas recibidas años). Se van con la empresa (`BUCKETS_EMPRESA` lo incluye) o cuando el
  taller los quita. Una compra anulada conserva sus archivos y no admite más ni deja quitarlos.
- El espacio ocupado (`uso_almacenamiento`) cuenta estos archivos.

## ZIP de documentos para la gestoría (2026-11-21)
- En «Para la gestoría», bloque «Documentos de las facturas recibidas»: cuántos archivos hay, de cuántas facturas y cuánto pesan, qué facturas NO tienen
  documento (lo que la gestoría va a reclamar) y el botón «Descargar documentos (ZIP)».
- El ZIP lleva cada archivo como `fecha_proveedor_número[_n].ext` (sin acentos ni símbolos, único aunque dos facturas den el mismo nombre), un
  `indice.csv` (qué factura es cada archivo: fecha, proveedor, NIF, número, total, estado, nombre original) y un `LEEME.txt` (periodo, qué falta, qué falló).
- Se dejan fuera las compras anuladas. Un archivo que falla no tumba el ZIP: sale en el LEEME y en un aviso.
- Se arma en el navegador (descarga de 4 en 4 con enlaces firmados de 15 minutos, reintento por archivo, barra de progreso y cancelar). Límite de 400 MB por ZIP:
  por encima pide un periodo más corto. Compresión «almacenar» (PDF y JPG ya van comprimidos).

## Para más adelante
Cuentas por pagar con avisos de vencimiento, pedido sugerido
al proveedor desde el stock bajo, gastos recurrentes, gastos no deducibles / IVA no deducible, retenciones (IRPF) y recargo de equivalencia.
