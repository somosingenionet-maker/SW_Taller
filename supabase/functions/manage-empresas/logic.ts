// Lógica pura de manage-empresas, separada de index.ts para poder testearla
// con `deno test` sin arrancar el servidor HTTP (Deno.serve se ejecuta al
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

// Única puerta de autorización de esta función: crea y borra tenants
// enteros (usuarios de Auth incluidos), así que solo un super_admin puede
// pasar por aquí. Un fallo aquí permitiría a un admin de un taller borrar
// otro taller.
export function esSuperAdmin(rol: string | null | undefined): boolean {
  return rol === 'super_admin';
}
