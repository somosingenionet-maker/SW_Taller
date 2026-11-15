# Reserva de cita online — diseño y puesta en marcha (16-11-2026)

## Qué es
Cada taller tiene una página pública, `motor.doonty.com/reservar/<dirección>`, donde su cliente elige servicio, día, hora y
datos, sin cuenta. La cita entra en la Agenda con la etiqueta «Online». El cliente recibe un correo con un enlace
(`/cita/<token>`) para ver o cancelar su cita; el taller recibe un aviso; el día anterior se recuerda la cita.

## Decisiones de Daniel (15-11-2026)
- Confirmación: la elige cada taller; por defecto automática (al instante) o manual (queda pendiente hasta que el taller la confirme).
- Primera versión: reservar, cancelar con enlace, correos y **recordatorio del día anterior**. Después: reprogramar, calendario (.ics), WhatsApp.
- Anti-robots: límites y campo señuelo **y Cloudflare Turnstile desde el principio**.

## Cómo funciona
- **Configuración** (Ajustes de empresa → Reservas online, solo administradores): activar, dirección pública, horario por día (hasta 3 franjas),
  días cerrados, citas a la vez, antelación mínima, días máximos y tipo de confirmación; tipos de cita con su duración.
- **Huecos:** los calcula siempre el servidor, de 30 en 30 minutos dentro de cada franja, de modo que la cita acabe antes de que cierre; quita
  los días cerrados, lo que cae dentro de la antelación mínima y lo que ya está lleno (citas solapadas ≥ citas a la vez). Todo en hora de Madrid,
  con el cambio de hora.
- **Reservar es atómico:** la función de base de datos toma un bloqueo por taller y recomprueba el hueco; si dos personas piden el último, una recibe
  «ese hueco acaba de ocuparse». Como mucho 2 citas futuras abiertas por teléfono (se comparan los 9 últimos dígitos) o por correo.
- **Seguridad:** la función pública solo expone lo mínimo del taller y solo con las reservas activas; límite por IP; campo señuelo; Turnstile (falla
  cerrado: sin clave configurada, las reservas responden «no disponibles»); lo que manda el navegador se vuelve a validar.
- **Citas online en la Agenda:** etiqueta «Online»; al confirmar o cancelar una cita online desde la Agenda, el cliente recibe un correo.
- **Recordatorio del día anterior:** cron diario (08:00 UTC) a las citas **confirmadas** de mañana con correo conocido, de talleres con los
  recordatorios automáticos activados y clientes sin «No enviarle avisos». Vale también para citas que el taller creó a mano si tienen correo.

## Para poner en marcha (lo hace Daniel, una sola vez)
1. Crear una cuenta gratuita en Cloudflare y, en **Turnstile**, un widget para `motor.doonty.com` (tipo «Managed» o «Invisible»).
2. **Clave del sitio (pública)** → Vercel, variable de entorno `VITE_TURNSTILE_SITE_KEY` (Production) y volver a desplegar la web.
3. **Clave secreta** → Supabase, secreto `TURNSTILE_SECRET_KEY` (Dashboard → Edge Functions → Secrets). No se pega en ningún chat.
Hasta que existan las dos, los talleres pueden configurar sus reservas pero el formulario muestra «no disponible» y no se acepta ninguna reserva.

## Pendiente para el abogado
- Texto de consentimiento del formulario y datos que se recogen (nombre, teléfono, correo, vehículo, matrícula, motivo) como encargado del taller
  (Política de privacidad §3 actualizada). El recordatorio del día anterior y los correos de la reserva son comunicaciones de servicio: misma duda
  que los recordatorios de ITV/aceite.

## Fase 2 (según uso)
Reprogramar desde el enlace, archivo de calendario (.ics) en la confirmación, aviso por WhatsApp, citas por técnico/elevador, capacidad por tipo de cita.
