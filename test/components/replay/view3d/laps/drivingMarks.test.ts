import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';
import type { CornerSegmentComparison } from '../../../../../src/utils/cornerAnalysis/types.js';
import { cornerDrivingMarks, drivingMarksGeometry, MARK_STRIPES } from '../../../../../src/components/replay/view3d/laps/drivingMarks.js';

const corner = {
  primaryBrakingDistM: 100, primaryTurnInDistM: 120, minDistM: 150, primaryThrottleOnDistM: 170,
  baselineBrakingDistM: 110, baselineTurnInDistM: null, baselineMinDistM: 152, baselineThrottleOnDistM: 165,
} as CornerSegmentComparison;

describe('cornerDrivingMarks', () => {
  it("marks each lap's brake point, turn-in, slowest point and throttle on, leaving out what a lap lacks", () => {
    expect(cornerDrivingMarks(corner, true)).toEqual([
      {lap: 'primary', kind: 'braking', distM: 100}, {lap: 'primary', kind: 'turnIn', distM: 120},
      {lap: 'primary', kind: 'apex', distM: 150}, {lap: 'primary', kind: 'throttle', distM: 170},
      {lap: 'baseline', kind: 'braking', distM: 110}, {lap: 'baseline', kind: 'apex', distM: 152}, {lap: 'baseline', kind: 'throttle', distM: 165},
    ]);
    expect(cornerDrivingMarks(corner, false).every(mark => mark.lap === 'primary')).toBe(true);
  });
});

describe('drivingMarksGeometry', () => {
  // Two laps heading +x, one metre apart across the road (z), a sample every metre on a road 5 m high.
  const lap = (z: number) => {
    const points: ReplayTrajectoryPoint[] = Array.from({length: 300}, (_, i) => ({x: i, y: 5, z, timeSec: i / 50, speedKmh: 100}));
    return {points, distances: points.map(p => p.x)};
  };
  const origin = new Vector3(100, 0, 0);
  const vertices = (geometry: ReturnType<typeof drivingMarksGeometry>['geometry']) => {
    const position = geometry.getAttribute('position');
    return Array.from({length: position.count}, (_, i) => [position.getX(i), position.getY(i), position.getZ(i)]);
  };

  it('lays a stripe across each lap where it was at the mark, the comparison lap narrower and on top', () => {
    const {geometry, colors, missing} = drivingMarksGeometry([{lap: 'primary', kind: 'braking', distM: 120}, {lap: 'baseline', kind: 'braking', distM: 130}],
      {primary: lap(0), baseline: lap(1)}, origin, () => 5);
    expect(missing).toBe(0);
    expect(colors).toEqual([MARK_STRIPES.primary.color, MARK_STRIPES.primary.color, MARK_STRIPES.baseline.color, MARK_STRIPES.baseline.color]);
    const [primary, baseline] = [vertices(geometry).slice(0, 4), vertices(geometry).slice(4)];
    // Across the line (z) and short along it (x), centred on the lap at its distance, in scene coordinates.
    for (const [x, , z] of primary) {
      expect(Math.abs(x - 20)).toBeCloseTo(MARK_STRIPES.primary.halfDepthM);
      expect(Math.abs(z)).toBeCloseTo(MARK_STRIPES.primary.halfWidthM);
    }
    for (const [x, , z] of baseline) {
      expect(Math.abs(x - 30)).toBeCloseTo(MARK_STRIPES.baseline.halfDepthM);
      expect(Math.abs(z - 1)).toBeCloseTo(MARK_STRIPES.baseline.halfWidthM);
    }
    expect(primary[0][1]).toBeCloseTo(5 + MARK_STRIPES.primary.liftM);
    expect(baseline[0][1]).toBeGreaterThan(primary[0][1]);
    expect(geometry.getIndex()?.count).toBe(12);
  });

  it('counts a mark with no road resident under it yet, and skips a lap not shown', () => {
    const {geometry, missing} = drivingMarksGeometry([{lap: 'primary', kind: 'apex', distM: 120}, {lap: 'baseline', kind: 'apex', distM: 120}],
      {primary: lap(0), baseline: null}, origin, () => null);
    expect(missing).toBe(1);
    expect(geometry.getAttribute('position').count).toBe(0);
  });
});
