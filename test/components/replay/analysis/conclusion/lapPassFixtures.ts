import type { CornerPass } from '../../../../../shared/types/corners/cornerPasses.js';

/**
 * A pass through turn `segment` on lap `lapNumber`: 2 s to the slowest point (90 km/h at 800 m into the turn's
 * kilometre) and 2 s out, braking 100 m before it, unless `drive` says otherwise.
 */
export function lapPass(segment: number, lapNumber: number, drive: Partial<CornerPass> & { toApex?: number; fromApex?: number } = {}): CornerPass {
  const { toApex = 2, fromApex = 2, ...rest } = drive;
  const entrySec = lapNumber * 100 + segment * 10;
  return {
    slot: 0, lapNumber, segment, entrySec, minSpeedSec: entrySec + toApex, exitSec: entrySec + toApex + fromApex,
    entrySpeedKmh: 200, minSpeedKmh: 90, exitSpeedKmh: 150, minSpeedM: 800 + segment * 1000, brakeM: 700 + segment * 1000,
    turnInM: null, throttleM: null, minSpeedGear: 3, peakBrake: 0.9, brakeSec: 1, partThrottleSec: 0.5, absSec: 0, coastSec: 0,
    arcRadiusM: null, apexLateralM: null, aheadSlot: null, aheadGapSec: null, ...rest,
  };
}
