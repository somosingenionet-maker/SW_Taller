# Doonty Motor — auditoría técnica y hoja de ruta de producto (14-11-2026)

## 1. Auditoría técnica

### Qué se revisó (y con qué)
- Código muerto: `knip` sobre toda la web y las funciones, búsqueda de exports sin uso, funciones SQL sin uso.
- Dependencias: `npm audit` (0 vulnerabilidades) y uso real de cada paquete.
- Seguridad: avisos del asesor de Supabase (seguridad y rendimiento), RLS de todas las tablas, permisos del rol
  anónimo, buckets, cabeceras HTTP de producción, secretos en git, patrones peligrosos en el front
  (`innerHTML`, `eval`, `window.open`), autenticación y límites de las funciones públicas.
- Calidad: `tsc --strict`, restos de depuración, TODOs, `any`, tamaño de archivos.
- NO se hizo: prueba de intrusión, revisión línea a línea de todo el código, pruebas de carga.

### Lo que está bien
- 0 vulnerabilidades conocidas en dependencias. Sin secretos en el repositorio (`.env*` ignorado).
- Todas las tablas públicas tienen RLS activado; ninguna sin política salvo las 3 internas a propósito
  (`rate_limits`, `stripe_eventos`, `empresa_certificados_verifactu`, solo accesibles desde el servidor).
- Sin `innerHTML`/`eval`; una sola llamada a `window.open`, con `noopener`.
- Sin TODO/FIXME, sin `@ts-ignore`, un solo `any` (en `lib/lazy.ts`, justificado).
- Ninguna función SQL sin uso. Los avisos del asesor sobre funciones `SECURITY DEFINER` ejecutables por usuarios
  conectados son las funciones auxiliares de las políticas RLS (`mi_empresa_id`, `tiene_modulo`, …): es lo esperado.
- 279 tests de la web, 197 de las funciones, 34 e2e.

### Corregido en esta auditoría (cambios locales, sin publicar)
| Qué | Detalle |
|---|---|
| Código muerto | `listOrdenes()` (cargaba todo el histórico de órdenes y nadie la llamaba) eliminada. |
| Dependencias sin uso | Quitadas `@types/express`, `autoprefixer`, `esbuild`, `ws`, `tsx`; `vite` estaba duplicado en dependencias y devDependencias. |
| TypeScript estricto | `strict: true` no estaba activado. Solo había 1 error (`p_estado: null` frente a `undefined` en `buscarOrdenes`); corregido y activado. |
| Cabeceras de seguridad | `vercel.json` solo tenía HSTS (el de Vercel). Añadidas `X-Frame-Options: DENY` (evita clickjacking), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. |

### Pendiente (por orden de importancia)
1. **Copias de seguridad (alto, antes de tener clientes reales).** El plan gratuito de Supabase no tiene recuperación
   a un punto en el tiempo. Con facturas VERI*FACTU (inalterables por ley) perder la base de datos es el mayor riesgo
   operativo del producto. Plan Pro de Supabase (backups diarios + PITR) = decisión tuya.
2. **Las pruebas e2e corren contra producción** (tenant «Taller Ejemplo»). Funciona y está controlado, pero no hay un
   entorno de pruebas separado: un cambio de base de datos malo se prueba ya en producción. Con clientes reales
   conviene una segunda base de datos (rama de Supabase o proyecto aparte) para migraciones y e2e.
3. **Sin integración continua.** No hay `.github/workflows`: tsc, tests, Deno y e2e se lanzan a mano. Una acción de
   GitHub que ejecute `tsc + vitest + deno test + knip` en cada push cuesta ~1 hora y evita regresiones.
4. **Sin ESLint.** Hay 4 comentarios `eslint-disable` que no hacen nada porque no hay linter. Añadir ESLint con
   `react-hooks` revelaría posibles bugs de dependencias de efectos.
