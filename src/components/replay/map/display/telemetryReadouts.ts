import type { ReplayTelemetryPoint } from '../../../../../shared/types/index.js';
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

export function totalAcceleration(point?: ReplayTelemetryPoint | null): number | undefined {
  return hasReading(point?.accelLatG) && hasReading(point?.accelLonG)
    ? Math.hypot(point.accelLatG, point.accelLonG) : undefined;
}

export function getStatusLabel(point?: ReplayTelemetryPoint | null): string {
  if (point?.pitLimiter) return 'LIMITER';
  if (point?.isOffTrack) return 'OFF TRACK';
  if (hasReading(point?.rainIntensity) && point.rainIntensity > 0) return `WET (${formatRain(point.rainIntensity)})`;
  if (point?.inPit) return 'PIT LANE';
  return point?.inPit === false && point.isOffTrack === false ? 'ON TRACK' : 'UNKNOWN';
}

export function getStatusSubtext(point?: ReplayTelemetryPoint | null): string {
  if (point?.pitLimiter) return 'enabled';
  if (point?.isOffTrack) return 'outside road';
  if (hasReading(point?.ambientTemp)) return `air ${point.ambientTemp.toFixed(1)}°C`;
  if (hasReading(point?.rainIntensity) && point.rainIntensity > 0) return 'wet';
  if (point?.inPit) return 'in pits';
  return getStatusLabel(point) === 'ON TRACK' ? 'air --' : 'unavailable';
}
