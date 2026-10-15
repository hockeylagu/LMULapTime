import { describe, expect, it } from 'vitest';
import {
  DeltaTrace, appendScalarPoint, computeChartBounds, emptyChartPaths, emptyScalarTraces,
} from '../../../../src/components/replay/telemetry/telemetryChartPathBuilders.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { PointComparison } from '../../../../src/utils/replayComparison.js';

const bounds = { maxSpd: 260, maxRpm: 8000, maxFuel: 50, maxRegen: 150, maxGear: 7 };

describe('appendScalarPoint', () => {
  it('starts every trace at the first sample and steps the gear from the previous one', () => {
    const t = emptyScalarTraces();
    appendScalarPoint(t, { speedKmh: 260, throttle: 100, engineRpm: 4000 }, 2, 0, 0, true, bounds);
    appendScalarPoint(t, { speedKmh: 130, throttle: 0, engineRpm: 4000 }, 3, 2, 500, false, bounds);
    expect(t.spd).toBe('M 0.0 10.0 L 500.0 52.5 ');
    expect(t.thr).toBe('M 0.0 10.0 L 500.0 95.0 ');
    expect(t.gr).toBe('M 0.0 72.1 L 500.0 72.1 L 500.0 60.7 ');
  });

  it('leaves a channel the sample lacks empty, and starts fuel at its first sample', () => {
    const t = emptyScalarTraces();
    appendScalarPoint(t, {}, 1, 1, 0, true, bounds);
    appendScalarPoint(t, { fuel: 25 }, 1, 1, 100, false, bounds);
    expect(t.rpm).toBe('');
    expect(t.fuel).toBe('M 100.0 52.5 ');
  });
});

describe('DeltaTrace', () => {
  it('shades a gain and a loss outside the deadband and closes the area on the zero line', () => {
    const d = new DeltaTrace(1);
    d.push(0, 0, true, 0);
    d.push(-0.5, 100, false, -0.1);
    d.push(0, 200, false, 0.1);
    d.push(0, 300, false, 0);
    expect(d.gainArea).toContain('M 0.0 50 L 0.0 50.0 L 100.0 30.0 L 100.0 50 Z');
    expect(d.lossArea).toContain('L 200.0 50.0 L 200.0 50 Z');
    expect(d.area.endsWith('L 300.0 50 L 0.0 50 Z')).toBe(true);
  });
});

describe('emptyChartPaths', () => {
  it('has no traces and default scales', () => {
    const e = emptyChartPaths();
    expect(e.speedPath).toBe('');
    expect(e.maxRpm).toBe(9000);
  });
});

describe('computeChartBounds', () => {
  const makePoint = (speedKmh: number): ReplayTrajectoryPoint =>
    ({ timeSec: 0, x: 0, y: 0, z: 0, speedKmh } as ReplayTrajectoryPoint);

  it('pads speed to the next multiple of 5 above peak speed with a 260 floor', () => {
    // 298 km/h -> 300 km/h (next multiple of 5)
    expect(computeChartBounds([makePoint(298)], []).maxSpd).toBe(300);

    // 300 km/h -> 305 km/h (next multiple of 5 strictly above, providing headroom)
    expect(computeChartBounds([makePoint(300)], []).maxSpd).toBe(305);

    // 295 km/h -> 300 km/h
    expect(computeChartBounds([makePoint(295)], []).maxSpd).toBe(300);

    // 260 km/h -> 265 km/h
    expect(computeChartBounds([makePoint(260)], []).maxSpd).toBe(265);

    // Low speed / wet / incomplete lap stays at minimum floor 260 km/h
    expect(computeChartBounds([makePoint(200)], []).maxSpd).toBe(260);
    expect(computeChartBounds([], []).maxSpd).toBe(260);
  });

  it('considers baseline comparison speeds when determining maxSpd', () => {
    const comparisons = [
      {
        primary: makePoint(280),
        baseline: { timeSec: 0, speedKmh: 312, throttle: 100, brake: 0, steerYaw: 0, gear: 6, x: 0, y: 0, z: 0 },
        deltaTimeSec: 0,
        deltaSpeedKmh: -32,
        deltaThrottle: 0,
        deltaBrake: 0,
        deltaSteer: 0,
      },
    ] satisfies PointComparison[];

    expect(computeChartBounds([makePoint(280)], comparisons).maxSpd).toBe(315);
  });

  it('determines maxGear as 6 when car has no 7th gear, and 7 when 7th gear is present', () => {
    const makeGearPoint = (gear: number): ReplayTrajectoryPoint =>
      ({ timeSec: 0, x: 0, y: 0, z: 0, speedKmh: 200, gear } as ReplayTrajectoryPoint);

    // Car with 6 gears (e.g. GT3 or LMP2) -> maxGear 6
    expect(computeChartBounds([makeGearPoint(6), makeGearPoint(5)], []).maxGear).toBe(6);

    // Car reaching 7th gear (Hypercar) -> maxGear 7
    expect(computeChartBounds([makeGearPoint(7), makeGearPoint(6)], []).maxGear).toBe(7);

    // Baseline reaching 7th gear -> maxGear 7
    const comparison7 = [
      {
        primary: makeGearPoint(6),
        baseline: { timeSec: 0, speedKmh: 312, throttle: 100, brake: 0, steerYaw: 0, gear: 7, x: 0, y: 0, z: 0 },
        deltaTimeSec: 0,
        deltaSpeedKmh: 0,
        deltaThrottle: 0,
        deltaBrake: 0,
        deltaSteer: 0,
      },
    ] satisfies PointComparison[];
    expect(computeChartBounds([makeGearPoint(6)], comparison7).maxGear).toBe(7);

    // Empty lap -> default 6
    expect(computeChartBounds([], []).maxGear).toBe(6);
  });
});

