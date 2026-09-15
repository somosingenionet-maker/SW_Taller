// Lógica pura de admin-users, separada de index.ts para poder testearla con
// `deno test` sin arrancar el servidor HTTP (Deno.serve se ejecuta al
// importar index.ts).

// Política mínima de contraseña — debe mantenerse igual que
// src/utils/password.ts (no se puede importar entre proyectos Deno/Vite).
export function errorPassword(password: string): string | null {
  if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Z]/.test(password)) return 'La contraseña debe incluir al menos una mayúscula.';
  if (!/[a-z]/.test(password)) return 'La contraseña debe incluir al menos una minúscula.';
  if (!/[0-9]/.test(password)) return 'La contraseña debe incluir al menos un número.';
  return null;
}

// Puerta de entrada de toda la función: solo admin (de su propia empresa) o
// super_admin pueden gestionar usuarios.
export function esRolAdmin(rol: string | null | undefined): boolean {
  return rol === 'admin' || rol === 'super_admin';
}

// Un admin normal nunca puede tocar usuarios de OTRA empresa; el super admin
// sí puede, como excepción de soporte. Se usa en delete/set_password/set_email.
export function puedeGestionarEmpresa(
  esSuperAdmin: boolean,
  empresaCaller: string | null,
  empresaTarget: string | null,
): boolean {
  return esSuperAdmin || empresaCaller === empresaTarget;
}

// Evita dejar una empresa sin ningún admin: solo bloquea si el usuario a
// eliminar es admin Y no queda ningún OTRO admin en su empresa.
export function esUltimoAdminDeEmpresa(otrosAdminsRestantes: number | null): boolean {
  return !otrosAdminsRestantes;
}
