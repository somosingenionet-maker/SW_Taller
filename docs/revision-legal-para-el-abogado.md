# Doonty Motor: qué debe revisar un abogado

**Producto:** Doonty Motor (motor.doonty.com), aplicación web para talleres mecánicos. La edita InGenio
(Daniel Sánchez). **Quién es quién:** cada taller es el *responsable del tratamiento* de los datos de sus
propios clientes y vehículos; Doonty actúa como *encargado del tratamiento*. Doonty es además
*responsable* de los datos de las cuentas de los talleres. Ámbito: España. Nada de lo que sigue lo ha
revisado hasta ahora un profesional.

## 1. Textos publicados (ya visibles en la web)

| Dónde | Qué es | Fecha |
|---|---|---|
| `/privacidad` | Política de privacidad (12 apartados) | 13-oct-2026 |
| `/terminos` | Términos de uso (15 apartados; el 8 trata prueba, precio y cobro; el 12, cancelación) | 13-oct-2026 |
| `/encargo-de-tratamiento` | Contrato de encargo de tratamiento (art. 28 RGPD), 11 apartados, incorporado a los Términos sin firma aparte | 9-oct-2026 |
| `/declaracion-responsable` | Declaración responsable del sistema informático de facturación (VERI\*FACTU) | **sin firmar** |

Código de los textos: `src/components/LegalPage.tsx`. Los datos del productor de la declaración
responsable están en `src/legal/sistemaInformatico.ts` y la **fecha de firma está en «PENDIENTE»**:
mientras tanto, la página pública muestra «Pendiente de firma» (el envío a la AEAT solo se bloquea si
faltan el nombre o el NIF del productor, no la fecha).

## 2. Textos nuevos que el taller muestra o envía (no están en las páginas legales)

**Firma en pantalla del cliente.** Lo que lee y firma el cliente en el mostrador:

- Presupuesto: «Acepto el presupuesto *{número}* para *{vehículo}* por un importe de *{total}* € (IVA
  incluido) y autorizo la realización de los trabajos descritos.»
- Entrega: «Recibo el vehículo *{vehículo}* y doy mi conformidad con los trabajos de la orden *{número}*.»
- Aviso al pie: «Firma electrónica simple: queda guardada con tu nombre, la fecha y la hora, y ya no
  se puede modificar.»

Qué se guarda: el dibujo de la firma, el nombre escrito, la fecha y hora fijadas por el servidor y, en el
presupuesto, el importe de ese momento. Es inmutable. No se verifica la identidad de quien firma ni se
guarda su documento de identidad.

**Avisos automáticos por correo a los clientes del taller** (ITV, seguro, impuesto, cambio de aceite;
resumen al entregar; último aviso). Los envía Doonty en nombre del taller, solo si el taller activa la
función. Pie de cada correo: «Este es un aviso automático de *{taller}*. … Si prefieres no recibir estos
avisos, responde a este correo y dejaremos de enviártelos.» Las respuestas llegan al correo **del taller**
(no a Doonty), y es el taller quien marca «No enviarle avisos» en la ficha del cliente: **no hay un
enlace de baja que funcione solo.**

**Correo de bienvenida** (plantilla de Supabase): 14 días gratis, sin tarjeta.

**Avisos de borrado de cuenta** (correo a los administradores del taller, desde `send@doonty.com`): primer
aviso y «último aviso», con la fecha exacta de eliminación, qué se pierde («esto no se puede deshacer»),
cómo conservarla (suscribirse) y cómo llevarse los datos (exportar a CSV). Texto en
`supabase/functions/limpiar-empresas/logic.ts` (`construirAviso`).

## 3. Preguntas concretas

