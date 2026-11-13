// Permisos por módulo en las Edge Functions. Es la misma regla que `tiene_modulo()` en la base de
// datos: los administradores tienen todos los módulos; un usuario normal solo los de su lista; un
// usuario inactivo, ninguno. (El super administrador no usa estas funciones de empresa.)

export type PerfilModulos = { rol?: string | null; modulos?: string[] | null; activo?: boolean | null } | null | undefined;

/** ¿Puede este perfil usar el módulo? */
export function perfilTieneModulo(perfil: PerfilModulos, modulo: string): boolean {
  if (!perfil || perfil.activo === false) return false;
  if (perfil.rol === 'admin' || perfil.rol === 'super_admin') return true;
  return Array.isArray(perfil.modulos) && perfil.modulos.includes(modulo);
}

export function mensajeSinModulo(nombre: string): string {
  return `Tu usuario no tiene acceso al módulo ${nombre}. Pídele a un administrador del taller que te lo active.`;
}
