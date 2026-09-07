/**
 * Convierte filas de celdas en texto CSV (separador ';', celdas entrecomilladas
 * — así se abre bien en Excel en español, que usa ',' como separador decimal).
 * Separado de downloadCsv() para poder testearlo sin depender del DOM.
 */
export function rowsToCsv(rows: string[][]): string {
  const bom = '﻿'; // UTF-8 BOM for Excel compatibility
  return bom + rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')
  ).join('\r\n');
}

export function downloadCsv(filename: string, rows: string[][]): void {
  const content = rowsToCsv(rows);
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
