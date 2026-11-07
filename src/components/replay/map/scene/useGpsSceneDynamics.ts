import { useMemo } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import { computeLapComparisons } from '../../../../utils/replayComparison.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame, findIndexAtDistance } from '../../../../utils/lapAlignment.js';
import { computeGhostPosition, type ProjectedPoint } from '../replayMapUtils.js';
import { usePlaybackPosition } from '../../inspector/replayPlaybackCursor.js';
import { interpolatePrimaryPoint, computeLineSeparation, interpolateDeltaTime } from './gpsCarDynamicsHelpers.js';
import { replayBodyHeading } from './GpsSceneCarMarkers.js';
import { VIEWBOX_SIZE, PADDING } from './useGpsSceneProjection.js';
import { createGhostClock, ghostDistanceAt, ghostTimeGap, type GhostSyncMode } from '../ghostSync.js';

interface Options {
  points: ReplayTrajectoryPoint[];
  baselinePoints: ReplayTrajectoryPoint[];
  svgPoints: ProjectedPoint[];
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number };
  currentIndex: number;
  trackLengthM?: number;
  syncMode?: GhostSyncMode;
  /** Marker A (primary-frame distance), where the anchored ghost starts. */
  anchorDistM?: number | null;
}

/**
 * Where both cars are at the playback cursor: the interpolated primary sample, distance-aligned lap
 * comparisons and live delta, the baseline ghost placed by the sync mode (same distance, same time,
 * or same time since marker A), and the gaps between them.
 */
export function useGpsSceneDynamics({
  points, baselinePoints, svgPoints, bounds, currentIndex, trackLengthM, syncMode = 'distance', anchorDistM = null,
}: Options) {
  const playbackPosition = usePlaybackPosition(points, currentIndex);
  const activeIndex = playbackPosition ? playbackPosition.index : currentIndex;
  const fraction = playbackPosition?.fraction ?? 0;
  const samplePos = svgPoints[Math.min(activeIndex, svgPoints.length - 1)] || svgPoints[0];
  const nextPos = svgPoints[activeIndex + 1] ?? samplePos;
  const currentPos = useMemo(() => samplePos && nextPos ? {
    sx: samplePos.sx + (nextPos.sx - samplePos.sx) * fraction,
    sy: samplePos.sy + (nextPos.sy - samplePos.sy) * fraction,
  } : samplePos, [samplePos, nextPos, fraction]);

  const primaryDists = useMemo(() => getTrajectoryDistances(points, trackLengthM), [points, trackLengthM]);
  // Baseline distances in the PRIMARY lap's frame (station-matched), the same frame corner
  // analysis reports baseline brake/throttle points and corner ranges in.
  const baselineDists = useMemo(
    () => (baselinePoints.length > 0 ? getDistancesInReferenceFrame(baselinePoints, points, trackLengthM) : []),
    [baselinePoints, points, trackLengthM],
  );
  const comparisons = useMemo(() => (baselinePoints.length && points.length
    ? computeLapComparisons(points, baselinePoints, trackLengthM) : null),
  [baselinePoints, points, trackLengthM]);
  const deltaByIdx = useMemo(() => (comparisons ? comparisons.map(c => c.deltaTimeSec) : null), [comparisons]);
  const currentDeltaTimeSec = useMemo(() => interpolateDeltaTime(comparisons, activeIndex, fraction), [comparisons, activeIndex, fraction]);
  const currentPrimaryPoint = useMemo(() => interpolatePrimaryPoint(points, activeIndex, fraction), [points, activeIndex, fraction]);
  const clock = useMemo(() => createGhostClock(points, primaryDists, baselinePoints, baselineDists, trackLengthM),
    [points, primaryDists, baselinePoints, baselineDists, trackLengthM]);
  // Same distance station as the cursor, with shortest-arc body yaw interpolation.
  const primaryDistance = (primaryDists[activeIndex] ?? 0)
    + ((primaryDists[activeIndex + 1] ?? primaryDists[activeIndex] ?? 0) - (primaryDists[activeIndex] ?? 0)) * fraction;
  const ghostDistance = clock ? ghostDistanceAt(clock, syncMode, primaryDistance, anchorDistM) : primaryDistance;
  const baselineGhostPos = useMemo(() => computeGhostPosition(
    baselineDists, baselinePoints, ghostDistance, bounds, VIEWBOX_SIZE, PADDING,
  ), [baselineDists, baselinePoints, ghostDistance, bounds]);
  const currentLineDistM = useMemo(() => computeLineSeparation(currentPrimaryPoint, baselineGhostPos?.point),
    [currentPrimaryPoint, baselineGhostPos?.point]);
  /** On-track gap in metres in the primary's frame; positive: the primary is ahead. */
  const currentGapM = baselineGhostPos ? primaryDistance - ghostDistance : null;
  const currentTimeGapSec = ghostTimeGap(syncMode, currentDeltaTimeSec, primaryDistance, anchorDistM, deltaByIdx, primaryDists);

  let baselineHeadingIndex = findIndexAtDistance(baselineDists, ghostDistance);
  if (baselineHeadingIndex > 0 && baselineDists[baselineHeadingIndex] > ghostDistance) baselineHeadingIndex--;
  const baselineHeadingSpan = (baselineDists[baselineHeadingIndex + 1] ?? baselineDists[baselineHeadingIndex]) - baselineDists[baselineHeadingIndex];
  const baselineHeadingFraction = baselineHeadingSpan > 0
    ? Math.max(0, Math.min(1, (ghostDistance - baselineDists[baselineHeadingIndex]) / baselineHeadingSpan)) : 0;

  return {
    activeIndex, fraction, currentPos, primaryDists, baselineDists, comparisons, deltaByIdx,
    currentDeltaTimeSec, currentPrimaryPoint, baselineGhostPos, currentLineDistM, currentGapM, currentTimeGapSec,
    baselineHeadingIndex, baselineHeadingFraction,
    baselineBodyHeading: replayBodyHeading(baselinePoints, baselineHeadingIndex, baselineHeadingFraction),
  };
}
