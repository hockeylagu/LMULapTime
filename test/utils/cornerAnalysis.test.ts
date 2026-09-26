import { describe, it, expect } from 'vitest';
import {
  computeLapSegmentComparisons,
  CornerSegmentComparison,
} from '../../src/utils/cornerAnalysis.js';
import {
  computeCornerConsistencyStats,
  filterCornerConsistencyStats,
} from '../../src/utils/cornerConsistency.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

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
    expect(corner.baselineInitialThrottleDistM).toBe(72);
    expect(corner.primaryInitialThrottleDistM).toBe(70);
    expect(corner.initialThrottleDeltaM).toBe(-2);
  });

  it('splits the isolated corner delta into measurable phase deltas', () => {
    const baseline = withBrakeThrottle(buildLap(100, 0.3), 40, 80).map(point => ({
      ...point,
      steerYaw: point.x >= 50 && point.x <= 70 ? 20 : 0,
    }));
    const primary = withBrakeThrottle(buildLap(100, 0.5), 40, 80).map(point => ({
      ...point,
      steerYaw: point.x >= 50 && point.x <= 70 ? 20 : 0,
    }));

    const corner = computeLapSegmentComparisons(primary, baseline).find(segment => segment.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

    expect(corner.phaseTiming?.entry).toMatchObject({ startDistM: 30, endDistM: 44 });
    expect(corner.phaseTiming?.rotation).toMatchObject({ startDistM: 44, endDistM: 70 });
    expect(corner.phaseTiming?.exit).toMatchObject({ startDistM: 70, endDistM: 110 });
    const phaseTotal = (corner.phaseTiming?.entry?.timeDeltaSec ?? 0) +
      corner.phaseTiming!.rotation.timeDeltaSec +
      corner.phaseTiming!.exit.timeDeltaSec;
    expect(phaseTotal).toBeCloseTo(corner.timeDeltaSec, 3);
  });

  it('keeps brake/throttle deltas correct even when the two recordings are independently mis-trimmed around the line', () => {
    // Simulates two recordings of literally the same physical lap, but each one's own
    // odometer (distM) starts at a different offset from the true physical start/finish line -
    // e.g. one replay's lap-split landed a few meters late. Without re-zeroing both to the
    // same canonical reference (stationM), matching "distance from point[0]" would compare
    // the wrong physical spots and produce bogus brake-point deltas.
    function shiftRecording(points: ReplayTrajectoryPoint[], shiftM: number): ReplayTrajectoryPoint[] {
      return points.map(p => ({ ...p, distM: p.x + shiftM, stationM: p.x }));
    }

    const baseline = shiftRecording(withBrakeThrottle(buildLap(100, 0.3), 40, 80), 0);
    // This recording's own odometer starts 5m late relative to the true line, but is
    // otherwise the exact same physical lap as the passing "no drift" test above.
    const primary = shiftRecording(withBrakeThrottle(buildLap(100, 0.3), 50, 70), 5);

    const segments = computeLapSegmentComparisons(primary, baseline);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner segment');

    // Corner geometry resolves back to the canonical (drift-free) window...
    expect(corner.entryDistM).toBe(30);
    expect(corner.minDistM).toBe(70);
    expect(corner.exitDistM).toBe(110);

    // ...and the brake/throttle deltas match the drift-free case exactly (10m / -10m),
    // proving the 5m per-recording trim offset was fully corrected out, not baked into the
    // comparison.
    expect(corner.baselineBrakingDistM).toBe(32);
    expect(corner.primaryBrakingDistM).toBe(42);
    expect(corner.brakingPointDeltaM).toBe(10);
    expect(corner.baselineThrottleOnDistM).toBe(80);
    expect(corner.primaryThrottleOnDistM).toBe(70);
    expect(corner.throttleOnDeltaM).toBe(-10);
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

  it('aligns corner and straight time deltas using canonical stationM when trackLengthM is provided', () => {
    const primary = buildLap(100, 0.4);
    const baseline = buildLap(100, 0.3);
    const trackLen = 500;

    primary.forEach(p => { p.stationM = p.x; });
    baseline.forEach(p => { p.stationM = p.x; });

    const segments = computeLapSegmentComparisons(primary, baseline, 6, trackLen);
    const corner = segments.find(s => s.type === 'corner');
    expect(corner).toBeDefined();
    if (!corner || corner.type !== 'corner') return;

    // 8 steps of 10m each between station 30 and 110:
    // primary has extra 0.1s per step (0.4s vs 0.3s) = 0.8s delta
    expect(corner.timeDeltaSec).toBeCloseTo(0.8, 2);

    // Segments delta should sum continuously from lap start to finish
    const totalDelta = segments.reduce((sum, s) => sum + s.timeDeltaSec, 0);
    const primaryEnd = primary[primary.length - 1].timeSec ?? 0;
    const baselineEnd = baseline[baseline.length - 1].timeSec ?? 0;
    expect(totalDelta).toBeCloseTo(primaryEnd - baselineEnd, 2);
  });

  it('computes consistency metrics across valid laps and ignores empty lap inputs', () => {
    const reference = buildLap(100, 0.3);
    const second = buildLap(95, 0.35).map((point, index) => ({ ...point, timeSec: (point.timeSec ?? 0) + index * 0.02 }));
    const stats = computeCornerConsistencyStats([
      { lapNumber: 2, points: reference },
      { lapNumber: 1, points: second },
      { lapNumber: 3, points: [] },
    ], reference);

    expect(stats).toHaveLength(1);
    expect(stats[0].lapsSampled).toBe(2);
    expect(stats[0].time.samples.map(sample => sample.lapNumber)).toEqual([1, 2]);
    expect(stats[0].entrySpeedKmh).not.toBeNull();
    expect(stats[0].apexSpeedKmh).not.toBeNull();
  });

  it('returns no consistency stats when there are too few samples after filtering', () => {
    const reference = buildLap(100, 0.3);
    const stats = computeCornerConsistencyStats([
      { lapNumber: 1, points: reference },
      { lapNumber: 2, points: reference },
    ], reference);
    expect(stats).toHaveLength(1);

    expect(filterCornerConsistencyStats(stats, new Set())).toBe(stats);
    expect(filterCornerConsistencyStats(stats, new Set([1]))).toEqual([]);
  });

  it('returns empty consistency results for missing reference or lap data', () => {
    expect(computeCornerConsistencyStats([], buildLap(100, 0.3))).toEqual([]);
    expect(computeCornerConsistencyStats([{ lapNumber: 1, points: [] }], buildLap(100, 0.3))).toEqual([]);
    expect(computeCornerConsistencyStats([{ lapNumber: 1, points: buildLap(100, 0.3) }], [])).toEqual([]);
  });

  it('computes corner angle, turn direction, effective radius, and turn-in point for a curved corner', () => {
    // A 90-degree right-hand corner starting forward along Z (0 to 30m), curving right to X+ (30 to 110m), then heading along X+ (110 to 140m)
    const speeds = [180, 190, 200, 200, 160, 120, 80, 80, 120, 160, 200, 200, 180, 150, 100];
    let t = 0;
    const points: ReplayTrajectoryPoint[] = speeds.map((speedKmh, i) => {
      const distM = i * 10;
      t += 0.25;
      let x = 0;
      let z = distM;
      let steerYaw = 0;
      let brake = 0;
      let throttle = 0;

      if (distM >= 30 && distM <= 110) {
        // Curve 90 degrees right: angle 0 to PI/2
        const progress = (distM - 30) / 80;
        const angle = progress * (Math.PI / 2);
        x = 50 * (1 - Math.cos(angle));
        z = 30 + 50 * Math.sin(angle);
        steerYaw = 30; // right turn
        if (distM >= 40 && distM < 70) brake = 80;
        if (distM >= 80) throttle = 90;
      } else if (distM > 110) {
        x = 50 + (distM - 110);
        z = 80;
        steerYaw = 0;
        throttle = 100;
      }

      return {
        x,
        y: 0,
        z,
        speedKmh,
        throttle,
        brake,
        steerYaw,
        timeSec: t,
        lateralOffsetM: i === 3 ? 3.5 : (i === 6 || i === 7) ? 0.2 : (i === 10 || i === 11) ? 3.8 : 0,
      };
    });

    const segments = computeLapSegmentComparisons(points, points);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    expect(corner.turnDirection).toBe('right');
    expect(corner.cornerAngleDeg).toBeGreaterThanOrEqual(75);
    expect(corner.cornerAngleDeg).toBeLessThanOrEqual(105);
    expect(corner.effectiveRadiusM).toBeGreaterThan(0);
    expect(corner.primaryTurnInDistM).toBeDefined();
    expect(corner.primaryTurnInDistM).toBeGreaterThanOrEqual(30);
    expect(corner.primaryTrackUsage?.entryOffsetM).toBe(3.5);
    expect(corner.primaryTrackUsage?.apexMarginM).toBe(0.2);
    expect(corner.primaryTrackUsage?.exitWidthM).toBe(3.8);
    expect(corner.trailBrakeDistM).toBeGreaterThan(0);
    expect(corner.trailBrakeDurationSec).toBeCloseTo(0.92, 2);
    expect(corner.phaseTiming?.rotation).toBeDefined();
  });

  it('accurately computes rotation complete % at throttle onset', () => {
    // Lap A: Patient alien driver rotates car 85% before getting on throttle at 90m
    // Lap B: Eager driver applies throttle early at 50m when car is only 30% rotated
    const speeds = [180, 190, 200, 200, 160, 120, 80, 80, 120, 160, 200, 200, 180, 150, 100];
    const buildCurveLap = (throttleDistM: number) => speeds.map((speedKmh, i) => {
      const distM = i * 10;
      let x = 0;
      let z = distM;
      if (distM >= 30 && distM <= 110) {
        const progress = (distM - 30) / 80;
        const angle = progress * (Math.PI / 2);
        x = 50 * (1 - Math.cos(angle));
        z = 30 + 50 * Math.sin(angle);
      } else if (distM > 110) {
        x = 50 + (distM - 110);
        z = 80;
      }
      return {
        x,
        y: 0,
        z,
        speedKmh,
        throttle: distM >= throttleDistM ? 85 : 0,
        brake: distM >= 30 && distM < 70 ? 70 : 0,
        steerYaw: distM >= 30 && distM <= 110 ? 35 : 0,
        timeSec: i * 0.25,
      };
    });

    const patientLap = buildCurveLap(90);
    const earlyLap = buildCurveLap(50);

    const segments = computeLapSegmentComparisons(earlyLap, patientLap);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    expect(corner.primaryRotationAtThrottlePct).toBeDefined();
    expect(corner.baselineRotationAtThrottlePct).toBeDefined();
    // Patient lap should have significantly higher rotation % than early lap
    expect(corner.baselineRotationAtThrottlePct!).toBeGreaterThan(corner.primaryRotationAtThrottlePct!);
    expect(corner.rotationAtThrottleDeltaPct).toBeLessThan(0); // primary rotated less at throttle
  });

  it('computes chord sagitta for track usage when lateralOffsetM is undefined', () => {
    // Arc of points with significant curvature in X/Z plane
    const points: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 150, throttle: 0, brake: 0, steerYaw: 0, timeSec: 0 },
      { x: 50, y: 0, z: 30, speedKmh: 80, throttle: 0, brake: 0, steerYaw: 30, timeSec: 1 },
      { x: 100, y: 0, z: 0, speedKmh: 140, throttle: 0, brake: 0, steerYaw: 0, timeSec: 2 },
    ];

    const segments = computeLapSegmentComparisons(points, points, 10);
    const corners = segments.filter((s): s is CornerSegmentComparison => s.type === 'corner');

    if (corners.length > 0) {
      expect(corners[0].primaryTrackUsage?.totalSweepM).toBeGreaterThan(0);
    }
  });

  it('detects understeer scrub and exit traction slip', () => {
    const points: ReplayTrajectoryPoint[] = [
      { x: 0, y: 0, z: 0, speedKmh: 160, throttle: 100, brake: 0, steerYaw: 0, timeSec: 0 },
      { x: 40, y: 0, z: 10, speedKmh: 140, throttle: 80, brake: 0, steerYaw: 15, understeerDeg: 4.5, timeSec: 0.8 },
      { x: 80, y: 0, z: 0, speedKmh: 155, throttle: 100, brake: 0, steerYaw: 5, tcActive: true, timeSec: 1.6 },
    ];

    const segments = computeLapSegmentComparisons(points, points, 10);
    const corners = segments.filter((s): s is CornerSegmentComparison => s.type === 'corner');

    if (corners.length > 0) {
      expect(corners[0].typeSpecificDetails?.steeringScrubDeg).toBe(4.5);
      expect(corners[0].typeSpecificDetails?.exitWheelSlipActive).toBe(true);
    }
  });

  it('accurately computes exit track-out offset and remaining space left on track', () => {
    // Lap A (wide clean track-out): car drifts to -5.5m (nominal width 12m, half-width 6m -> 0.5m left)
    // Lap B (pinched exit): car only drifts to -4.0m (2.0m left)
    const speeds = [200, 160, 100, 70, 70, 100, 140, 180, 200];
    const buildLapWithOffsets = (exitOffset: number): ReplayTrajectoryPoint[] =>
      speeds.map((speedKmh, i) => ({
        x: i * 10,
        y: 0,
          z: i * 5,
          speedKmh,
          throttle: i >= 4 ? 95 : 0,
          brake: i < 4 ? 60 : 0,
          steerYaw: i >= 2 && i <= 6 ? 25 : 0, // right turn
          lateralOffsetM: i <= 2 ? 3.0 : i === 3 || i === 4 ? 2.5 : i === 6 ? exitOffset : 0,
          timeSec: i * 0.4,
        }));

    const wideLap = buildLapWithOffsets(-5.5);
    const pinchedLap = buildLapWithOffsets(-4.0);

    const segments = computeLapSegmentComparisons(wideLap, pinchedLap, 10, 150, 12.0);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    expect(corner.turnDirection).toBe('right');
    expect(corner.primaryTrackUsage?.entrySpaceLeftM).toBe(3.0);
    expect(corner.primaryTrackUsage?.apexSpaceLeftM).toBe(3.5);
    expect(corner.primaryTrackUsage?.exitTrackOutOffsetM).toBe(-5.5);
    expect(corner.primaryTrackUsage?.exitSpaceLeftM).toBe(0.5); // 6.0 - 5.5 = 0.5m space left
    expect(corner.baselineTrackUsage?.exitTrackOutOffsetM).toBe(-4.0);
    expect(corner.baselineTrackUsage?.exitSpaceLeftM).toBe(2.0); // 6.0 - 4.0 = 2.0m space left
    expect(corner.exitSpaceDeltaM).toBe(-1.5); // 0.5 - 2.0 = -1.5m (wide lap used 1.5m more track)
  });

  it('accurately computes apex margin on realistic real-world corner (Algarve Turn 9)', async () => {
    const Database = (await import('better-sqlite3')).default;
    const { decompressTrajectory } = await import('../../server/core/replayTrajectoryCodec.js');
    const db = new Database('server/lmu_cache.db');
    const row = db.prepare('SELECT trajectory_br FROM replay_trajectories WHERE filename = ? AND lap_key = ?').get('Algarve International Circuit R1 19.Vcr', 5) as { trajectory_br: Buffer } | undefined;
    if (!row) return;
    const traj = decompressTrajectory(row.trajectory_br);
    const { enrichTrajectoryWithTrackGeometry } = await import('../../server/tracks/serverTrackSync.js');
    enrichTrajectoryWithTrackGeometry(traj, 'Algarve International Circuit', 'Grand Prix', 'Algarve International Circuit R1 19.Vcr');

    const segments = computeLapSegmentComparisons(traj.points, traj.points, 6, traj.trackLengthM, 14.0);
    const corners = segments.filter(s => s.type === 'corner');
    const c9 = corners.find(c => c.cornerNumber === 9);
    expect(c9).toBeDefined();
    expect(c9?.turnDirection).toBe('right');
    // Car is in realistic proximity to inside curb (2.3m at min speed, down from corrupted 8.8m)
    expect(c9?.primaryTrackUsage?.apexSpaceLeftM).toBeLessThanOrEqual(3.0);
    expect(c9?.primaryTrackUsage?.apexSpaceLeftM).toBeGreaterThanOrEqual(0.0);
  });

  it('prevents wide entry straightaway excursion from corrupting apex and exit space left (decoupled per-phase half-widths)', () => {
    // 14m wide track (nominal half-width 7.0m).
    // Entry has an apron / wide straight where car sits at 13.2m offset.
    // At apex, car hugs inside curb at 6.8m (0.2m from inside curb).
    // At exit, car tracks out to -5.8m (1.2m space left).
    const speeds = [210, 180, 120, 80, 80, 110, 160, 200];
    const lapWithWideEntry: ReplayTrajectoryPoint[] = speeds.map((speedKmh, i) => ({
      x: i * 15,
      y: 0,
      z: i * 8,
      speedKmh,
      throttle: i >= 4 ? 100 : 0,
      brake: i < 3 ? 80 : 0,
      steerYaw: i >= 2 && i <= 5 ? 20 : 0, // right turn
      lateralOffsetM: i === 0 ? 13.2 : i === 1 ? 10.0 : i === 3 || i === 4 ? 6.8 : i === 6 ? -5.8 : 0,
      timeSec: i * 0.5,
    }));

    const segments = computeLapSegmentComparisons(lapWithWideEntry, lapWithWideEntry, 10, 200, 14.0);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    expect(corner.turnDirection).toBe('right');
    // Entry adapts locally to the 13.5m wide corridor: 13.5 - 13.2 = 0.3m
    expect(corner.primaryTrackUsage?.entrySpaceLeftM).toBe(0.3);
    // Apex is NOT corrupted to 13.5 - 6.8 = 6.7m! It correctly measures against nominal 7.0m: 7.0 - 6.8 = 0.2m
    expect(corner.primaryTrackUsage?.apexSpaceLeftM).toBe(0.2);
    // Exit is NOT corrupted to 13.5 - 5.8 = 7.7m! It correctly measures against nominal 7.0m: 7.0 - 5.8 = 1.2m
    expect(corner.primaryTrackUsage?.exitSpaceLeftM).toBe(1.2);
  });

  it('correctly reports negative space left on off-track corner cuts without inflating boundary', () => {
    // 12m wide track (nominal half-width 6.0m).
    // Clean Lap: hugs curb at 5.8m (0.2m space left).
    // Off-track Lap: cuts inside curb at 7.2m with isOffTrack flag set.
    const speeds = [190, 140, 90, 65, 65, 95, 140, 185];
    const buildLap = (apexOffset: number, isOffTrack: boolean): ReplayTrajectoryPoint[] =>
      speeds.map((speedKmh, i) => ({
        x: i * 12,
        y: 0,
        z: i * 6,
        speedKmh,
        throttle: i >= 4 ? 90 : 0,
        brake: i < 3 ? 70 : 0,
        steerYaw: i >= 2 && i <= 5 ? 18 : 0,
        lateralOffsetM: i <= 1 ? -4.5 : i === 3 || i === 4 ? apexOffset : i === 6 ? -5.0 : 0,
        isOffTrack: (i === 3 || i === 4) && isOffTrack,
        timeSec: i * 0.45,
      }));

    const cleanLap = buildLap(5.8, false);
    const cutLap = buildLap(7.2, true);

    const segments = computeLapSegmentComparisons(cutLap, cleanLap, 10, 180, 12.0);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    // Clean baseline: 6.0 - 5.8 = 0.2m space left
    expect(corner.baselineTrackUsage?.apexSpaceLeftM).toBe(0.2);
    // Off-track cut: should NOT expand boundary to 7.5m (which would hide the cut as 0.3m left).
    // It must strictly preserve nominal 6.0m boundary, yielding 6.0 - 7.2 = -1.2m
    expect(corner.primaryTrackUsage?.apexSpaceLeftM).toBe(-1.2);
    // Delta: -1.2 - 0.2 = -1.4m
    expect(corner.apexSpaceDeltaM).toBe(-1.4);
  });

  it('accurately computes head-to-head phase space deltas in comparison mode', () => {
    // Both laps on 14m track (nominal half-width 7.0m).
    // Lap A maximizes track usage across all three phases:
    // - Entry: sits right on the line (-6.8m -> 0.2m left)
    // - Apex: clips inside curb (6.9m -> 0.1m left)
    // - Exit: maximizes track-out (-6.7m -> 0.3m left)
    // Lap B pinches or leaves space:
    // - Entry: leaves space (-5.0m -> 2.0m left)
    // - Apex: misses apex (5.2m -> 1.8m left)
    // - Exit: pinches exit (-4.5m -> 2.5m left)
    const speeds = [200, 150, 100, 75, 75, 110, 150, 195];
    const lapA: ReplayTrajectoryPoint[] = speeds.map((speedKmh, i) => ({
      x: i * 15,
      y: 0,
      z: i * 7,
      speedKmh,
      throttle: i >= 4 ? 90 : 0,
      brake: i < 3 ? 75 : 0,
      steerYaw: i >= 2 && i <= 5 ? 22 : 0,
      lateralOffsetM: i <= 1 ? -6.8 : i === 3 || i === 4 ? 6.9 : i === 6 ? -6.7 : 0,
      timeSec: i * 0.4,
    }));

    const lapB: ReplayTrajectoryPoint[] = speeds.map((speedKmh, i) => ({
      x: i * 15,
      y: 0,
      z: i * 7,
      speedKmh,
      throttle: i >= 4 ? 90 : 0,
      brake: i < 3 ? 75 : 0,
      steerYaw: i >= 2 && i <= 5 ? 22 : 0,
      lateralOffsetM: i <= 1 ? -5.0 : i === 3 || i === 4 ? 5.2 : i === 6 ? -4.5 : 0,
      timeSec: i * 0.42,
    }));

    const segments = computeLapSegmentComparisons(lapA, lapB, 10, 200, 14.0);
    const corner = segments.find(s => s.type === 'corner');
    if (!corner || corner.type !== 'corner') throw new Error('expected corner');

    // Lap A space left:
    expect(corner.primaryTrackUsage?.entrySpaceLeftM).toBe(0.2);
    expect(corner.primaryTrackUsage?.apexSpaceLeftM).toBe(0.1);
    expect(corner.primaryTrackUsage?.exitSpaceLeftM).toBe(0.3);

    // Lap B space left:
    expect(corner.baselineTrackUsage?.entrySpaceLeftM).toBe(2.0);
    expect(corner.baselineTrackUsage?.apexSpaceLeftM).toBe(1.8);
    expect(corner.baselineTrackUsage?.exitSpaceLeftM).toBe(2.5);

    // Deltas (primary - baseline): negative means primary used more track (closer to edge)
    expect(corner.entrySpaceDeltaM).toBe(-1.8); // 0.2 - 2.0 = -1.8m
    expect(corner.apexSpaceDeltaM).toBe(-1.7);  // 0.1 - 1.8 = -1.7m
    expect(corner.exitSpaceDeltaM).toBe(-2.2);  // 0.3 - 2.5 = -2.2m
  });
});
