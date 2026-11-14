# Inspección digital del vehículo — diseño (14-11-2026)

Estado: DISEÑO APROBADO por Daniel el 14-11-2026 (las 4 decisiones de la sección 10 se tomaron como se proponía).
Fase A IMPLEMENTADA y probada contra Supabase el 14-11-2026 (ver «Estado de la fase A» al final).
Ajustes respecto al diseño: la plantilla estándar tiene 28 puntos (no 32); la aprobación del cliente NO añade líneas a la
orden por su cuenta: queda registrada y recepción pulsa «Añadir lo aprobado a la orden» (los totales se calculan en la app
y así nada cambia una factura sin que el taller lo vea); el mecánico también puede abrir la inspección desde su Portal;
solo los puntos urgentes exigen precio para enviar (los de atención pueden ir sin precio).

## 1. Qué problema resuelve
Hoy el mecánico encuentra un problema y se lo cuenta al cliente de palabra o por teléfono: el cliente no lo ve,
duda del precio y rechaza reparaciones que sí necesita. La inspección digital convierte cada revisión en un informe
con semáforo y fotos que el cliente ve en su móvil y que se transforma en presupuesto con un clic.
Objetivos medibles: más reparaciones aprobadas por visita, menos llamadas, y prueba escrita de lo que se avisó.

## 2. El flujo de punta a punta
1. **Se abre una inspección** desde una orden de trabajo (botón «Inspección» en la ficha, o marcada al crear la orden).
2. **El mecánico la rellena en su móvil** desde su Portal (el enlace que ya usa, sin cuenta): recorre las categorías y
   da un toque por punto: Bien / Atención / Urgente / No aplica. Solo «Atención» y «Urgente» piden foto y una nota.
3. **El mecánico la marca como terminada.** Aparece en el taller como «Pendiente de revisar».
4. **Recepción la revisa en la app:** corrige textos, quita fotos que sobren y **pone precio** a cada punto con
   problema (a mano o desde un servicio predefinido). Luego pulsa «Enviar al cliente».
5. **El cliente recibe un correo con el enlace** y abre su informe (semáforo, fotos, notas y precio de lo urgente).
   El mismo informe aparece en su portal. Se puede copiar el enlace para mandarlo por WhatsApp a mano.
6. **El cliente aprueba o rechaza** desde el informe. Lo aprobado entra como líneas en el presupuesto de la orden y
   queda en el historial (quién, cuándo, qué).
7. **El informe queda archivado en la ficha del vehículo**: historial de estados, base de futuros avisos («neumáticos
   en atención hace 4 meses»).

Estados de la inspección: `borrador` (mecánico trabajando) → `terminada` (pendiente de revisar) → `enviada`
(el cliente la ve; ya no se edita) → `respondida`.

## 3. Pantallas (ver boceto)
- **Mecánico, lista de puntos:** categorías plegables, un toque por punto, contadores bien/atención/urgente, guardado
  automático punto a punto (si se va la cobertura no se pierde nada), botón «Terminar inspección» con aviso si quedan
  puntos sin marcar.
- **Mecánico, punto con problema:** cámara, hasta 3 fotos por punto, nota para el cliente y reparación propuesta.
- **Taller, revisión:** vista de escritorio con el mismo contenido más precios, total de lo urgente y «Enviar».
  Además, pestaña «Inspección» en la ficha de la orden y en la ficha del vehículo (histórico).
- **Cliente, informe:** primero lo urgente, luego lo que requiere atención, al final «el resto está bien». Fotos
  ampliables, precio claro, botones «Aprobar» y «Rechazar» y teléfono del taller.
- **Informe imprimible/PDF** para entregarlo en mostrador.

## 4. Plantilla estándar propuesta (28 puntos, 7 categorías)
- Frenos: pastillas delanteras, discos delanteros, pastillas traseras, discos/tambores traseros, líquido de frenos.
- Neumáticos: delantero izq., delantero der., trasero izq., trasero der., rueda de repuesto/kit.
- Fluidos: aceite de motor, refrigerante, líquido limpiaparabrisas, dirección asistida.
- Motor y transmisión: correa de accesorios, fugas visibles, silentblocks y soportes, escape.
- Suspensión y dirección: amortiguadores, rótulas y trapecios, cubos de rueda.
- Luces y visibilidad: luces delanteras, luces traseras e intermitentes, escobillas, parabrisas.
- Eléctrico y confort: batería, aire acondicionado y filtro de habitáculo, testigos del cuadro.
Cada punto tiene nombre, categoría y orden; en una versión posterior el taller podrá activar, desactivar y añadir
puntos propios y tener varias plantillas (pre-ITV, revisión de vacaciones, camión).

