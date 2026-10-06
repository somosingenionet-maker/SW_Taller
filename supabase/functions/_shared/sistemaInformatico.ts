// Identificación del sistema informático de facturación (SIF) que figura en
// CADA registro enviado a la AEAT y en la Declaración Responsable. La misma
// información vive en src/legal/sistemaInformatico.ts para mostrarla en la app;
// un test comprueba que ambas copias coinciden.
//
// Los datos del productor (quien fabrica y comercializa el software) son los
// que ya figuran en la Política de Privacidad. La fecha de firma de la
// declaración la pone su titular al firmarla: mientras esté como PENDIENTE la
// página de la declaración se muestra como borrador.

export const PRODUCTOR = {
  /** Razón social o nombre y apellidos del productor. */
  nombreRazon: 'Oscar Daniel Sánchez Saenz',
  /** NIF del productor (9 caracteres). */
  nif: 'Y5483982Z',
  /** Dirección postal completa de contacto. */
  domicilio: 'Calle Doctor Sapena 68, Elche (Alicante), España',
  /** Localidad donde se firma la Declaración Responsable. */
  lugarFirma: 'Elche (Alicante)',
  /** Fecha de firma de la declaración de ESTA versión (AAAA-MM-DD), o PENDIENTE. */
  fechaFirma: 'PENDIENTE',
  /** Persona que firma (nombre y apellidos). */
  firmante: 'Oscar Daniel Sánchez Saenz',
  telefono: '+34 696 722 198',
  correo: 'hola@doonty.com',
  web: 'https://doonty.com',
} as const;

export const SISTEMA = {
  nombre: 'Doonty Motor',
  /** Código del sistema asignado por el productor: 2 caracteres (letras o dígitos). */
  id: 'DM',
  /** Versión completa certificada: cada versión nueva exige su propia declaración responsable. */
  version: '1.0.0',
  /** Solo puede funcionar en modalidad VERI*FACTU (envío a la AEAT). */
  soloVerifactu: 'S' as const,
  /** Permite llevar la facturación de varios obligados tributarios (multi-taller). */
  multiOT: 'S' as const,
  /** Hoy se utiliza para varios obligados a la vez. */
  indicadorMultiplesOT: 'S' as const,
} as const;

/** ¿Están los datos que exige el envío a la AEAT (nombre y NIF del productor)? */
export function productorCompleto(): boolean {
  const ok = (s: string) => s.trim() !== '' && s.trim().toUpperCase() !== 'PENDIENTE';
  return ok(PRODUCTOR.nombreRazon) && /^[A-Z0-9]{9}$/i.test(PRODUCTOR.nif.trim());
}

/** ¿Está la Declaración Responsable lista para publicarse como firmada (con su fecha de firma)? */
export function declaracionCompleta(): boolean {
  return productorCompleto() && /^\d{4}-\d{2}-\d{2}$/.test(PRODUCTOR.fechaFirma);
}
