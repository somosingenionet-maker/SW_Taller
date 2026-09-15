import { test, expect } from '@playwright/test';
import { login, credencialesE2E } from './helpers';

test('login: credenciales correctas entran a la app', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).toBeVisible();
});

test('login: credenciales incorrectas muestran un error y no entran', async ({ page }) => {
  const { email } = credencialesE2E();
  await page.goto('/');
  await page.getByPlaceholder('usuario@empresa.net').fill(email);
  await page.getByPlaceholder('••••••••').fill('contraseña-incorrecta-a-propósito');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByText('Credenciales incorrectas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Taller', exact: true })).not.toBeVisible();
});
