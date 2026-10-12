import { describe, expect, it } from 'vitest';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/index.js';
import type { PointComparison } from '../../../../src/utils/replayComparison.js';
import { computeCornerExtrema } from '../../../../src/components/replay/telemetry/telemetryCornerChartPaths.js';

describe('four-wheel chart bounds', () => {
  const point: ReplayTrajectoryPoint = { x: 0, y: 0, z: 0 };

  it('retains default scales for absent channels', () => {
    expect(computeCornerExtrema([], [], 305)).toEqual({
      maxBrakeTemp: 600, hasBrakeTemps: false,
      minSuspPos: 0, maxSuspPos: 30, hasSuspPos: false,
      maxWheelSpeed: 310, hasWheelSpeeds: false,
      minTirePressure: 150, maxTirePressure: 220, hasTirePressures: false,
      minTireWear: 80, maxTireWear: 100, hasTireWear: false,
      minTireTemp: 40, maxTireTemp: 120, hasTireTemps: false,
    });
  });

  it('includes baseline bounds with the original primary availability and sensor filters', () => {
    const comparison: PointComparison = {
      primary: point,
      baseline: {
        ...point, timeSec: 0, speedKmh: 0, throttle: 0, brake: 0, steerYaw: 0, gear: 1,
        brakeTemps: [601, 700, 400, 300], rideHeight: [31, 30, 20, 20],
        wheelSpeeds: [311, 300, 300, 300], tirePressures: [50, 151, 219, 400],
        tireWear: [-1, 0, 100, 101], tireTemps: [10, 71, 129, 200],
      },
      deltaTimeSec: 0, deltaSpeedKmh: 0, deltaThrottle: 0, deltaBrake: 0, deltaSteer: 0,
    };
    expect(computeCornerExtrema([point], [comparison], 300)).toEqual({
      maxBrakeTemp: 700, hasBrakeTemps: false,
      minSuspPos: 0, maxSuspPos: 40, hasSuspPos: false,
      maxWheelSpeed: 320, hasWheelSpeeds: false,
      minTirePressure: 140, maxTirePressure: 230, hasTirePressures: true,
      minTireWear: 0, maxTireWear: 100, hasTireWear: true,
      minTireTemp: 60, maxTireTemp: 140, hasTireTemps: true,
    });
  });

  it('handles long full-resolution streams without exceeding the function argument limit', () => {
    const sample: ReplayTrajectoryPoint = {
      ...point, brakeTemps: [450, 500, 400, 400], rideHeight: [22, 23, 30, 30],
      wheelSpeeds: [250, 250, 250, 250], tirePressures: [180, 180, 190, 190],
      tireWear: [95, 95, 90, 90], tireTemps: [90, 90, 100, 100],
    };
    const result = computeCornerExtrema(Array<ReplayTrajectoryPoint>(150_000).fill(sample), [], 300);
    expect(result).toMatchObject({
      hasBrakeTemps: true, hasSuspPos: true, hasWheelSpeeds: true,
      minTirePressure: 170, maxTirePressure: 200,
      minTireWear: 90, minTireTemp: 80, maxTireTemp: 110,
    });
  });
});
