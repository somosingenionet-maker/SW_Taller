# Rediseño del front de Doonty — plan por fases (2026-11-22)

## Estado (2026-11-18)
- **Fases 0 y 1 hechas en local, sin subir** (pendiente de que Daniel las vea y confirme el commit/push). Aprobadas por Daniel: «Sí, empieza con las fases 0 y 1».
- Hecho: fuentes alojadas (`public/fonts`, caché larga en `vercel.json`), `src/ui/` (tokens y estilos `ui.css`, componentes base, color por taller `colorMarca.ts`, menú/«Nuevo»/buscador `navegacion.ts`, marco `Marco.tsx`, buscador `Buscador.tsx`, `ColorYAspecto.tsx`, interruptor `disenoNuevo.ts`), `App.tsx` con interruptor (`?ui=nuevo|actual` o botón «Probar el nuevo diseño» en el pie, solo administradores) y `intencion` en las seis pestañas (Nuevo / buscar).
- Pruebas: 22 vitest de `src/ui`, 6 e2e en `e2e/nuevo-diseno.spec.ts` (no guardan nada en el taller de pruebas).
- Sigue pendiente: logo vector del cohete (marca provisional en `.u-logo-marca`); modo oscuro NO se ofrece hasta la fase 4; los banners de suscripción/pago aún llevan el estilo antiguo dentro del marco nuevo (fase 3).

Maqueta de referencia (la que aprobó Daniel): https://claude.ai/artifact/4b8JBZsM8EcWsek2868zkT

## Qué se cambia y qué no
**Cambia (solo front):** estructura de pantallas, navegación, componentes, colores, tipografía, textos de la interfaz.
**No cambia:** la base de datos, las funciones del servidor, las reglas de negocio, la capa de datos (`src/lib/data/*`), los portales
externos (cliente, mecánico, reserva, mi cita: ya tienen su diseño propio; solo se alinean los colores al final).

## Decisiones ya tomadas (de las conversaciones y la maqueta)
- Mezcla de tres ideas: **«Hoy primero»** (inicio = lista de lo que toca) + **tablero del taller con matrícula** (se mantiene: SW_2M no lo tiene) +
  **orden guiada paso a paso**.
- Menú **con texto** (barra lateral en ordenador, barra inferior en móvil), **buscador `Ctrl K`** y botón **«Nuevo»**.
- **Nada de paneles que se abren a la derecha**: los detalles salen en una **ventana centrada y amplia** (pantalla completa en móvil).
- Fondo **gris muy claro** (nada de beige), tarjetas blancas, modo oscuro gris neutro.
- Naranja de Doonty = logo y color por defecto. **Cada taller elige su color** (9 colores preparados + libre, con contraste comprobado);
  los **colores de estado nunca cambian**.
- Tipografías: Bricolage Grotesque (títulos) y Figtree (texto), matrícula en Barlow Condensed.

## Cómo se hace sin dejar la aplicación a medias
1. **Interruptor «nuevo diseño»** (solo front, se guarda en el navegador): durante las fases 1-3 conviven la interfaz actual y la nueva; el
   administrador puede activar la nueva con un botón en el pie. Se sube a producción sin riesgo y se prueba con datos reales.
2. En la fase 4 se hace la nueva interfaz la única, se borra el código viejo y el interruptor.
3. Cada fase termina con **todas las pruebas en verde** (tsc, vitest, e2e) y con unas **capturas de revisión** (claro, oscuro, móvil) que Daniel aprueba
   antes de seguir. Nada se sube sin su confirmación, como siempre.

## Fase 0 · Preparación (corta)
- Congelar funciones nuevas mientras dure el rediseño (solo errores).
- Fuentes **alojadas en el propio proyecto** (archivos woff2 de licencia libre) en vez de cargarlas desde Google: evita enviar la IP de cada usuario a un tercero
  (asunto de privacidad) y funciona sin conexión en la app instalable.
- Necesito de Daniel: **el logo en vector** (SVG o PNG grande) del cohete de Doonty.
- Inventario de pantallas y de pruebas e2e que tocan cada una.
**Salida:** logo y fuentes en el repo; lista de pantallas por fase acordada.

## Fase 1 · Cimientos (tamaño: grande, una tanda)
- **Tokens de diseño** (`src/ui/tokens`): colores (neutros, estados, marca), radios, sombras, espaciados, tipografías, claro / oscuro / automático.
- **Color por taller**: la lógica de la maqueta (contraste mínimo 4,5:1; oscurece el tono o pone el texto oscuro) pasa a la app; selector en «Color y aspecto»
  (hoy ya existe `brand_color` en la empresa, no hace falta tocar la base de datos).
- **Componentes base** (`src/ui/`): botón, tarjeta, etiqueta de estado, **matrícula**, ventana centrada, campo de formulario, tabla, estado vacío, aviso,
  pestañas/segmentos, tarjeta de acción. Accesibles de serie (foco visible, teclado, nombres para lectores de pantalla).
