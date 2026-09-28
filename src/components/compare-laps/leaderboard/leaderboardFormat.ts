import { VEHICLE_CLASS_OPTIONS } from '../../../../shared/domain/paceCategory.js';

/** Session timestamps are stored in seconds or milliseconds; this reads either as milliseconds. */
export function toEpochMs(timestamp: number): number {
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

/** "today", "yesterday", "5 days ago", "3 weeks ago", "4 months ago". */
export function formatDrivenAgo(timestamp: number, now = Date.now()): string {
  const days = Math.floor((now - toEpochMs(timestamp)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 730) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/** "+0.312", "-0.080", "±0.000": a gap in seconds with its sign. */
export function formatGap(seconds: number): string {
  if (Math.abs(seconds) < 0.0005) return '±0.000';
  return `${seconds > 0 ? '+' : '-'}${Math.abs(seconds).toFixed(3)}`;
}

/** The class name as the class pills show it (LMH -> Hypercar). */
export function carClassLabel(carClass: string): string {
  return VEHICLE_CLASS_OPTIONS.find((o) => o.id === carClass)?.label ?? carClass;
}
