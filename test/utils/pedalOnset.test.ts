import { describe, it, expect } from 'vitest';
import {
  findThresholdCrossingDistM,
  THROTTLE_ON_MIN_HOLD_SEC,
  THROTTLE_ON_THRESHOLD_PCT,
} from '../../src/utils/cornerAnalysis/index.js';
import { ReplayTrajectoryPoint } from '../../server/core/types.js';

// A lap at a steady 20 m/s sampled every dtSec: distance = 20 * time.
function lap(dtSec: number, durationSec: number, throttleAt: (t: number) => number): { points: ReplayTrajectoryPoint[]; dists: number[] } {
  const points = Array.from({ length: Math.round(durationSec / dtSec) + 1 }, (_, i) => {
    const t = i * dtSec;
    return { x: 20 * t, y: 0, z: 0, timeSec: 50 + t, speedKmh: 72, throttle: throttleAt(t), brake: 0 };
  });
  return { points, dists: points.map(p => p.x) };
}

const throttleOn = (dtSec: number, durationSec: number, throttleAt: (t: number) => number, toDist = 20 * durationSec) => {
  const { points, dists } = lap(dtSec, durationSec, throttleAt);
  return findThresholdCrossingDistM(points, dists, 0, toDist, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT, 0, THROTTLE_ON_MIN_HOLD_SEC);
};

describe('findThresholdCrossingDistM with a minimum hold (throttle pick-up)', () => {
  // Partial throttle, one sample spiking to 97% at 0.4 s (a sample at every spacing tested), full throttle from 1.5 s (30 m).
  const spikeThenPickUp = (dtSec: number) => (t: number) =>
    Math.abs(t - 0.4) < dtSec / 2 ? 97 : t >= 1.5 ? 100 : 40;

  it.each([0.04, 0.08, 0.1])('ignores a single-sample spike and finds the pick-up at %s s spacing', dtSec => {
    const d = throttleOn(dtSec, 3, spikeThenPickUp(dtSec));
    expect(d).not.toBeNull();
    expect(Math.abs((d as number) - 30)).toBeLessThanOrEqual(20 * dtSec);
  });

  it('without a hold, the spike is reported as the pick-up', () => {
    const { points, dists } = lap(0.04, 3, spikeThenPickUp(0.04));
    const d = findThresholdCrossingDistM(points, dists, 0, 60, p => p.throttle, THROTTLE_ON_THRESHOLD_PCT);
    expect(d).toBeLessThan(9);
  });

  it('a single sample dipping just under the threshold does not fail the hold', () => {
    const dtSec = 0.04;
    const d = throttleOn(dtSec, 3, t => (t < 1 ? 40 : Math.abs(t - 1.2) < dtSec / 2 ? 88 : 100));
    expect(Math.abs((d as number) - 20)).toBeLessThanOrEqual(1);
  });

  it('a short burst that is taken back is not the pick-up', () => {
    // 0.2 s of full throttle at 0.5 s, back to 30%, then committed from 1.5 s.
    const d = throttleOn(0.04, 3, t => (t >= 0.5 && t < 0.7 ? 100 : t >= 1.5 ? 100 : 30));
    expect(Math.abs((d as number) - 30)).toBeLessThanOrEqual(1);
  });

  it('a burst that lasts until the window end counts (short straight before the next corner)', () => {
    // Full throttle from 1.0 s (20 m); the window ends 0.2 s later at 24 m.
    const d = throttleOn(0.04, 3, t => (t >= 1 ? 100 : 30), 24);
    expect(Math.abs((d as number) - 20)).toBeLessThanOrEqual(1);
  });
});