- **Nuevo marco de la aplicación**: menú con texto + barra inferior en móvil, buscador global (`Ctrl K`: matrículas, clientes, órdenes), botón «Nuevo»,
  contadores (alertas, pagos), pie sencillo. Menú por tareas: Hoy · En el taller · Citas · Clientes · Dinero · Compras y stock · Ajustes.
- **Interruptor de nuevo diseño** (solo para administradores).
**Salida:** la aplicación abre con el marco nuevo y los componentes base, y las pantallas antiguas dentro (con el estilo nuevo en lo básico). e2e en verde.

## Fase 2 · Día a día del taller (tamaño: la más grande, 3 tandas)
**2a · Hoy** (350 líneas hoy): lista de cosas por hacer con datos que ya existen (coches listos, presupuestos sin respuesta, pagos a proveedores,
facturas vencidas, alertas, citas del día) y accesos rápidos.
**2b · Taller** (`OrdenesTrabajoTab`, 2.667 líneas: el mayor riesgo):
  - Se divide en trozos: tablero, lista, ventana de la orden, recepción, líneas, presupuesto, inspección, firma, cobro.
  - **Tablero** con matrícula, arrastrar entre columnas y botón del siguiente paso (respetando las reglas actuales de cambio de estado y los estados
    intermedios: enviado, notificado, «técnico terminó»).
  - **Orden paso a paso** en ventana centrada: pasos, siguiente acción, tareas, historial, fotos, inspección, firmas, WhatsApp.
  - Formularios de edición con los componentes nuevos.
**2c · Citas** (`AgendaTab`, 1.132 líneas): día / semana / mes, citas online, confirmar / cancelar / convertir en orden, WhatsApp.
**Salida:** el flujo completo «recibir coche → presupuesto → reparar → avisar → entregar → cobrar» y la agenda funcionan en el nuevo diseño. e2e de taller y
agenda actualizados.

## Fase 3 · Resto de pantallas (tamaño: grande, 3 tandas)
- **Clientes y vehículos** (`CrmTab` 1.069 + `VehiclesTab` 873): una sola ficha de cliente con sus vehículos, historial, alertas y notas (hoy son dos mundos).
- **Dinero:** facturas (1.006), cobros, exportación para la gestoría, rentabilidad (421).
- **Compras y stock:** compras, proveedores, por pagar, inventario (514) y alertas (317).
- **Ajustes:** empresa, equipo (AdminPanel), VeriFactu, reservas online, inspección, suscripción, seguridad.
- **Entrada:** pantalla de acceso y de registro, restablecer contraseña.
**Salida:** ninguna pantalla con el estilo antiguo. e2e en verde.

## Fase 4 · Cierre y pulido (tamaño: media, 1-2 tandas)
- Modo oscuro revisado pantalla a pantalla; contraste y teclado; lectores de pantalla.
- Revisión en 360, 390, 768, 1024 y 1440 px; tableta en el taller.
- Rendimiento: tamaño de cada pantalla, carga diferida, sin saltos al cargar.
- Alinear portales externos y páginas legales con los mismos tokens.
- Quitar la interfaz antigua y el interruptor; actualizar documentación y pruebas; informe final con capturas.

## Tamaño y ritmo (estimación honesta)
Es el mayor cambio hasta ahora: unas **17.700 líneas de pantallas** y **21 ficheros e2e (434 comprobaciones)**. Calculo del orden de **10-12 tandas** de
trabajo, cada una subida y probada por separado (la fase 2 es la mitad del esfuerzo, sobre todo por la orden de trabajo). No es una estimación en días:
depende de cuántos ajustes pidas tras ver cada tanda. Si algo se alarga, siempre queda una aplicación que funciona.

## Riesgos y cómo se controlan
| Riesgo | Control |
|---|---|
| Romper un flujo del taller (sobre todo la orden de trabajo) | Interruptor para convivir con la interfaz actual; dividir `OrdenesTrabajoTab` antes de rediseñarlo; e2e de cada flujo antes y después |
| Pruebas e2e dependen de nombres de botones | Mantener `data-testid` y nombres accesibles; actualizar a propósito lo que cambie de verdad |
| Cansancio de revisar tantas pantallas | Cada tanda trae capturas claro / oscuro / móvil y una lista de qué probar tú |
| Colores libres ilegibles | Contraste calculado y corregido automáticamente (ya probado en la maqueta) |
| Fuentes y privacidad | Fuentes alojadas en el proyecto, no desde Google |
| Parecido con SW_2M | Identidad propia (paleta, tipografía, componentes, navegación) y componentes reescritos; **aun así, lo contractual lo debe revisar el abogado** |

## Lo que necesito de Daniel
1. El logo en vector del cohete (o el mejor archivo que tengas).
2. Confirmar: ¿**interruptor de convivencia** (recomendado) o prefieres rehacerlo todo en una rama y cambiar de golpe al final?
3. Confirmar: ¿**fusionar Clientes y Vehículos** en una sola ficha (recomendado)?
4. Menú propuesto: Hoy · En el taller · Citas · Clientes · Dinero · Compras y stock · Ajustes. ¿Algún nombre que cambiarías?
5. Aprobar la fase 0 y la fase 1 para empezar.
