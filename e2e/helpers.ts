import { Page, expect } from '@playwright/test';

/** Menú principal de la aplicación (barra lateral en escritorio). */
export const menuPrincipal = (page: Page) => page.getByRole('navigation', { name: 'Menú principal', exact: true });

export type Seccion = 'Hoy' | 'En el taller' | 'Citas' | 'Clientes' | 'Vehículos' | 'Alertas' | 'Facturas' | 'Rentabilidad' | 'Compras' | 'Inventario';

/** Pulsa una sección del menú (el nombre puede llevar un contador detrás, p. ej. «Alertas 52»). */
export async function irA(page: Page, seccion: Seccion) {
  await menuPrincipal(page).getByRole('button', { name: new RegExp(`^${seccion}`) }).click();
}

/** Abre una opción del menú de la cuenta (Seguridad de la cuenta, Configuración de empresa, Panel de administración…). */
export async function abrirDesdeCuenta(page: Page, opcion: string) {
  await page.getByTestId('menu-cuenta').click();
  await page.getByRole('menuitem', { name: opcion }).click();
}

export function credencialesE2E() {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Faltan E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — define .env.e2e.local (ver playwright.config.ts).',
    );
  }
  return { email, password };
}

/** Inicia sesión con el admin del tenant de pruebas y espera a que cargue la app. */
export async function login(page: Page) {
  const { email, password } = credencialesE2E();
  await page.goto('/');
  await page.getByPlaceholder('usuario@empresa.net').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  // El menú solo se ve tras cargar la empresa y el usuario: confirma que el login realmente terminó.
  await expect(menuPrincipal(page).getByRole('button', { name: /^En el taller/ })).toBeVisible({ timeout: 15_000 });
}
