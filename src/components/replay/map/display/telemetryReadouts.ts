import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import { formatRain } from '../../../../../shared/domain/lapConditions.js';

export function hasReading(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function formatReading(value: number | null | undefined, digits?: number): string {
  return hasReading(value) ? digits === undefined ? String(value) : value.toFixed(digits) : '--';
}

export function formatGear(gear: number | undefined): string {
  if (!hasReading(gear) || !Number.isInteger(gear) || gear < -1) return '--';
  return gear === -1 ? 'R' : gear === 0 ? 'N' : String(gear);
}

export function totalAcceleration(point?: ReplayTrajectoryPoint | null): number | undefined {
  return hasReading(point?.accelLatG) && hasReading(point?.accelLonG)
    ? Math.hypot(point.accelLatG, point.accelLonG) : undefined;
}

/** A state worth showing (limiter, wet, pit lane), or null on track or without the flags. */
export function getStatusLabel(point?: ReplayTrajectoryPoint | null): string | null {
  if (point?.pitLimiter) return 'LIMITER';
  if (hasReading(point?.rainIntensity) && point.rainIntensity > 0) return `WET (${formatRain(point.rainIntensity)})`;
  return point?.inPit ? 'PIT LANE' : null;
}

export function getStatusSubtext(point?: ReplayTrajectoryPoint | null): string | undefined {
  return hasReading(point?.ambientTemp) ? `air ${point.ambientTemp.toFixed(1)}°C` : undefined;
}
