/**
 * Converts a raw steering ratio (-1.0 to +1.0) to wheel angle in degrees (default ±270°).
 */
export function getSteerAngleDeg(steerYaw: number | undefined | null, maxLockDeg = 270): number {
  if (steerYaw === undefined || steerYaw === null) return 0;
  return parseFloat((steerYaw * maxLockDeg).toFixed(1));
}

/** Converts a post-processed steering wheel angle to signed steering input percent of a 270° lock. */
export function getSteerPercent(steerAngleDeg: number | undefined | null): number {
  if (steerAngleDeg === undefined || steerAngleDeg === null) return 0;
  return parseFloat(((steerAngleDeg / 270) * 100).toFixed(1));
}
