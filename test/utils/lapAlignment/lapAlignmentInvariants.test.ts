import { describe, it, expect } from 'vitest';
import { ReplayTrajectoryPoint } from '../../../shared/types/index.js';
import { applyTelemetryPostProcessing } from '../../../src/utils/telemetryPostProcessing.js';
import { downsampleTrajectoryPoints } from '../../../server/replay/trajectoryDownsampler.js';
import {
  computeLapComparisons,
  interpolatePointAtDistance,
} from '../../../src/utils/replayComparison.js';
import {
  getMonotonicStations,
  getTrajectoryDistances,
  interpolateScalarAtDistance,
} from '../../../src/utils/lapAlignment.js';
import { BRAKE_ON_THRESHOLD_PCT, CornerSegmentComparison, LapSegmentComparison } from '../../../src/utils/cornerAnalysis.js';
import { projectTrajectoryPoints } from '../../../src/components/replay/map/replayMapUtils.js';
import { cutLapAtLine } from '../../../server/tracks/lapLineCut.js';
import {
  computeMapScene,
  computePairSegments,
  isCorner,
  LAP_PAIRS,
  LapPairName,
  loadLapPair,
  MAP_PADDING,
  MAP_VIEWBOX,
} from './lapPairFixture.js';

/**
 * Properties the lap comparison must satisfy on real laps, independent of how it is
 * implemented. Known violations are listed in KNOWN_VIOLATIONS with the phase that fixes them
 * and run as `it.fails`: when a fix lands the property starts holding, vitest reports that
 * `it.fails` as failed, and the entry is removed in the same commit.
 */
const PAIRS = LAP_PAIRS;

type InvariantId = 'I0' | 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7';

const KNOWN_VIOLATIONS: Record<LapPairName, Partial<Record<InvariantId, string>>> = {
  'daytona-r1-10-lap-pair': {},
  'sarthe-r1-41-lap-pair': {},
  'bahrain-r1-10-lap-pair': {},
  'spa-r1-38-lap-pair': {},
};

function invariant(pair: LapPairName, id: InvariantId, title: string, fn: () => void) {
  const known = KNOWN_VIOLATIONS[pair][id];
  if (known) it.fails(`${id}: ${title} [known violation, ${known}]`, fn);
  else it(`${id}: ${title}`, fn);
}
const TIME_TOL_SEC = 0.02;
const POINT_TOL_M = 2;

const segmentDeltaSum = (segments: LapSegmentComparison[]) => segments.reduce((sum, s) => sum + s.timeDeltaSec, 0);
const finalDelta = (P: ReplayTrajectoryPoint[], B: ReplayTrajectoryPoint[], L: number) => {
  const comps = computeLapComparisons(P, B, L);
  return comps[comps.length - 1].deltaTimeSec;
};

/** Pairs corners of two analyses of the same laps by apex position. */
function matchCorners(a: CornerSegmentComparison[], b: CornerSegmentComparison[], toleranceM = 30) {
  return a
    .map(ca => ({ a: ca, b: b.find(cb => Math.abs(cb.minDistM - ca.minDistM) <= toleranceM) }))
    .filter((m): m is { a: CornerSegmentComparison; b: CornerSegmentComparison } => m.b !== undefined);
}

const within = (a: number | null | undefined, b: number | null | undefined, tol: number) =>
  a === null || a === undefined || b === null || b === undefined ? a === b : Math.abs(a - b) <= tol;

/** Converts a distance in the primary lap's frame (what corner analysis reports) to a track station. */
function primaryStationAt(P: ReplayTrajectoryPoint[], L: number, distM: number) {
  return interpolateScalarAtDistance(getMonotonicStations(P, L), getTrajectoryDistances(P, L), distM);
}

/**
 * The lap as the server would serve it had the replay started `lateM` past the line: the
 * recording before that is dropped, the lap is extended back to the line (server/tracks/lapLineCut.ts)
 * and post-processed like any lap the inspector receives.
 */
