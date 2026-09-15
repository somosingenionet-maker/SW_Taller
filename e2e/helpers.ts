import { Page, expect } from '@playwright/test';

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
  // La navegación por iconos (riel lateral) solo se ve tras cargar la
  // empresa y el usuario — confirma que el login realmente terminó.
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible({ timeout: 15_000 });
}
