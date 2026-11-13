# Pasar el cobro de Doonty Motor de Stripe «modo pruebas» a «modo real»

Todo lo que hay hoy está probado **en modo pruebas** (pago, cancelación, fin de prueba, tarjeta
rechazada, reactivación). El modo real es una cuenta de Stripe distinta: **hay que repetir la
configuración**, no se copia. Los pasos 2 a 6 son del panel de Stripe y de Supabase y los haces tú
(las claves no pasan por el chat). Marca cada casilla al terminar.

## 0. Antes de tocar nada

- [ ] **Facturas a los talleres.** Los recibos de Stripe **no son facturas VERI\*FACTU**. Con cada
  suscripción cobrada, tú (InGenio) tienes que emitir tu propia factura al taller. Habla con tu
  gestor de cómo (la idea: usar Doonty Motor como empresa emisora) y desde qué fecha te obliga
  VERI\*FACTU. Sin esto, cobrar es fácil y facturar bien no lo es.
- [ ] **Textos legales revisados** (ver `docs/revision-legal-para-el-abogado.md`), sobre todo
  conservación de datos, firma y avisos automáticos. No es obligatorio para cobrar, pero con dinero
  real de por medio conviene.
- [ ] **Decidir qué pasa con las pruebas abandonadas** (hoy no se borra nada solo).

## 1. Activar la cuenta de Stripe

- [ ] Completar la verificación: identidad, datos del negocio y **cuenta bancaria** donde cobrar.
- [ ] Mantener la opción **«Elige lo que necesitas»** (NO Managed Payments), como en pruebas.
- [ ] Activar el interruptor de **modo real** (arriba a la derecha). Todo lo siguiente se hace con
  ese interruptor puesto en real.

## 2. Producto y precios (modo real)

- [ ] Crear el producto «Doonty Motor».
- [ ] Precio **mensual**: 89 € cada mes. Anotar su id (`price_...`).
- [ ] Precio **anual**: 961,20 € cada año (10 % de descuento). Anotar su id.
- [ ] **No** activar Stripe Tax ni «cobrar impuestos automáticamente»: el IVA se añade con una tasa
  fija; activarlo a la vez cobraría el IVA dos veces.

## 3. Tasa de IVA (modo real)

- [ ] Crear una **tasa de impuesto** «IVA 21 %», España, **exclusiva** (se suma al precio). Anotar su
  id (`txr_...`).

## 4. Portal de clientes (modo real)

- [ ] Activar el portal: permitir **cancelar la suscripción al final del periodo**, actualizar el
  método de pago y ver facturas.
- [ ] Enlaces legales: política de privacidad `https://motor.doonty.com/privacidad` y términos
  `https://motor.doonty.com/terminos`.
- [ ] Revisar los **correos que manda Stripe** (cobro fallido, recibos): son lo que el taller ve si
  falla una renovación. Stripe → Configuración → Facturación → correos automáticos.

## 5. Webhook (modo real)

- [ ] Crear un endpoint en Stripe → Desarrolladores → Webhooks:
  `https://newzcdgpshoptohtxxar.supabase.co/functions/v1/stripe-webhook`
- [ ] Eventos que debe recibir (exactamente estos 6):
  `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`.
- [ ] Copiar su **secreto de firma** (`whsec_...`).

## 6. Clave de acceso restringida (modo real)

- [ ] Stripe → Desarrolladores → Claves de API → **crear clave restringida** con solo estos permisos
  de escritura: **Checkout Sessions** y **Customer portal**. Nada más. Copiar la clave (`rk_live_...`).

## 7. Secretos en Supabase (los pegas tú)

En Supabase → Edge Functions → Secrets, **sustituir** los de pruebas por los reales:

| Secreto | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | la clave restringida `rk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | el `whsec_...` del webhook **real** |
| `STRIPE_PRICE_MENSUAL` | el `price_...` mensual real |
| `STRIPE_PRICE_ANUAL` | el `price_...` anual real |
| `STRIPE_TAX_RATE_IVA` | el `txr_...` real |
| `APP_URL` | `https://motor.doonty.com` |

