/**
 * Teléfono listo para wa.me: solo dígitos y con prefijo de país. Un móvil o fijo español de 9 dígitos
 * sin prefijo («644 09 50 97») recibe el 34 — sin él WhatsApp no encuentra el número y el chat no abre.
 * Un «00» internacional se quita; cualquier otro número (ya con prefijo) se deja como está.
 */
export function telefonoWhatsApp(telefono: string | undefined | null): string {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.startsWith('00')) return digitos.slice(2);
  return /^[6-9]\d{8}$/.test(digitos) ? `34${digitos}` : digitos;
}