5. **Content-Security-Policy.** Es la cabecera que falta de verdad. Hay que escribirla y probarla en navegador
   (Supabase, Sentry, Google Fonts, imágenes de Storage); mejor empezar en modo «solo informar».
6. **Archivos gigantes:** `OrdenesTrabajoTab.tsx` (2.642 líneas), `App.tsx` (1.086), `CrmTab`, `AgendaTab`
   (~1.050 cada una). Funcionan y tienen pruebas e2e, pero cada cambio es más arriesgado de lo necesario. Dividir
   `OrdenesTrabajoTab` (lista, tablero, ficha, creación) es lo más rentable.
7. **Base de datos** — HECHO el 14-11-2026 (migración `20261114100000`): `empresas_borradas` con clave primaria; el
   rol anónimo ya no tiene permisos de tabla (solo lee `plataforma_config` para el logo del login) ni ejecuta ninguna
   función. Comprobado contra la API real: `clientes` y `buscar_ordenes` responden 401 sin sesión. Quedan:
   `pg_net` en `public` (aviso del asesor; moverla exige cuidado con el cron), 10 índices «sin uso» (base casi vacía;
   son de claves foráneas, no tocar), dos políticas de UPDATE en `perfiles` (aviso menor de rendimiento) y la
   protección contra contraseñas filtradas (solo en plan de pago).
8. Exports innecesarios sin efecto (`textoFirma`, `sinAcentos`, …) y tipos sueltos: cosméticos, no se tocan.

Falsos positivos de `knip` descartados: las funciones de `supabase/functions/*` (son puntos de entrada), `public/sw.js`
(se registra en tiempo de ejecución) y `scripts/seed-super-admin.mjs` (se lanza a mano).

## 2. Hoja de ruta de producto: qué falta para ser «el mejor»

### Contexto
Hoy Doonty cubre bien el núcleo: órdenes con tablero, clientes con CRM, vehículos con ITV/seguro/aceite, agenda,
inventario, facturación VERI*FACTU, rentabilidad, portal del cliente y del mecánico, firma en pantalla, avisos
automáticos, importación CSV, permisos por módulo, 2FA y PWA. Eso ya iguala a lo básico del mercado.

Referencias (búsqueda del 14-11-2026, no exhaustiva): en España las comparativas destacan presupuestos con mano de
obra/recambios/tiempos y control de repuestos; en la búsqueda no encontré inspección digital con fotos como función
destacada. Tekmetric (EE. UU.) sí vende inspección digital con fotos y vídeos, mensajes bidireccionales, pago por
enlace y pedido de recambios integrado: eso marca hacia dónde va el sector.

### Nivel 1 — lo que más diferencia y vende (siguiente trimestre)
1. **Inspección digital del vehículo.** Lista de comprobaciones con semáforo (bien / atención / urgente), fotos y
   vídeo por punto, y un informe claro para el cliente. Cada «urgente» pasa a presupuesto con un clic. Sube el ticket
   medio del taller y es lo que más enseña un cliente en una demo. Encaja con el portal y la firma que ya existen.
2. **WhatsApp** (y SMS como respaldo). Hoy los avisos son por correo; en talleres españoles el cliente responde por
   WhatsApp. Requiere proveedor con API oficial (Meta Cloud API o un intermediario), plantillas aprobadas y coste por
   mensaje. Cuidado: es comunicación por cuenta del taller (consentimiento), igual que los correos actuales.
3. **Presupuesto aprobado y factura pagada desde el móvil del cliente.** Aprobación con firma desde el portal y
   enlace de pago (Stripe con cuenta del taller o Bizum/transferencia con confirmación). Reduce el «ya pasaré a pagar» y
   acelera el cobro. Hay que ver qué parte del portal actual ya aprueba presupuestos antes de diseñarlo.
4. **Reserva de cita online.** Un enlace/widget para la web del taller donde el cliente elige servicio y hueco libre
   (según la capacidad de la agenda). Capta clientes a cualquier hora y rellena la agenda.
