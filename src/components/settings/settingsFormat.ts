/** Formatters shared by the Settings cards, so one value reads the same everywhere on the page. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** 512 B, 1.5 KB, 12.3 MB, 4.89 GB: the unit steps up every 1024. */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  return `${value.toFixed(unit >= 3 ? 2 : 1)} ${UNITS[unit]}`;
}

/** The one date format on the page: "Sep 28, 2026, 14:05". */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '' || value === 0) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