1. **Borrado automático de cuentas abandonadas (YA implementado, textos ya actualizados el 13-11-2026).**
   Lo que hace el sistema: una cuenta sin acceso (fin de la prueba o de la suscripción) se **elimina de
   forma definitiva a los 90 días** —cuentas, usuarios, clientes, vehículos, órdenes y fotos—, tras avisar
   por correo a los administradores del taller: primer aviso (entre 30 y 14 días antes como mínimo) y
   último aviso 7 días antes. Nunca se borra sin el último aviso enviado y 3 días de espera tras él. **No se
   borra** una cuenta con facturas emitidas ni con suscripción «activa»: queda en solo lectura. Lo que se
   borra se anota (id, nombre del taller y recuentos, sin datos personales) para poder confirmarlo por
   escrito. Los Términos (§7, §8 y §12) y el Encargo (§4) se han reescrito para que digan exactamente esto
   (antes decían «al menos 90 días… podremos eliminarlos» y «como máximo 90 días»). Preguntas: ¿es
   suficiente este aviso previo? ¿Conviene un plazo o unos avisos distintos? ¿Es correcto retener
   indefinidamente (en solo lectura) las cuentas con facturas emitidas, o debe fijarse un plazo máximo y
   un aviso específico? ¿Hay que conservar la constancia del borrado un tiempo concreto?
2. **Firma en pantalla.** ¿Basta este texto y esta firma electrónica simple como aceptación del
   presupuesto y conformidad de entrega en un taller? ¿Hay requisitos propios de la normativa de
   reparación de vehículos (presupuesto, aceptación, orden de reparación, factura) que deba cumplir
   (contenido, plazo de validez, copia al cliente)? ¿Conviene identificar mejor al firmante, o dar copia
   por correo?
3. **Avisos automáticos.** ¿Son comunicaciones de servicio o comerciales a efectos de la normativa de
   servicios de la sociedad de la información? ¿Es suficiente «responde a este correo» como baja, o hace
   falta un enlace de baja automático? ¿Quién debe responder del consentimiento o la base legal: el taller
   (que lo dice el encargo, §9)?
4. **Notificación de brechas en 48 horas** (Encargo §5): es un compromiso nuestro, más estricto que lo
   exigido al responsable. ¿Es prudente prometerlo?
5. **Subencargados** (Encargo §6): hoy constan Supabase (UE, Frankfurt), Vercel, Resend y Sentry
   (configurado sin datos personales por defecto). ¿Falta alguno? Stripe procesa los datos de cobro de los
   talleres (está en la política de privacidad, no en el encargo). Y **el alojamiento del correo**
   (Hostinger, solo el buzón de soporte). ¿Transferencias internacionales (EE. UU.): basta la redacción
   del apartado 8?
6. **Herramientas de IA en el desarrollo.** El desarrollo de la aplicación usa un asistente de IA (Claude
   Code, de Anthropic) con acceso a la base de datos de producción. Hoy solo hay datos de demostración. Antes
   de tener clientes reales: ¿hay que declararlo como subencargado, o dejar de dar ese acceso? (Decisión
   pendiente de Daniel; lo más sencillo es retirar el acceso cuando entren datos reales.)
7. **Declaración responsable VERI\*FACTU:** ¿el texto cubre lo exigido al productor del sistema? ¿Quién
   debe firmarla y desde qué fecha es obligatoria? (Lo confirmará también el gestor.)
8. **Cobro.** «Unos días» de margen antes de pasar a solo lectura tras un impago (en la práctica 3 días).
   ¿Conviene fijarlos por escrito? ¿Hay algún derecho de desistimiento aplicable a los autónomos que
   contratan? ¿Es válida la cláusula de limitación de responsabilidad (§11)?
9. **Facturas de InGenio a los talleres.** Los recibos de Stripe no son facturas VERI\*FACTU: ¿cómo
   conviene emitirlas? (Con el gestor; ver `docs/pasar-stripe-a-modo-real.md`.)

## 4. Lo que ya está hecho técnicamente (para no preguntarlo)

- Verificación en dos pasos opcional; datos separados por taller en la base de datos; permisos por
  módulo; copias de seguridad (pendiente de plan de pago en Supabase).
- Aceptación de los Términos al registrarse, con su versión (`2026-11-13`).
- Las facturas guardan una copia congelada de los datos del cliente; los datos de contacto se pueden
  anonimizar sin tocar la factura.
- Exportación a CSV de clientes, vehículos, facturas y más, desde la propia aplicación.
