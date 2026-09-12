import { describe, it, expect } from 'vitest';
import { computeLapSegmentComparisons } from '../../src/utils/cornerAnalysis';
import { ReplayTrajectoryPoint } from '../../server/types';

describe('computeLapSegmentComparisons', () => {
  // Speed trace with genuine turning points at both ends (100->200->minSpeed->200->100),
  // so the boundary "max" points actually register - not a flat plateau the algorithm
  // can't turn around on. Corner window: entry@30m, min@70m, exit@110m; lap ends at 140m.
  function buildLap(minSpeedKmh: number, extraTimeThroughCorner: number): ReplayTrajectoryPoint[] {
    const speeds = [100, 150, 200, 200, 180, 150, minSpeedKmh, minSpeedKmh, 150, 180, 200, 200, 180, 150, 100];
    let t = 0;
    return speeds.map((speedKmh, i) => {
      const distM = i * 10;
      // Corner spans (30, 110]; add the extra delay across just that stretch.
      t += distM > 30 && distM <= 110 ? extraTimeThroughCorner : 0.3;
      return { x: distM, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: t };
    });
  }

  function withBrakeThrottle(points: ReplayTrajectoryPoint[], brakeOnDistM: number, throttleOnDistM: number): ReplayTrajectoryPoint[] {
    return points.map(p => ({
      ...p,
      brake: p.x >= brakeOnDistM && p.x < 70 ? 60 : 0,
      throttle: p.x >= throttleOnDistM ? 100 : 0,
    }));
  }

  it('builds a contiguous straight -> corner -> straight breakdown of the whole lap', () => {
    const baseline = buildLap(100, 0.3);
    const primary = buildLap(90, 0.3);

    const segments = computeLapSegmentComparisons(primary, baseline);

    expect(segments.map(s => s.type)).toEqual(['straight', 'corner', 'straight']);
    expect(segments[0].entryDistM).toBe(0);
    expect(segments[0].exitDistM).toBe(30);
    expect(segments[2].entryDistM).toBe(110);
    expect(segments[2].exitDistM).toBe(140);

    const trailingStraight = segments[2];
    if (trailingStraight.type !== 'straight') throw new Error('expected straight segment');
    // Top speed (200) is reached mid-straight, well before the lap actually ends at 100 km/h -
    // the exit-boundary speed captures that distinction (and is what "at the finish line" means).
    expect(trailingStraight.primaryTopSpeedKmh).toBe(200);
    expect(trailingStraight.primaryExitSpeedKmh).toBe(100);

    const corner = segments[1];
    if (corner.type !== 'corner') throw new Error('expected corner segment');
    expect(corner.cornerNumber).toBe(1);
    expect(corner.entryDistM).toBe(30);
    expect(corner.minDistM).toBe(70);
    expect(corner.exitDistM).toBe(110);
    expect(corner.baselineEntrySpeedKmh).toBe(200);
    expect(corner.baselineMinSpeedKmh).toBe(100);
    expect(corner.baselineExitSpeedKmh).toBe(200);
    expect(corner.primaryMinSpeedKmh).toBe(90);
    expect(corner.minSpeedDeltaKmh).toBe(-10);
  });

  it('reports a positive (lost time) delta isolated to the corner segment only', () => {
    const baseline = buildLap(100, 0.3);
    const primary = buildLap(100, 0.5); // same speeds, but slower through the corner stretch

    const segments = computeLapSegmentComparisons(primary, baseline);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

    // 8 steps of 10m each between entry(30) and exit(110) get the extra 0.2s delay.
    expect(corner.timeDeltaSec).toBeCloseTo(1.6, 2);
    // No extra delay was applied outside the corner, so the straights should show ~0 delta.
    for (const s of segments) {
      if (s.type === 'straight') expect(s.timeDeltaSec).toBeCloseTo(0, 2);
    }
  });

  it('computes braking point and throttle-on point deltas within a corner', () => {
    const baseline = withBrakeThrottle(buildLap(100, 0.3), 40, 80);
    const primary = withBrakeThrottle(buildLap(100, 0.3), 50, 70);

    const segments = computeLapSegmentComparisons(primary, baseline);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

    // Brake/throttle ramp linearly between 10m-spaced samples, so the detected threshold
    // crossing lands a bit before the raw keyframe distance - the delta between the two
    // laps is unaffected since both ramps are shaped identically, just offset by 10m.
    expect(corner.baselineBrakingDistM).toBe(32);
    expect(corner.primaryBrakingDistM).toBe(42);
    expect(corner.brakingPointDeltaM).toBe(10); // primary braked 10m later than baseline

    expect(corner.baselineThrottleOnDistM).toBe(80);
    expect(corner.primaryThrottleOnDistM).toBe(70);
    expect(corner.throttleOnDeltaM).toBe(-10); // primary got back to full throttle 10m earlier
  });

  it('returns an empty array when either lap has no points', () => {
    expect(computeLapSegmentComparisons([], buildLap(100, 0.3))).toEqual([]);
    expect(computeLapSegmentComparisons(buildLap(100, 0.3), [])).toEqual([]);
  });

  it('ignores noise dips below the prominence threshold (no corner rows, still covers the lap)', () => {
    const speeds = [100, 150, 200, 200, 195, 200, 200, 180, 150, 100]; // only a 5 km/h dip
    const toPoints = (s: number[]) => s.map((speedKmh, i) => ({
      x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: i * 0.3,
    }));
    const segments = computeLapSegmentComparisons(toPoints(speeds), toPoints(speeds));

    expect(segments.filter(s => s.type === 'corner')).toHaveLength(0);
    expect(segments.some(s => s.type === 'straight')).toBe(true);
  });

  it('still detects a small but genuine corner (8 km/h dip) that the old 10 km/h threshold used to miss', () => {
    const speeds = [100, 150, 200, 200, 192, 200, 200, 180, 150, 100]; // an 8 km/h dip
    const toPoints = (s: number[]) => s.map((speedKmh, i) => ({
      x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: i * 0.3,
    }));
    const segments = computeLapSegmentComparisons(toPoints(speeds), toPoints(speeds));

    const corners = segments.filter(s => s.type === 'corner');
    expect(corners).toHaveLength(1);
  });

  it('does not drop a trailing corner whose recovery never dips again before the lap data ends', () => {
    // Corner1 (30->50->80) closes normally. Corner2 (80->100->?) recovers just enough to
    // register its own apex, but then climbs continuously to the last sample with no
    // further dip - so there's no natural "exit" max to close it off with.
    const speeds = [100, 150, 200, 200, 150, 100, 150, 200, 200, 120, 80, 120, 160, 200, 240];
    const toPoints = (s: number[]) => s.map((speedKmh, i) => ({
      x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: 0, timeSec: i * 0.3,
    }));
    const segments = computeLapSegmentComparisons(toPoints(speeds), toPoints(speeds));

    const corners = segments.filter(s => s.type === 'corner');
    expect(corners).toHaveLength(2);
    expect(corners[0]).toMatchObject({ entryDistM: 30, minDistM: 50, exitDistM: 80 });
    expect(corners[1]).toMatchObject({ entryDistM: 80, minDistM: 100, exitDistM: 140 });
  });

  it('uses the active lap to define corner boundaries in compare mode, not the baseline noise pattern', () => {
    const primarySpeeds = [100, 150, 200, 200, 180, 150, 100, 150, 200, 200, 180, 150, 100];
    const baselineSpeeds = [100, 150, 200, 200, 194, 200, 200, 194, 200, 200, 150, 100];
    const baselineSteer = [0, -50, -50, -50, 50, -50, -50, 50, -50, -50, -50, -50];

    const toPoints = (speeds: number[], steer: number[] = speeds.map(() => 0)) => speeds.map((speedKmh, i) => ({
      x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: steer[i], timeSec: i * 0.3,
    }));

    const segments = computeLapSegmentComparisons(toPoints(primarySpeeds), toPoints(baselineSpeeds, baselineSteer), 20);
    const corners = segments.filter(s => s.type === 'corner');

    expect(corners).toHaveLength(1);
    expect(corners[0]).toMatchObject({ entryDistM: 30, minDistM: 60, exitDistM: 90 });
  });

  it('splits a corner into linked sub-corners on a genuine steering-direction reversal, even without a full speed recovery', () => {
    const speeds = [100, 150, 200, 200, 194, 200, 200, 194, 200, 200, 150, 100];
    const steerYaw = [0, -50, -50, -50, 50, -50, -50, 50, -50, -50, -50, -50];
    const toPoints = (steer: number[]) => speeds.map((speedKmh, i) => ({
      x: i * 10, y: 0, z: 0, speedKmh, throttle: 0, brake: 0, steerYaw: steer[i], timeSec: i * 0.3,
    }));

    // A high prominence threshold (20) means neither 6 km/h dip would register as a corner
    // on its own - only a genuine steering reversal can force them through.
    const zeroSteer = speeds.map(() => 0);
    const withoutSteering = computeLapSegmentComparisons(toPoints(zeroSteer), toPoints(zeroSteer), 20);
    expect(withoutSteering.filter(s => s.type === 'corner')).toHaveLength(0);

    const withSteering = computeLapSegmentComparisons(toPoints(steerYaw), toPoints(steerYaw), 20);
    const corners = withSteering.filter(s => s.type === 'corner');
    expect(corners).toHaveLength(2);
    expect(corners[0]).toMatchObject({ entryDistM: 30, minDistM: 40, exitDistM: 60 });
    expect(corners[1]).toMatchObject({ entryDistM: 60, minDistM: 70, exitDistM: 90 });
  });

  it('measures distance monotonically from lap start even when stationM metadata is present', () => {
    const baseline = buildLap(100, 0.3);
    const primary = buildLap(90, 0.3);
    // Even if backend centerline projection assigns non-zero stationM (e.g. Monza S/F is at station 1600m)
    primary.forEach((p, i) => { p.stationM = 1600 + i * 10; });
    baseline.forEach((p, i) => { p.stationM = 1600 + i * 10; });

    const segments = computeLapSegmentComparisons(primary, baseline, 6);

    expect(segments[0].entryDistM).toBe(0);
    expect(segments[0].exitDistM).toBe(30);
    const corner = segments[1];
    if (corner.type !== 'corner') throw new Error('expected corner segment');
    expect(corner.entryDistM).toBe(30);
    expect(corner.minDistM).toBe(70);
    expect(corner.exitDistM).toBe(110);
  });
});
