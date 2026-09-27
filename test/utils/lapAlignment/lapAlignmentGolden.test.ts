import { describe, it, expect } from 'vitest';
import { computeLapComparisons } from '../../../src/utils/replayComparison.js';
import {
  computeMapScene,
  computePairConsistency,
  computePairSegments,
  isCorner,
  LAP_PAIRS,
  loadLapPair,
  roundDeep,
} from './lapPairFixture.js';

/**
 * Golden (characterization) snapshot of the whole lap-comparison pipeline on real laps:
 * telemetry channels, corner/straight segments, map ghost/markers/delta colouring and corner
 * consistency. It does not assert correctness - lapAlignmentInvariants.test.ts does - it makes
 * EVERY change in output visible. A snapshot diff must be explained in the commit that causes it;
 * refactors must produce none. Update with `npx vitest run -u test/utils/lapAlignment`.
 */
const PAIRS = LAP_PAIRS;
const SAMPLE_EVERY = 100;

const sampleIndices = (n: number) => {
  const out: number[] = [];
  for (let i = 0; i < n; i += SAMPLE_EVERY) out.push(i);
  if (out[out.length - 1] !== n - 1) out.push(n - 1);
  return out;
};

describe.each(PAIRS)('lap comparison golden output: %s', name => {
  const pair = loadLapPair(name);
  const P = pair.primary.points;
  const B = pair.baseline.points;
  const L = pair.trackLengthM;
  const indices = sampleIndices(P.length);

  it('telemetry channels (delta and baseline values matched by track position)', () => {
    const comps = computeLapComparisons(P, B, L);
    expect(roundDeep({
      officialDeltaSec: pair.officialDeltaSec,
      finalDeltaSec: comps[comps.length - 1].deltaTimeSec,
      samples: indices.map(i => ({
        i,
        stationM: comps[i].stationM,
        deltaTimeSec: comps[i].deltaTimeSec,
        baselineTimeSec: comps[i].baseline.timeSec,
        baselineSpeedKmh: comps[i].baseline.speedKmh,
        baselineBrake: comps[i].baseline.brake,
        baselineThrottle: comps[i].baseline.throttle,
        deltaLateralOffsetM: comps[i].deltaLateralOffsetM,
      })),
    })).toMatchSnapshot();
  });

  it('corner and straight segments', () => {
    expect(roundDeep(computePairSegments(P, B, L, pair.primary.layoutKey))).toMatchSnapshot();
  });

  it('map: ghost, delta colouring, pedal markers and corner flags', () => {
    const corners = computePairSegments(P, B, L, pair.primary.layoutKey).filter(isCorner);
    const scene = computeMapScene(P, B, L, corners);
    const baselineIndices = sampleIndices(scene.effectiveBaseline.length);
    expect(roundDeep({
      effectiveBaselineLength: scene.effectiveBaseline.length,
      ghost: indices.map(i => {
        const g = scene.ghostAt(i);
        return g ? { i, x: g.point.x, z: g.point.z, timeSec: g.point.timeSec } : { i, missing: true };
      }),
      baselineDeltaByIdx: baselineIndices.map(i => scene.baselineDeltaByIdx?.[i] ?? null),
      pedalMarkers: scene.pedalMarkerPoints.map(m => ({
        cornerNumber: m.cornerNumber, kind: m.kind, isBaseline: Boolean(m.isBaseline), distM: m.distM,
        sx: m.sx, sy: m.sy, isStaggered: m.isStaggered,
      })),
      cornerFlags: scene.cornerMarkers.map(m => ({
        cornerNumber: m.cornerNumber, idx: m.idx, actualSx: m.actualSx, actualSy: m.actualSy, sx: m.sx, sy: m.sy,
      })),
    }, 2)).toMatchSnapshot();
  });

  it('corner consistency', () => {
    expect(roundDeep(computePairConsistency(pair))).toMatchSnapshot();
  });
});
