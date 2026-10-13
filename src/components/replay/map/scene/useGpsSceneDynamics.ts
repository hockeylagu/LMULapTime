import { useMemo } from 'react';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';
import { computeLapComparisons } from '../../../../utils/replayComparison.js';
import { getTrajectoryDistances, getDistancesInReferenceFrame, findIndexAtDistance } from '../../../../utils/lapAlignment.js';
import { computeGhostPosition, type ProjectedPoint } from '../replayMapUtils.js';
import { usePlaybackPosition } from '../../inspector/replayPlaybackCursor.js';
import { interpolatePrimaryPoint, computeLineSeparation, interpolateDeltaTime } from './gpsCarDynamicsHelpers.js';
import { replayBodyHeading } from './GpsSceneCarMarkers.js';
import { VIEWBOX_SIZE, PADDING } from './useGpsSceneProjection.js';

interface Options {
  points: ReplayTrajectoryPoint[];
  baselinePoints: ReplayTrajectoryPoint[];
  svgPoints: ProjectedPoint[];
  bounds: { minX: number; spanX: number; minZ: number; spanZ: number };
  currentIndex: number;
  trackLengthM?: number;
}

/**
 * Where both cars are at the playback cursor: the interpolated primary sample, distance-aligned lap
 * comparisons and live delta, the baseline ghost at the same distance, and the line gap between them.
 */
export function useGpsSceneDynamics({ points, baselinePoints, svgPoints, bounds, currentIndex, trackLengthM }: Options) {
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
  const baselineGhostPos = useMemo(() => computeGhostPosition(
    primaryDists, baselineDists, baselinePoints, activeIndex + fraction, bounds, VIEWBOX_SIZE, PADDING,
  ), [primaryDists, baselineDists, baselinePoints, activeIndex, fraction, bounds]);
  const currentLineDistM = useMemo(() => computeLineSeparation(currentPrimaryPoint, baselineGhostPos?.point),
    [currentPrimaryPoint, baselineGhostPos?.point]);

  // Use the same distance station as ghost position, with shortest-arc body yaw interpolation.
  const primaryDistance = (primaryDists[activeIndex] ?? 0)
    + ((primaryDists[activeIndex + 1] ?? primaryDists[activeIndex] ?? 0) - (primaryDists[activeIndex] ?? 0)) * fraction;
  let baselineHeadingIndex = findIndexAtDistance(baselineDists, primaryDistance);
  if (baselineHeadingIndex > 0 && baselineDists[baselineHeadingIndex] > primaryDistance) baselineHeadingIndex--;
  const baselineHeadingSpan = (baselineDists[baselineHeadingIndex + 1] ?? baselineDists[baselineHeadingIndex]) - baselineDists[baselineHeadingIndex];
  const baselineHeadingFraction = baselineHeadingSpan > 0
    ? (primaryDistance - baselineDists[baselineHeadingIndex]) / baselineHeadingSpan : 0;

  return {
    activeIndex, fraction, currentPos, primaryDists, baselineDists, comparisons, deltaByIdx,
    currentDeltaTimeSec, currentPrimaryPoint, baselineGhostPos, currentLineDistM,
    baselineHeadingIndex, baselineHeadingFraction,
    baselineBodyHeading: replayBodyHeading(baselinePoints, baselineHeadingIndex, baselineHeadingFraction),
  };
}
