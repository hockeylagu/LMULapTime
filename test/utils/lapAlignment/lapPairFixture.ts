import fs from 'fs';
import path from 'path';
import { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { getCircuitSpecification } from '../../../shared/domain/circuitSpecs.js';
import { toIso8855Steering } from '../../../server/core/replay/replayTrajectoryCodec.js';
import { applyTelemetryPostProcessing } from '../../../src/utils/telemetryPostProcessing.js';
import {
  computeLapComparisons,
} from '../../../src/utils/replayComparison.js';
import {
  getDistancesInReferenceFrame,
  getTrajectoryDistances,
} from '../../../src/utils/lapAlignment.js';
import {
  computeLapSegmentComparisons,
  CornerSegmentComparison,
  LapSegmentComparison,
} from '../../../src/utils/cornerAnalysis/index.js';
import { computeCornerConsistencyStats } from '../../../src/utils/cornerConsistency.js';
import {
  computeBaselineDeltaByIdx,
  computeDispersedCornerMarkers,
  computeEffectiveBounds,
  computeGhostPosition,
  computePedalMarkerPoints,
  projectTrajectoryPoints,
} from '../../../src/components/replay/map/replayMapUtils.js';

/**
 * Real lap pairs captured from the replay API at the inspector's default resolution
 * (`/trajectory?pointSpacingM=2`, one point every 2 m), stored as columns
 * with only the channels the comparison pipeline reads. Captured with
 * tools/analysis/captureLapPairFixture.ts; see ./README.md.
 */
export type LapPairName = 'daytona-r1-10-lap-pair' | 'sarthe-r1-41-lap-pair' | 'bahrain-r1-10-lap-pair' | 'spa-r1-38-lap-pair';

export const LAP_PAIRS: LapPairName[] = ['daytona-r1-10-lap-pair', 'sarthe-r1-41-lap-pair', 'bahrain-r1-10-lap-pair', 'spa-r1-38-lap-pair'];

interface FixtureLap {
  replayName: string;
  driverName: string;
  carClass: string;
  source: 'vcr' | 'duckdb';
  currentLap: number;
  lapTimeSec: number;
  layoutKey?: string;
  trackLengthM: number;
  /** Requested resolution: a point spacing ("2m") or a point count. */
  resolution?: string;
  /** Points the server reduced the lap to. */
  maxPoints: number;
  /** Absent on laps captured before the ISO 8855 conversion (right-positive steering). */
  signConvention?: 'iso8855';
  columns: Record<string, Array<number | null>>;
}

export interface LoadedLap {
  driverName: string;
  carClass: string;
  lapNumber: number;
  lapTimeSec: number;
  trackLengthM: number;
  layoutKey?: string;
  /** Raw points as served by the API (before client post-processing). */
  rawPoints: ReplayTrajectoryPoint[];
  /** Points after the same client post-processing the replay inspector applies. */
  points: ReplayTrajectoryPoint[];
}

export interface LoadedLapPair {
  primary: LoadedLap;
  baseline: LoadedLap;
  trackLengthM: number;
  /** Official (timing-loop) lap-time difference, primary - baseline. */
  officialDeltaSec: number;
}

const BOOLEAN_FIELDS = new Set(['absActive', 'tcActive', 'isOffTrack', 'isTeleport']);

function decodeLap(lap: FixtureLap): LoadedLap {
  const fields = Object.keys(lap.columns);
  const count = lap.columns[fields[0]].length;
  const rawPoints: ReplayTrajectoryPoint[] = [];
  for (let i = 0; i < count; i++) {
    const point: Record<string, number | boolean> = {};
    for (const field of fields) {
      const value = lap.columns[field][i];
      if (value === null) continue;
      point[field] = BOOLEAN_FIELDS.has(field) ? value === 1 : value;
    }
    rawPoints.push(point as unknown as ReplayTrajectoryPoint);
  }
  if (lap.signConvention !== 'iso8855') {
    // Captured before the ISO 8855 conversion: steering and the served lateral offset were right-positive.
    toIso8855Steering({ points: rawPoints });
    for (const point of rawPoints) {
      if (typeof point.lateralOffsetM === 'number' && point.lateralOffsetM !== 0) point.lateralOffsetM = -point.lateralOffsetM;
    }
  }
  return {
    driverName: lap.driverName,
    carClass: lap.carClass,
    lapNumber: lap.currentLap,
    lapTimeSec: lap.lapTimeSec,
    trackLengthM: lap.trackLengthM,
    layoutKey: lap.layoutKey,
    rawPoints,
    points: applyTelemetryPostProcessing(rawPoints),
  };
}

const cache = new Map<LapPairName, LoadedLapPair>();

export function loadLapPair(name: LapPairName): LoadedLapPair {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = path.resolve(process.env.LMU_PERSONAL_FIXTURES!, 'replays', `${name}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { primary: FixtureLap; baseline: FixtureLap };
  const primary = decodeLap(data.primary);
  const baseline = decodeLap(data.baseline);
  // Laps are only ever compared within the same car class.
  if (!primary.carClass || primary.carClass !== baseline.carClass) {
    throw new Error(`${name}: cross-class pair (${primary.carClass} vs ${baseline.carClass})`);
  }
  const pair: LoadedLapPair = {
    primary,
    baseline,
    trackLengthM: primary.trackLengthM,
    officialDeltaSec: Number((primary.lapTimeSec - baseline.lapTimeSec).toFixed(3)),
  };
  cache.set(name, pair);
  return pair;
}

/** Corner/straight segments exactly as the replay inspector computes them in compare mode. */
export function computePairSegments(
  primary: ReplayTrajectoryPoint[],
  baseline: ReplayTrajectoryPoint[],
  trackLengthM: number,
  layoutKey?: string
): LapSegmentComparison[] {
  const spec = layoutKey ? getCircuitSpecification(layoutKey) : undefined;
  return computeLapSegmentComparisons(primary, baseline, 6, trackLengthM, spec?.nominalWidthM);
}

export const isCorner = (s: LapSegmentComparison): s is CornerSegmentComparison => s.type === 'corner';

/** Pedal markers exactly as ReplayMapContainer builds them in compare mode. */
export function buildPedalMarkers(corners: CornerSegmentComparison[]) {
  const markers: Array<{ cornerNumber: number; distM: number; kind: 'brake' | 'throttle'; isBaseline: boolean }> = [];
  for (const c of corners) {
    if (c.primaryBrakingDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryBrakingDistM, kind: 'brake', isBaseline: false });
    if (c.primaryThrottleOnDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.primaryThrottleOnDistM, kind: 'throttle', isBaseline: false });
    if (c.baselineBrakingDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.baselineBrakingDistM, kind: 'brake', isBaseline: true });
    if (c.baselineThrottleOnDistM !== null) markers.push({ cornerNumber: c.cornerNumber, distM: c.baselineThrottleOnDistM, kind: 'throttle', isBaseline: true });
  }
  return markers;
}

export const MAP_VIEWBOX = 800;
export const MAP_PADDING = 60;

function pointBounds(points: ReplayTrajectoryPoint[]) {
  const xs = points.map(p => p.x);
  const zs = points.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  return { minX, maxX, minZ, maxZ, spanX: maxX - minX, spanZ: maxZ - minZ };
}

/**
 * Everything GpsTrackMapScene derives for a compared lap pair. The scene uses the boundary
 * geometry's length; the fixtures' layouts have geometry whose length is the trajectory's.
 */
export function computeMapScene(
  primary: ReplayTrajectoryPoint[],
  baseline: ReplayTrajectoryPoint[],
  trackLengthM: number,
  corners: CornerSegmentComparison[]
) {
  const effectiveBaseline = baseline;
  const bounds = computeEffectiveBounds(pointBounds(primary), null, effectiveBaseline);
  const svgPoints = projectTrajectoryPoints(primary, bounds, MAP_VIEWBOX, MAP_PADDING);
  const baselineSvgPoints = projectTrajectoryPoints(effectiveBaseline, bounds, MAP_VIEWBOX, MAP_PADDING);
  const primaryDists = getTrajectoryDistances(primary, trackLengthM);
  const baselineDists = getDistancesInReferenceFrame(effectiveBaseline, primary, trackLengthM);
  const deltaByIdx = computeLapComparisons(primary, baseline, trackLengthM).map(c => c.deltaTimeSec);
  const baselineDeltaByIdx = computeBaselineDeltaByIdx(deltaByIdx, primaryDists, baselineDists);
  const ghostAt = (index: number) =>
    computeGhostPosition(primaryDists, baselineDists, effectiveBaseline, index, bounds, MAP_VIEWBOX, MAP_PADDING);
  const pedalMarkerPoints = computePedalMarkerPoints(true, buildPedalMarkers(corners), primaryDists, baselineDists, svgPoints, baselineSvgPoints, effectiveBaseline);
  const cornerMarkers = computeDispersedCornerMarkers(corners, primaryDists, svgPoints, baselineSvgPoints, pedalMarkerPoints);
  return {
    bounds, effectiveBaseline, svgPoints, baselineSvgPoints, primaryDists, baselineDists,
    deltaByIdx, baselineDeltaByIdx, ghostAt, pedalMarkerPoints, cornerMarkers,
  };
}

export function computePairConsistency(pair: LoadedLapPair) {
  return computeCornerConsistencyStats(
    [
      { lapNumber: pair.primary.lapNumber, points: pair.primary.points },
      { lapNumber: 1000 + pair.baseline.lapNumber, points: pair.baseline.points },
    ],
    pair.primary.points,
    pair.trackLengthM
  );
}

/** Rounds every number (deeply) so snapshots are stable against float noise and readable. */
export function roundDeep<T>(value: T, decimals = 3): T {
  if (typeof value === 'number') return (Number.isFinite(value) ? Number(value.toFixed(decimals)) : value) as T;
  if (Array.isArray(value)) return value.map(v => roundDeep(v, decimals)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = roundDeep(v, decimals);
    return out as T;
  }
  return value;
}
