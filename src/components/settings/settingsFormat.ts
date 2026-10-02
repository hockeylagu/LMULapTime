/** Formatters shared by the Settings cards, so one value reads the same everywhere on the page. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** 1,234,567: thousands separators; a missing or non-finite value is "—". */
export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

/** "1 replay", "2 replays", "0 replays"; pass the plural for irregular words ("category", "categories"). */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** 512 B, 1.5 KB, 12.3 MB, 4.89 GB, 1,200.00 TB: the unit steps up every 1024. Missing or invalid is 0 B. */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const digits = unit >= 3 ? 2 : 1;
  return `${value >= 1000 ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : value.toFixed(digits)} ${UNITS[unit]}`;
}

/** Timestamps before 2000 are a zero or default value, never a real session, replay or sync. */
const EARLIEST_REAL_MS = Date.UTC(2000, 0, 1);

/** The one date format on the page: "Sep 28, 2026, 14:05". A missing, invalid or epoch-zero value is `fallback`. */
export function formatDateTime(value: string | number | Date | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() < EARLIEST_REAL_MS) return fallback;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
