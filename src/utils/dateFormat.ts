const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-07-15' → '15 jul. 2026' */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${parseInt(day)} ${MONTHS[parseInt(month) - 1]}. ${year}`;
}

/** '2026-07-15' → '15/07/2026' */
export function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/** '2026-07-15' → 'jul. 2026' (for chart axis labels) */
export function formatDateMonth(iso: string): string {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 2) return iso;
  const [year, month] = parts;
  return `${MONTHS[parseInt(month) - 1]}. ${year}`;
}
