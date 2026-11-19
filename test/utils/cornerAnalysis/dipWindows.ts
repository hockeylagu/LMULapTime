import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import {
  CORNER_MIN_PROMINENCE_KMH, STEER_REVERSAL_FRACTION, findSpeedTurningPoints, maxAbsSteer, type SpeedTurningPoint,
} from '../../../shared/domain/cornerSequences/speedTurningPoints.js';
import { getTrajectoryDistances } from '../../../src/utils/lapAlignment.js';
import { MIN_STRAIGHT_LENGTH_M } from '../../../src/utils/cornerAnalysis/helpers.js';
import { compareLapSegments, type CornerWindow } from '../../../src/utils/cornerAnalysis/segmentComparisons.js';
import type { LapSegmentComparison } from '../../../src/utils/cornerAnalysis/types.js';

/**
 * Test laps have no layout, so no corner list: their corners are the primary lap's own speed dips (peak, slowest
 * point, peak; the rule the class maps are built with), a dip left open at either end of the lap closed at that end.
 */
export function dipWindows(points: ReplayTrajectoryPoint[], trackLengthM?: number, minProminenceKmh = CORNER_MIN_PROMINENCE_KMH): CornerWindow[] {
  const dists = getTrajectoryDistances(points, trackLengthM);
  const steer = points.map(point => point.steerYaw);
  const turning: SpeedTurningPoint[] = findSpeedTurningPoints(points.map(point => point.speedKmh), steer, dists, minProminenceKmh,
    maxAbsSteer(steer) * STEER_REVERSAL_FRACTION);
  const startM = dists[0] || 0, endM = dists[dists.length - 1] || 0;
  if (turning[0]?.type === 'min' && turning[0].distM - startM >= MIN_STRAIGHT_LENGTH_M) turning.unshift({ index: 0, distM: startM, type: 'max' });
  const last = turning[turning.length - 1];
  if (last?.type === 'min' && endM - last.distM >= MIN_STRAIGHT_LENGTH_M) turning.push({ index: points.length - 1, distM: endM, type: 'max' });
  const windows: CornerWindow[] = [];
  for (let i = 1; i < turning.length - 1; i++) {
    const [entry, min, exit] = [turning[i - 1], turning[i], turning[i + 1]];
    if (min.type !== 'min' || entry.type !== 'max' || exit.type !== 'max') continue;
    const cornerNumber = windows.length + 1;
    windows.push({ cornerNumber, label: `T${cornerNumber}`, title: '', entryM: entry.distM, exitM: exit.distM });
  }
  return windows;
}

/** `compareLapSegments` over the primary lap's speed dips. */
export function compareOnDips(
  primary: ReplayTrajectoryPoint[], baseline: ReplayTrajectoryPoint[], minProminenceKmh = CORNER_MIN_PROMINENCE_KMH,
  trackLengthM?: number, nominalWidthM?: number
): LapSegmentComparison[] {
  return compareLapSegments(primary, baseline, dipWindows(primary, trackLengthM, minProminenceKmh), trackLengthM, nominalWidthM);
}