## 5. Datos (modelo)
Todo con `empresa_id` y RLS por taller, igual que el resto.
- `plantillas_inspeccion`: `empresa_id`, `nombre`, `puntos jsonb` (lista ordenada de {categoria, nombre}). Hasta que el
  taller la edite se usa la estándar del sistema.
- `inspecciones`: `id`, `empresa_id`, `orden_id`, `vehiculo_id`, `cliente_id`, `estado`, `km`, `realizada_por`
  (nombre del mecánico), `terminada_en`, `enviada_en`, `respondida_en`, `nota_general`.
- `inspeccion_puntos`: `inspeccion_id`, `categoria`, `nombre` (copia fija: si la plantilla cambia, las inspecciones
  antiguas no cambian), `orden`, `estado` (bien|atencion|urgente|no_aplica|null), `nota`, `fotos text[]`,
  `precio numeric`, `descripcion_reparacion`, `decision` (pendiente|aprobado|rechazado|null).
- Las líneas del presupuesto que nacen de un punto llevan `inspeccion_punto_id`, para saber de dónde vienen.
- Eventos en el historial de la orden: inspección terminada, enviada, aprobada/rechazada (como hoy con las firmas).

## 6. Fotos: privadas, ligeras y sin cuenta del mecánico
- **Bucket nuevo y PRIVADO** (`inspecciones`). Las fotos de recepción actuales están en un bucket público con ruta
  impredecible; aquí las fotos pueden enseñar matrículas o personas y van a verse por enlace, así que se sirven con
  URL firmada que caduca (1 hora) y la lectura la autoriza la función, no un enlace permanente.
- **El mecánico no tiene sesión**, así que no sube directo: pide a su función una URL de subida firmada (valida tipo de
  archivo, tamaño y máximo de fotos por punto) y sube con ella.
- **Compresión en el móvil antes de subir** (lado largo 1.600 px, ~300 KB). Hoy las fotos de recepción se suben tal cual
  salen de la cámara; con 20-30 fotos por inspección eso saturaría datos móviles y almacenamiento.
- **Borrado:** el bucket se añade a la lista que el borrado de empresa y el borrado automático de cuentas limpian
  (`BUCKETS_EMPRESA`); si no, quedaría huérfano. Conservación: mientras viva la orden.

## 6 bis. Almacenamiento y conservación de las fotos
**Números orientativos.** Con compresión (~300 KB por foto) y solo fotos de puntos con problema (unas 8 por
inspección): ~2,5 MB por inspección. Un taller con 40 inspecciones al mes genera ~100 MB al mes, ~1,2 GB al año.
Supabase incluye 100 GB en el plan Pro y cobra ~0,021 $/GB al mes por encima (cifras de comparativas de terceros,
confirmar en supabase.com/pricing); el plan gratuito solo da 1 GB. Con 100 talleres serían ~120 GB al año. El coste
en dinero es pequeño; el motivo principal para no guardar fotos para siempre es de **privacidad** (minimización y
plazo de conservación del RGPD) y de orden, no de factura.

**Política propuesta, en capas:**
1. **Menos fotos y más ligeras desde el origen:** solo «Atención» y «Urgente» llevan foto; máximo 3 por punto y 20 por
   inspección; compresión a 1.600 px / calidad 0,7 en el móvil antes de subir.
2. **Conservación limitada por taller:** las fotos se borran automáticamente pasado un plazo desde la entrega de la
   orden (por defecto 6 meses, decidido por Daniel el 14-11-2026; el taller elige 3, 6, 12 o 24 en Ajustes de
   Empresa). Se borran las fotos de inspección y las de recepción (hoy las de recepción no caducan nunca): una sola
   regla para todo el taller. Las fotos de recepción que ya existen no se borran de golpe: el primer borrado es 30
   días después de activar la función, con el aviso del punto 5, para que cada taller pueda descargarlas o
   marcarlas como «conservar».
3. **El texto se queda, la foto se va:** estados, notas, precios y decisión del cliente pesan casi nada y se conservan
   (son la prueba de lo avisado); del informe desaparecen solo las imágenes y se ve «Fotos eliminadas el dd/mm/aaaa».
4. **Excepciones manuales:** botón «Conservar fotos» en una orden con reclamación abierta (no se borran hasta que se
   quite la marca) y botón «Borrar fotos ahora» para el que quiera limpiar antes.
5. **Aviso antes de borrar:** el panel de la orden y un correo semanal al administrador avisan de las órdenes cuyas
   fotos se borrarán en 30 días, con enlace para descargarlas o marcarlas como conservar.
