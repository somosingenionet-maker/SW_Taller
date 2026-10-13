// Validación del formulario público de alta. Pura y probada: es la puerta de entrada de cualquiera
// desde internet, así que se rechaza todo lo que no tenga el formato esperado.
export interface DatosRegistro {
  nombreTaller: string;
  nombre: string;
  email: string;
  nif: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ResultadoValidacion =
  | { ok: true; datos: DatosRegistro }
  | { ok: false; error: string }
  | { ok: false; trampa: true };

export function validarRegistro(body: Record<string, unknown>): ResultadoValidacion {
  // Campo señuelo oculto en el formulario: un humano no lo rellena, un bot sí.
  if (String(body.web ?? '').trim() !== '') return { ok: false, trampa: true };

  const nombreTaller = String(body.nombreTaller ?? '').trim().replace(/\s+/g, ' ');
  const nombre = String(body.nombre ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  const nif = String(body.nif ?? '').trim().toUpperCase().replace(/[\s-]/g, '');

  if (nombreTaller.length < 2 || nombreTaller.length > 80) return { ok: false, error: 'Escribe el nombre de tu taller (entre 2 y 80 caracteres).' };
  if (nombre.length < 2 || nombre.length > 80) return { ok: false, error: 'Escribe tu nombre (entre 2 y 80 caracteres).' };
  if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, error: 'El correo electrónico no es válido.' };
  if (nif !== '' && !/^[A-Z0-9]{8,12}$/.test(nif)) return { ok: false, error: 'El NIF/CIF no parece válido. Puedes dejarlo en blanco y completarlo luego.' };
  if (body.aceptaTerminos !== true) return { ok: false, error: 'Debes aceptar los Términos de Uso, la Política de Privacidad y el contrato de encargo de tratamiento.' };

  return { ok: true, datos: { nombreTaller, nombre, email, nif } };
}

/** ¿El error de Auth significa «ese correo ya tiene cuenta»? (no se le dice al visitante, evita enumerar cuentas) */
export function esCorreoYaRegistrado(error: { status?: number; message?: string; code?: string }): boolean {
  return error.code === 'email_exists' || error.status === 422 || /already.*(registered|exists)/i.test(error.message ?? '');
}
