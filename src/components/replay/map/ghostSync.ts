import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import { computeStartFinishOffset, interpolateScalarAtDistance } from '../../../utils/lapAlignment.js';

/**
 * Where the baseline ghost is placed against the primary car:
 * - distance: at the same lap distance (where each car was at this spot: lines, brake points);
 * - time: at the same elapsed lap time (where each car was at this moment: the gap on track);
 * - anchored: together up to marker A, then the same time elapsed since each passed A (who carries
 *   more speed into or out of a corner from a common start).
 */
export type GhostSyncMode = 'distance' | 'time' | 'anchored';

export const GHOST_SYNC_MODES: readonly GhostSyncMode[] = ['distance', 'time', 'anchored'];

export function parseGhostSyncMode(value: string | null | undefined): GhostSyncMode {
  return value === 'time' || value === 'anchored' ? value : 'distance';
}

/** The next mode for V or the sync chip; From A only while marker A is set (X sets it and switches there). */
export function nextGhostSyncMode(mode: GhostSyncMode, anchorSet: boolean): GhostSyncMode {
  const modes = anchorSet ? GHOST_SYNC_MODES : GHOST_SYNC_MODES.filter(option => option !== 'anchored');
  return modes[(modes.indexOf(mode) + 1) % modes.length];
}

/** Both laps' elapsed time against distance, in the primary lap's distance frame. */
export interface GhostClock {
  primaryDists: number[];
  primaryClock: number[];
  baselineDists: number[];
  baselineClock: number[];
}

/** Elapsed lap time per sample, zeroed on the start/finish line like the live delta. */
function lapClock(points: ReplayTrajectoryPoint[], trackLengthM?: number): number[] {
  const crossing = computeStartFinishOffset(points, trackLengthM);
  const start = crossing ? crossing.timeSecOffset : (points[0]?.timeSec ?? 0);
  return points.map(point => (point.timeSec ?? 0) - start);
}

/** `baselineDists` must already be in the primary's frame (getDistancesInReferenceFrame). */
export function createGhostClock(
  primaryPoints: ReplayTrajectoryPoint[], primaryDists: number[],
  baselinePoints: ReplayTrajectoryPoint[], baselineDists: number[], trackLengthM?: number,
): GhostClock | null {
  if (primaryPoints.length === 0 || baselinePoints.length === 0
    || primaryDists.length !== primaryPoints.length || baselineDists.length !== baselinePoints.length) return null;
  return {
    primaryDists, primaryClock: lapClock(primaryPoints, trackLengthM),
    baselineDists, baselineClock: lapClock(baselinePoints, trackLengthM),
  };
}

/**
 * The distance (primary frame) where the ghost sits while the primary car is at `primaryDistance`.
 * Anchored without a marker runs from the lap start, as time does. Past its own lap the ghost waits
 * on the finish line.
 */
export function ghostDistanceAt(
  clock: GhostClock, mode: GhostSyncMode, primaryDistance: number, anchorDistM: number | null,
): number {
  if (mode === 'distance') return primaryDistance;
  const { primaryDists, primaryClock, baselineDists, baselineClock } = clock;
  const primaryTime = interpolateScalarAtDistance(primaryClock, primaryDists, primaryDistance);
  if (mode === 'time' || anchorDistM === null) {
    return interpolateScalarAtDistance(baselineDists, baselineClock, primaryTime);
  }
  if (primaryDistance <= anchorDistM) return primaryDistance;
  const sinceAnchor = primaryTime - interpolateScalarAtDistance(primaryClock, primaryDists, anchorDistM);
  const baselineAtAnchor = interpolateScalarAtDistance(baselineClock, baselineDists, anchorDistM);
  return interpolateScalarAtDistance(baselineDists, baselineClock, baselineAtAnchor + sinceAnchor);
}
