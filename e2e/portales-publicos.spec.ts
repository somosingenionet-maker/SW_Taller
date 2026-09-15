import { test, expect } from '@playwright/test';

// Portales públicos: no necesitan sesión, se identifican solo por el token
// en la URL. Con un token inválido, ambos deben mostrar un mensaje de error
// claro en vez de una pantalla en blanco o un crash — es lo primero que
// vería un cliente/técnico si el enlace que le mandaron está mal copiado.

test('Portal del Cliente: token inválido muestra un mensaje de error, no una pantalla en blanco', async ({ page }) => {
  await page.goto('/portal/token-que-no-existe');
  await expect(page.getByText('Este enlace no es válido')).toBeVisible({ timeout: 10_000 });
});

test('Portal del Mecánico: token inválido muestra un mensaje de error, no una pantalla en blanco', async ({ page }) => {
  await page.goto('/mecanico/token-que-no-existe');
  await expect(page.getByText('Este enlace no es válido')).toBeVisible({ timeout: 10_000 });
});