Si tras guardarlos algo sigue usando el valor viejo, hay que volver a desplegar `billing` y
`stripe-webhook` (se lo pides a Claude).

## 8. Primera suscripción real (con cuidado)

- [ ] La hace **el propio Daniel** con un taller de prueba. Opción barata: crear en Stripe un
  **cupón del 100 %** y usarlo en el pago, así se prueba todo el circuito sin cobrar. Si prefieres
  cobrar de verdad, se puede **reembolsar** después desde el panel de Stripe.
- [ ] Comprobar en Stripe → Webhooks que los eventos salen con **✓ 200**.
- [ ] Comprobar en la aplicación: el panel de suscripción dice «Activa», con su próxima renovación.
- [ ] Cancelar desde «Gestionar suscripción» y comprobar que dice «termina el …».
- [ ] Borrar el taller de prueba desde el panel de super administrador.

## Probar el fallo de una RENOVACIÓN (en modo pruebas, antes del modo real)

Es lo único del cobro que nunca se ha visto con Stripe de verdad (solo está probado por código).
Con el interruptor en **modo pruebas**. Hay dos niveles; el A basta para ver el aviso, el B prueba
también la recuperación.

**A. Ver que el aviso de impago llega a la aplicación (10 minutos)**

1. Crear un taller de prueba y suscribirse con la tarjeta `4242 4242 4242 4242`.
2. En Stripe → Clientes → ese cliente → **Métodos de pago** → añadir la tarjeta
   **`4000 0000 0000 0341`** (se acepta al guardarla pero **falla al cobrar**) y marcarla como
   predeterminada.
3. En ese mismo cliente: **Crear factura** (importe pequeño, cobro automático) y finalizarla. El cobro
   falla y Stripe manda `invoice.payment_failed`.
4. Esperado en la aplicación: aviso **«No hemos podido cobrar tu suscripción. Actualiza tu método de
   pago antes del …»**, y el taller **sigue pudiendo trabajar** hasta esa fecha (un impago nunca
   recorta el acceso).
5. Qué NO se ve aquí: la recuperación. Pagar una factura suelta **no** reactiva la cuenta, a
   propósito (una factura suelta, como un servicio de migración, no es una renovación). La
   recuperación real ocurre cuando Stripe reintenta el cobro de la **renovación** con una tarjeta
   buena.

**B. Prueba completa con reloj de prueba (30 minutos, necesita a Claude)**

Un cliente solo puede colgarse de un reloj de prueba **al crearse**, y la aplicación crea los clientes
ella misma, así que esta prueba se monta a mano:

1. Crear un taller de prueba con `/registro` (sin suscribirse).
2. En Stripe → **Relojes de prueba** → crear uno. Dentro de ese reloj crear un **cliente** con la tarjeta
   `4000 0000 0000 0341` y una **suscripción** al precio mensual con **prueba gratuita de 1 día** (así el
   primer cobro, que fallará, ocurre al adelantar el reloj).
3. Pasarle a Claude el id del cliente (`cus_...`) y el de la suscripción (`sub_...`): él los enlaza al
   taller de prueba en la base de datos.
4. **Adelantar el reloj** 2 días: Stripe intenta cobrar y falla → aparece el aviso de impago.
5. Cambiar el método de pago del cliente a `4242 4242 4242 4242` y pagar la factura pendiente → el
   aviso desaparece y el estado vuelve a «Activa» con su próxima renovación.
6. Borrar el taller de prueba desde el panel de super administrador.

Si algo de esto no ocurre así, es un fallo: avisa a Claude con lo que ves en pantalla.

## Volver atrás

Si algo sale mal en modo real: poner de nuevo los secretos de **pruebas** en Supabase (paso 7).
Las empresas que ya se hubieran suscrito con dinero real conservan su estado en la base de datos;
no se pierde nada.
