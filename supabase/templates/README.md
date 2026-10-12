# Plantillas de correo de Supabase Auth (Doonty Motor)

Supabase no lee estos archivos solo: hay que pegarlos a mano en
**Supabase → Authentication → Emails → Templates** (un archivo por pestaña, con su asunto).
Al ser HTML con estilos en línea y tablas, se ve igual en Gmail, Outlook y móvil.
Las variables `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` y `{{ .Token }}` las rellena Supabase.

| Pestaña de Supabase | Archivo | Asunto |
|---|---|---|
| Reset password | `recovery.html` | Restablece tu contraseña de Doonty Motor |
| Invite user | `invite.html` | Te han invitado a Doonty Motor |
| Confirm sign up | `confirmation.html` | Confirma tu correo en Doonty Motor |
| Magic link | `magic_link.html` | Tu enlace de acceso a Doonty Motor |
| Change email address | `email_change.html` | Confirma tu nuevo correo en Doonty Motor |
| Reauthentication | `reauthentication.html` | Tu código de verificación de Doonty Motor |

Nota: `config.toml` no apunta a estos archivos a propósito. Un `supabase config push` aplicaría
también el resto de ese archivo (valores de desarrollo) sobre producción.
