import type { PaceCategory, ReferenceLaptimeEntry } from '../../../../shared/types/index.js';
import { getPaceCategoryFromPercentage } from '../../../../shared/domain/paceCategory.js';
import { VEHICLE_CLASS_OPTIONS } from '../../../../shared/domain/vehicleMapping.js';

/** Session timestamps are stored in seconds or milliseconds; this reads either as milliseconds. */
export function toEpochMs(timestamp: number): number {
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

/** Relative age in local calendar days: "today", "yesterday", "5 days ago", etc. */
export function formatDrivenAgo(timestamp: number, now = Date.now()): string {
  const drivenDate = new Date(toEpochMs(timestamp));
  const currentDate = new Date(now);
  // Map local dates to UTC day numbers so daylight-saving changes cannot skew the count.
  const drivenDay = Date.UTC(drivenDate.getFullYear(), drivenDate.getMonth(), drivenDate.getDate());
  const currentDay = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const days = (currentDay - drivenDay) / 86_400_000;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const years = currentDate.getFullYear() - drivenDate.getFullYear();
  const months = years * 12 + currentDate.getMonth() - drivenDate.getMonth();
  if (months < 2) return `${Math.floor(days / 7)} weeks ago`;
  if (months < 24) return `${months} months ago`;
  return `${years} years ago`;
}

/** "+0.312", "-0.080", "±0.000": a gap in seconds with its sign. */
export function formatGap(seconds: number): string {
  if (Math.abs(seconds) < 0.0005) return '±0.000';
  return `${seconds > 0 ? '+' : '-'}${Math.abs(seconds).toFixed(3)}`;
}

/** The class name as the class pills show it (Hyper -> Hypercar, GT3 -> GT3). */
export function carClassLabel(carClass: string): string {
  return VEHICLE_CLASS_OPTIONS.find((o) => o.id === carClass)?.label ?? carClass;
}

/** A lap's benchmark pace, as the session tables rate laps: its time against the 100% target. */
export function benchmarkPace(
  lapTime: number,
  benchmark: ReferenceLaptimeEntry | null
): { category: PaceCategory; percentage: number } | null {
  const target = benchmark?.targets.alienSec;
  if (!target || lapTime <= 0) return null;
  const percentage = parseFloat(((lapTime / target) * 100).toFixed(2));
  return { category: getPaceCategoryFromPercentage(percentage), percentage };
}
