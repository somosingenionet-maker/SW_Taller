import { describe, it, expect } from 'vitest';
import { rowsToCsv } from './csvExport';

const BOM = '﻿';

describe('rowsToCsv', () => {
  it('genera filas separadas por punto y coma, con cada celda entre comillas', () => {
    expect(rowsToCsv([['a', 'b'], ['c', 'd']])).toBe(`${BOM}"a";"b"\r\n"c";"d"`);
  });

  it('escapa las comillas dobles dentro de una celda duplicándolas', () => {
    expect(rowsToCsv([['Dijo "hola"']])).toBe(`${BOM}"Dijo ""hola"""`);
  });

  it('no rompe filas si una celda contiene el separador (;)', () => {
    // Al ir siempre entre comillas, un ';' dentro de una celda no crea una
    // columna nueva — sigue siendo una sola celda al reabrir el CSV.
    expect(rowsToCsv([['Madrid; España', 'ok']])).toBe(`${BOM}"Madrid; España";"ok"`);
  });

  it('incluye el BOM UTF-8 al principio para que Excel abra bien los acentos', () => {
    expect(rowsToCsv([['ñ', 'á']]).startsWith(BOM)).toBe(true);
  });

  it('devuelve solo el BOM si no hay filas', () => {
    expect(rowsToCsv([])).toBe(BOM);
  });

  it('convierte celdas no-string (números pasados como texto) igual que cualquier otra', () => {
    expect(rowsToCsv([['123', '45,50']])).toBe(`${BOM}"123";"45,50"`);
  });
});
