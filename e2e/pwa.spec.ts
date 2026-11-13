import { test, expect } from '@playwright/test';

// App instalable: el manifiesto y los iconos existen y son válidos; con el service worker activo
// (solo en producción: en desarrollo no se registra) abrir la aplicación sin conexión enseña la
// pantalla «Sin conexión» en vez del error del navegador.

test('el manifiesto y los iconos son válidos y se pueden descargar', async ({ request, page }) => {
  const r = await request.get('/manifest.webmanifest');
  expect(r.ok()).toBe(true);
  const m = await r.json();
  expect(m.name).toBe('Doonty Motor');
  expect(m.display).toBe('standalone');
  expect(m.start_url).toBe('/');
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icono of m.icons as { src: string; type: string }[]) {
    const ri = await request.get(icono.src);
    expect(ri.ok(), icono.src).toBe(true);
    expect(ri.headers()['content-type']).toContain(icono.type);
  }
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0f172a');
});

test('el service worker y la pantalla sin conexión se sirven como JavaScript y HTML', async ({ request }) => {
  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBe(true);
  expect(sw.headers()['content-type']).toMatch(/javascript/);
  const off = await request.get('/offline.html');
  expect(off.ok()).toBe(true);
  expect(await off.text()).toContain('Sin conexión');
});

test('sin conexión, la aplicación enseña «Sin conexión» y al volver la red funciona', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  // En desarrollo no hay service worker registrado: la comprobación no aplica.
  const registrado = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    return await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 6000))]);
  });
  test.skip(!registrado, 'Sin service worker (servidor de desarrollo): solo se comprueba en una versión compilada.');

  await page.reload(); // ya bajo el control del service worker
  await expect(page.getByPlaceholder('usuario@empresa.net')).toBeVisible({ timeout: 15_000 });

  await context.setOffline(true);
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible({ timeout: 10_000 });

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByPlaceholder('usuario@empresa.net')).toBeVisible({ timeout: 15_000 });
});