5. **Alta rápida por matrícula.** Escribir la matrícula y autocompletar marca, modelo, año y bastidor. Evita errores y
   acelera la recepción. Necesita proveedor de datos de matrículas de pago (coste por consulta).

### Nivel 2 — profesionaliza el taller por dentro
6. **Servicios predefinidos y paquetes** («revisión 30.000 km», «cambio de pastillas») con mano de obra, recambios y
   precio cerrado; presupuestar en 20 segundos.
7. **Compras y proveedores:** pedidos a proveedores, albaranes de entrada, stock mínimo con aviso de reposición,
   histórico de precios de compra (alimenta la rentabilidad). Más adelante, catálogo de recambios por vehículo
   (TecDoc u otro) y pedido a distribuidores.
8. **Cobros y contabilidad:** pagos parciales, pendientes de cobro y vencimientos, cierre de caja diario, factura
   agrupada mensual para flotas y exportación a la gestoría (A3, Sage, Contasol) con los resúmenes trimestrales.
9. **Productividad del taller:** tiempo real frente a baremo por tarea y por mecánico (ya se guarda `duracionMin`),
   carga por mecánico y por elevador en la agenda, eficiencia y horas facturadas frente a horas trabajadas.
10. **Reputación y fidelización:** petición automática de reseña en Google tras la entrega, encuesta de satisfacción,
    campañas por segmentos desde el CRM (clientes dormidos, ITV próxima, oferta de neumáticos).
11. **Flotas B2B** (el producto se anuncia para talleres y gestores de flota): portal para el responsable de flota con
    varios usuarios, coste total por vehículo, informes de mantenimiento, vehículo de sustitución, contratos y
    garantías de reparaciones.
12. **Extras de taller:** hotel de neumáticos, control de garantías de reparación y recalls, pre-ITV.

### Nivel 3 — a medio plazo, cuando haya clientes
13. **Mecánico:** modo sin conexión de verdad, dictado por voz de notas, escaneo de QR de la orden y OCR de la ficha
    técnica del coche.
14. **IA** (con cuidado legal): resumen de la reparación en lenguaje claro para el cliente, ayuda a presupuestar,
    transcripción de voz. Si se añade, hay que revisar el artículo 50 del Reglamento de IA y la política de privacidad.
15. **Multi-sede, API pública y webhooks, integraciones** (Google Calendar, contabilidad). Se decidió no hacerlo hasta
    que haya demanda real; sigue valiendo.

### Cimientos que sostienen todo lo anterior (hacer en paralelo, no al final)
- Copias de seguridad con recuperación a un punto, entorno de pruebas separado, integración continua, ESLint, CSP.
- **Exportación completa de datos** (portabilidad) en un solo botón: ya hay CSV por pantalla; falta el paquete completo.
- **Registro de actividad visible** («quién cambió qué y cuándo») por orden y por cliente: confianza y defensa ante
  discusiones con el cliente.
- **Ayuda dentro de la app** (vídeos cortos, centro de ayuda, chat o formulario de soporte) y **métricas de uso sin
  datos personales** para saber qué funciones se usan y dónde abandona la gente al probar.
- **Migración asistida** desde el programa anterior del taller (ya hay importación CSV; es el mayor freno a cambiar).

### Recomendación de orden
1. Cimientos mínimos antes del primer cliente real: copias de seguridad, entorno de pruebas, integración continua.
2. Inspección digital → presupuesto con aprobación y pago desde el móvil (forman un solo flujo y son lo más visible).
3. WhatsApp y reserva online (captación y comunicación).
4. Servicios predefinidos, compras y exportación a gestoría.
5. Productividad, reputación y flotas, según lo que pidan los primeros talleres.

Tamaños orientativos (una persona + Claude): inspección digital 1-2 semanas; pago y aprobación online 1 semana;
reserva online 1 semana; WhatsApp 1-2 semanas (más el alta del proveedor); servicios predefinidos 3-4 días;
compras/proveedores 2 semanas; exportación a gestoría 1 semana por formato.
