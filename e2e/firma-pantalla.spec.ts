import { test, expect } from '@playwright/test';
import { login } from './helpers';

// Firma en pantalla: lo que se comprueba aquí es la pantalla (texto, nombre propuesto y cuándo se
// habilita «Confirmar firma»), SIN firmar nada: una firma guardada es inmutable y dejaría basura en
// el tenant de pruebas. El guardado y la inmutabilidad se prueban en la base de datos
// (supabase/migrations/20261113130000_firma_ordenes.sql) y con una orden de prueba aparte.

test('firma del presupuesto: el botón solo se habilita con acuerdo, nombre y una firma de verdad', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await login(page);
  await page.getByRole('button', { name: 'Taller', exact: true }).click();
  const buscada = page.waitForResponse((r) => r.url().includes('/rpc/buscar_ordenes') && (r.request().postData() ?? '').includes('OT-TST-03'), { timeout: 15000 });
  await page.getByPlaceholder('Buscar por número, matrícula o cliente...').fill('OT-TST-03');
  await buscada;
  await page.locator('table tbody tr').first().click();
  const bloque = page.getByTestId('firmas-orden');
  await expect(bloque).toBeVisible({ timeout: 15000 });
  await bloque.getByRole('button', { name: 'Firmar presupuesto en pantalla' }).click();

  const modal = page.getByRole('dialog', { name: 'Firma del presupuesto' });
  await expect(modal.getByTestId('texto-firma')).toContainText('importe de 36,30 € (IVA incluido)');
  await expect(modal.getByLabel('Nombre de quien firma')).not.toHaveValue('');
  const confirmar = modal.getByRole('button', { name: 'Confirmar firma' });
  await expect(confirmar).toBeDisabled();

  await modal.getByText('He leído el texto y estoy de acuerdo.').click();
  await expect(confirmar).toBeDisabled(); // falta la firma

  const caja = (await modal.getByTestId('lienzo-firma').boundingBox())!;
  await page.mouse.click(caja.x + 30, caja.y + 30); // un toque suelto no es una firma
  await expect(confirmar).toBeDisabled();
  await page.mouse.move(caja.x + caja.width * 0.1, caja.y + caja.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(caja.x + caja.width * (0.1 + i * 0.04), caja.y + caja.height * (0.5 + 0.2 * Math.sin(i / 3)));
  await page.mouse.up();
  await expect(confirmar).toBeEnabled();

  await modal.getByLabel('Nombre de quien firma').fill(' ');
  await expect(confirmar).toBeDisabled(); // sin nombre no se firma

  // «Borrar y repetir» limpia el recuadro; cancelar no guarda nada.
  await modal.getByRole('button', { name: 'Borrar y repetir' }).click();
  await modal.getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal).toBeHidden();
  await expect(bloque).toContainText('Sin firmar.');
});
