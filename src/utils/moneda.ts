// Formato único de importes y kilómetros de toda la aplicación (pantallas, impresos y mensajes).
// Los CSV de exportación NO pasan por aquí: llevan su propio formato para que Excel los lea bien.

/** Redondeo a céntimos: un 120,9999999 de coma flotante sale como 121,00. */
const aCentimos = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Número con exactamente dos decimales y coma («45,75»). Se le añade el símbolo donde haga falta («45,75 €»). */
export function fmt2(n: number): string {
  return aCentimos(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Importe con símbolo («121,00 €»). */
export function formatEuros(n: number): string {
  return aCentimos(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Kilómetros con punto de millar siempre («8.500», «125.000»), sin depender del idioma del navegador. */
export function formatKm(n: number): string {
  return String(Math.round(Number.isFinite(n) ? n : 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