function startLateAndExtend(raw: ReplayTrajectoryPoint[], L: number, lateM: number): ReplayTrajectoryPoint[] {
  const late = raw.filter(p => (p.stationM ?? 0) >= lateM);
  const cut = cutLapAtLine(late, late.map(p => p.stationM ?? 0), late.map(p => p.lateralOffsetM ?? 0), L, 0, late.length - 1);
  let distM = 0;
  const points = cut.points.map((p, i) => {
    if (i > 0) distM += Math.hypot(p.x - cut.points[i - 1].x, p.z - cut.points[i - 1].z);
    return { ...p, distM: Number(distM.toFixed(2)) };
  });
  return applyTelemetryPostProcessing(points);
}

/** Drops leading samples that are recorded before the S/F line (station in the last half of the lap). */
const dropPreLineSamples = (points: ReplayTrajectoryPoint[], L: number) => {
  const first = points.findIndex(p => (p.stationM ?? 0) < L / 2);
  return points.slice(Math.max(0, first));
};

describe.each(PAIRS)('lap comparison invariants: %s', name => {
  const pair = loadLapPair(name);
  const P = pair.primary.points;
  const B = pair.baseline.points;
  const L = pair.trackLengthM;
  const segments = computePairSegments(P, B, L, pair.primary.layoutKey);
  const corners = segments.filter(isCorner);

  invariant(name, 'I0', 'the final channel delta equals the official lap-time delta', () => {
    expect(Math.abs(finalDelta(P, B, L) - pair.officialDeltaSec)).toBeLessThanOrEqual(TIME_TOL_SEC);
  });

  invariant(name, 'I1', 'segment time deltas add up to the lap delta', () => {
    expect(Math.abs(segmentDeltaSum(segments) - finalDelta(P, B, L))).toBeLessThanOrEqual(TIME_TOL_SEC);
  });

  invariant(name, 'I2', 'pedal points sit where the brake channel crosses the threshold, and the map draws them there', () => {
    const scene = computeMapScene(P, B, L, corners);
    const scale = (MAP_VIEWBOX - 2 * MAP_PADDING) / Math.max(scene.bounds.spanX, scene.bounds.spanZ);
    const baselineStations = getMonotonicStations(B, L);
    const baselineBrakes = B.map(p => p.brake ?? 0);
    for (const marker of scene.pedalMarkerPoints) {
      const station = primaryStationAt(P, L, marker.distM);
      const lap = marker.isBaseline ? B : P;
      const stations = marker.isBaseline ? baselineStations : getMonotonicStations(P, L);
      const world = interpolatePointAtDistance(lap, stations, station);
      const [expected] = projectTrajectoryPoints([{ x: world.x, y: 0, z: world.z }], scene.bounds, MAP_VIEWBOX, MAP_PADDING);
      const offByM = Math.hypot(marker.sx - expected.sx, marker.sy - expected.sy) / scale;
      expect(offByM, `T${marker.cornerNumber} ${marker.kind} ${marker.isBaseline ? 'baseline' : 'primary'}`).toBeLessThanOrEqual(POINT_TOL_M);
    }
    for (const c of corners) {
      if (c.baselineBrakingDistM === null) continue;
      const station = primaryStationAt(P, L, c.baselineBrakingDistM);
      const before = interpolateScalarAtDistance(baselineBrakes, baselineStations, station - POINT_TOL_M);
      const after = interpolateScalarAtDistance(baselineBrakes, baselineStations, station + POINT_TOL_M);
      expect(before, `T${c.cornerNumber} baseline brake before its brake point`).toBeLessThan(BRAKE_ON_THRESHOLD_PCT);
      expect(after, `T${c.cornerNumber} baseline brake after its brake point`).toBeGreaterThanOrEqual(BRAKE_ON_THRESHOLD_PCT);
    }
  });

  invariant(name, 'I3', 'a baseline whose recording starts 10 m past the line compares the same once the server extends it', () => {
    const trimmed = startLateAndExtend(pair.baseline.rawPoints, L, 10);
    expect(trimmed[0].stationM).toBe(0);
    expect(Math.abs(finalDelta(P, trimmed, L) - finalDelta(P, B, L))).toBeLessThanOrEqual(TIME_TOL_SEC);
    const trimmedSegments = computePairSegments(P, trimmed, L, pair.primary.layoutKey);
    expect(Math.abs(segmentDeltaSum(trimmedSegments) - segmentDeltaSum(segments))).toBeLessThanOrEqual(TIME_TOL_SEC);
    for (const { a, b } of matchCorners(corners, trimmedSegments.filter(isCorner))) {
      expect(within(a.baselineBrakingDistM, b.baselineBrakingDistM, POINT_TOL_M), `T${a.cornerNumber} brake`).toBe(true);
      expect(within(a.baselineThrottleOnDistM, b.baselineThrottleOnDistM, POINT_TOL_M), `T${a.cornerNumber} throttle`).toBe(true);
    }
  });

  invariant(name, 'I4', 'swapping the two laps flips the delta sign', () => {
    expect(Math.abs(finalDelta(B, P, L) + finalDelta(P, B, L))).toBeLessThanOrEqual(TIME_TOL_SEC);
  });

  invariant(name, 'I5', 'halving the telemetry resolution keeps pedal points within one sample', () => {
    // Halved the way the server reduces a lap to the requested resolution.
    const half = (lap: ReplayTrajectoryPoint[]) => applyTelemetryPostProcessing(downsampleTrajectoryPoints(lap, Math.ceil(lap.length / 2)));
    const halfP = half(pair.primary.rawPoints);
    const halfB = half(pair.baseline.rawPoints);
    const halfCorners = computePairSegments(halfP, halfB, L, pair.primary.layoutKey).filter(isCorner);
    const dists = getTrajectoryDistances(halfP, L);
    const sampleSpacingM = dists[dists.length - 1] / (dists.length - 1);
    for (const { a, b } of matchCorners(corners, halfCorners)) {
      const tol = Math.max(POINT_TOL_M, 2 * sampleSpacingM);
      expect(within(a.primaryBrakingDistM, b.primaryBrakingDistM, tol), `T${a.cornerNumber} primary brake`).toBe(true);
      expect(within(a.primaryThrottleOnDistM, b.primaryThrottleOnDistM, tol), `T${a.cornerNumber} primary throttle`).toBe(true);
      expect(within(a.baselineBrakingDistM, b.baselineBrakingDistM, tol), `T${a.cornerNumber} baseline brake`).toBe(true);
      expect(within(a.baselineThrottleOnDistM, b.baselineThrottleOnDistM, tol), `T${a.cornerNumber} baseline throttle`).toBe(true);
    }
  });

  invariant(name, 'I6', 'samples recorded before the S/F line do not change the comparison', () => {
    const P2 = dropPreLineSamples(P, L);
    const B2 = dropPreLineSamples(B, L);
    expect(Math.abs(finalDelta(P2, B2, L) - finalDelta(P, B, L))).toBeLessThanOrEqual(TIME_TOL_SEC);
    // As a map baseline, a lap must keep time and station moving forward.
    for (const lap of [P, B]) {
      const stations = getMonotonicStations(lap, L);
      for (let i = 1; i < lap.length; i++) {
        expect(lap[i].timeSec ?? 0, `time at ${i}`).toBeGreaterThanOrEqual(lap[i - 1].timeSec ?? 0);
      }
      expect(stations[stations.length - 1] - stations[0]).toBeGreaterThan(L * 0.95);
    }
  });

  invariant(name, 'I7', 'corner flags stay put when a comparison lap is added', () => {
    const withBaseline = computeMapScene(P, B, L, corners);
    const selfCompare = computeMapScene(P, P, L, corners);
    const anchors = (markers: typeof withBaseline.cornerMarkers) => markers.map(m => ({ c: m.cornerNumber, idx: m.idx }));
    expect(anchors(withBaseline.cornerMarkers)).toEqual(anchors(selfCompare.cornerMarkers));
    // Each flag is anchored on the primary line at its corner's apex (within one sample).
    for (const m of withBaseline.cornerMarkers) {
      const corner = corners.find(c => c.cornerNumber === m.cornerNumber);
      const dists = withBaseline.primaryDists;
      const spacing = Math.max(dists[m.idx + 1] - dists[m.idx] || 0, dists[m.idx] - dists[m.idx - 1] || 0);
      expect(Math.abs(dists[m.idx] - (corner?.minDistM ?? NaN)), `T${m.cornerNumber}`).toBeLessThanOrEqual(spacing);
    }
  });
});