6. **Visibilidad:** Ajustes de Empresa muestra el espacio usado por el taller; el super administrador ve el total y el
   reparto por taller (para detectar abusos o decidir cuotas).
7. **Fase B/C, si hace falta:** a los 90 días, reducir las fotos a miniatura (~60 KB) hasta el plazo de borrado
   (ahorra ~80 % sin perder la evidencia visual).

**Mecanismo.** Una función programada diaria (igual que `limpiar-empresas`) busca órdenes entregadas hace más que el
plazo del taller y sin marca de conservar, borra los archivos de Storage, vacía las listas de fotos y anota la fecha
de borrado. Con las mismas salvaguardas del borrado de cuentas: interruptor general, modo simulación, límite por
ejecución y constancia de lo borrado. Una orden cancelada o un presupuesto no aprobado cuenta desde su última
actividad.

**Legal.** Qué plazo de conservación es el adecuado ante reclamaciones (garantía de la reparación, responsabilidad por
daños) es una pregunta para el abogado; el plazo por defecto es configurable precisamente por eso.

## 7. Seguridad y legal
- Las inspecciones del Portal del Mecánico solo se pueden tocar con su token y solo en sus órdenes asignadas
  (igual que las tareas hoy). Cada acción se anota en el historial.
- El informe del cliente se abre con el token del cliente que ya existe, con límite de intentos como el resto.
- Una inspección enviada no se edita (igual que la firma): para corregir se reabre y queda anotado.
- Informe y aprobación son prueba de lo avisado, pero la aprobación es un clic, no una firma. Si se quiere valor de
  firma, se reutiliza la firma en pantalla de los presupuestos (decisión abierta).
- Texto de privacidad: las fotos de inspección son datos del taller (encargo de tratamiento); incluirlo en la próxima
  revisión del abogado. No usa IA.

## 8. Cómo se probará
- Pruebas unitarias de la lógica: resumen y semáforo, validación de estados, qué puntos van al presupuesto, totales.
- Pruebas de las funciones (Deno): subida firmada con tipo/tamaño/límites, acceso solo a órdenes propias, estados.
- Pruebas de base de datos en transacción revertida: aislamiento entre talleres, el mecánico no ve otras órdenes,
  una inspección enviada no se puede editar.
- E2E: mecánico rellena con foto de prueba, recepción revisa y envía, cliente abre el informe y aprueba.
- Prueba real en móvil con una inspección completa antes de darla por buena.

## 9. Fases y tamaño (una persona + Claude)
- **Fase A, el flujo completo (unos 10-12 días, incluida la política de conservación de fotos):** plantilla estándar fija, mecánico rellena con fotos, revisión y
  precios en el taller, informe del cliente con aprobar/rechazar el presupuesto entero, correo con enlace, histórico
  en la ficha del vehículo.
- **Fase B (unos 5 días):** aprobación punto por punto, plantillas editables y varias, servicios predefinidos para
  poner precio de un toque, informe imprimible/PDF.
- **Fase C (según uso):** vídeo corto por punto, métricas (tasa de aprobación, importe aprobado por inspección en
  Inicio/Rentabilidad), avisos automáticos a partir de puntos en «atención», envío por WhatsApp cuando exista.

## 10. Decisiones (tomadas el 14-11-2026)
1. Precios: los pone recepción al revisar; el mecánico solo marca estado, foto y nota.
2. Plantilla: fija (los 28 puntos) en la fase A; editable en la fase B.
3. Aprobación: del presupuesto entero en la fase A; punto por punto en la fase B.
4. Fotos: bucket privado con enlaces que caducan.

## 11. Estado de la fase A (14-11-2026)
- Hecho y desplegado: migraciones `20261114120000` y `20261114125000`; funciones `portal-mecanico`, `portal-cliente`,
  `inspeccion-enviar`, `limpiar-fotos`, `manage-empresas`, `limpiar-empresas`; compresión de todas las fotos.
- Probado contra Supabase con datos de prueba (borrados al terminar): recorrido completo mecánico → revisión → envío por
  correo → informe del cliente → aprobación → añadir a la orden (46 comprobaciones del servidor + pantalla del taller),
  aislamiento y bloqueos (token falso, ruta de otra empresa, formato, 4.ª foto, edición tras enviar, decisión falsa),
  bucket privado (sin enlace público; con sesión o enlace firmado sí), y borrado de fotos (orden vencida, orden con
  «conservar», orden reciente, huérfanos, aviso por correo y registro en el historial).
- PENDIENTE: activar el cron diario del borrado (`20261114130000`), que hasta el 14-12-2026 solo avisa (margen de 30 días).
- Fase B: aprobación punto por punto, plantillas editables, servicios predefinidos para poner precio, PDF imprimible.
