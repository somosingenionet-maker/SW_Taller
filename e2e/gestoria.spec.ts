import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { login } from './helpers';

// Exportar para la gestoría. La primera prueba es de SOLO LECTURA contra los datos reales del taller de pruebas
// (nunca emite facturas: es irreversible en VeriFactu). La segunda sustituye la lectura de facturas por datos de mentira
// para comprobar el resumen, los avisos y los archivos con importes variados.

async function abrir(page: Page) {
  await login(page);
  await page.getByRole('button', { name: 'Facturas', exact: true }).click();
  await page.getByTestId('exportar-gestoria-abrir').click();
  await expect(page.getByTestId('exportar-gestoria')).toBeVisible();
}

test('gestoría (datos reales): se abre, el borrador no cuenta y un periodo sin facturas se explica', async ({ page }) => {
  await abrir(page);
  await expect(page.getByTestId('resumen-gestoria')).not.toContainText('Leyendo las facturas', { timeout: 15_000 });
  // Un año lejano no tiene facturas: mensaje claro y descargas desactivadas
  await page.getByTestId('exportar-gestoria').getByRole('button', { name: 'Año', exact: true }).click();
  await page.getByLabel('Año', { exact: true }).selectOption(String(new Date().getFullYear() - 5));
  await expect(page.getByTestId('resumen-gestoria')).toContainText('No hay facturas emitidas', { timeout: 15_000 });
  await expect(page.getByTestId('descargar-excel')).toBeDisabled();
  await expect(page.getByTestId('descargar-csv')).toBeDisabled();
  // Fechas al revés: aviso y sin resumen
  await page.getByRole('button', { name: 'Entre fechas' }).click();
  await page.getByLabel('Desde').fill('2026-12-31');
  await page.getByLabel('Hasta').fill('2026-01-01');
  await expect(page.getByRole('alert')).toContainText('Revisa las fechas');
  await expect(page.getByTestId('descargar-excel')).toBeDisabled();
  await page.getByTestId('exportar-gestoria').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByTestId('exportar-gestoria')).toHaveCount(0);
});

test('gestoría (datos de mentira): resumen por IVA, avisos y archivos Excel y CSV', async ({ page }) => {
  const R = (numero: string, fecha: string, estado: string, subtotal: number, iva: number, nif: string | null) => ({
    numero, fecha, estado, subtotal, iva_pct: iva, total_iva: Math.round(subtotal * iva) / 100, total: Math.round(subtotal * (100 + iva)) / 100,
    cliente_id: 'c1', cliente_nombre_snapshot: 'Ana', cliente_apellidos_snapshot: 'García', cliente_nif_snapshot: nif,
  });
  const filas = [R('FAC-2026-0001', '2026-07-02', 'pagada', 120, 21, '12345678Z'), R('FAC-2026-0002', '2026-07-15', 'emitida', 80.5, 21, null),
    R('FAC-2026-0003', '2026-08-01', 'cancelada', 300, 21, '12345678Z'), R('FAC-2026-0004', '2026-08-20', 'vencida', 45, 10, '12345678Z')];
  let pedidos = 0;
  await page.route(/\/rest\/v1\/facturas\?.*cliente_nif_snapshot/, async (route) => {
    pedidos++;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': `0-${filas.length - 1}/${filas.length}` }, body: JSON.stringify(filas) });
  });
  await abrir(page);
  await page.getByRole('button', { name: 'Trimestre', exact: true }).click();
  await page.getByLabel('Año', { exact: true }).selectOption('2026');
  await page.getByLabel('Trimestre', { exact: true }).selectOption('3');
  const resumen = page.getByTestId('resumen-gestoria');
  await expect(resumen).toContainText('3 facturas', { timeout: 15_000 });      // 4 en el libro, 1 anulada que no cuenta
  await expect(page.getByTestId('diferencia-iva')).toHaveCount(0);              // sin compras no hay «repercutido − soportado»
  await expect(resumen).toContainText('21 %');
  await expect(resumen).toContainText('10 %');
  await expect(resumen).toContainText('245,50 €');                      // base total sin la anulada: 120 + 80,50 + 45
  await expect(page.getByTestId('avisos-gestoria')).toContainText('1 factura anulada');
  await expect(page.getByTestId('avisos-gestoria')).toContainText('Sin NIF del cliente: FAC-2026-0002');

  const dx = page.waitForEvent('download');
  await page.getByTestId('descargar-excel').click();
  const excel = await dx;
  expect(excel.suggestedFilename()).toMatch(/^doonty_facturas_gestoria_2026-T3.*\.xlsx$/);
  const bytes = await readFile((await excel.path())!);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  const texto = bytes.toString('latin1');                                // el ZIP va sin comprimir: los nombres de las partes se leen tal cual
  expect(texto).toContain('xl/worksheets/sheet2.xml');
  const utf = bytes.toString('utf8');
  expect(utf).toContain('FAC-2026-0004');
  expect(utf).toContain('Resumen IVA');

  const dc = page.waitForEvent('download');
  await page.getByTestId('descargar-csv').click();
  const csv = await dc;
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  const t = await readFile((await csv.path())!, 'utf8');
  expect(t.startsWith('﻿"Nº factura";"Fecha"')).toBe(true);
  expect(t).toContain('"FAC-2026-0001";"02/07/2026";"Ana García";"12345678Z";"120,00";"21";"25,20";"145,20";"Pagada"');
  expect(t).toContain('"TOTAL (sin anuladas)"');
  expect(pedidos).toBeGreaterThanOrEqual(1);
});
