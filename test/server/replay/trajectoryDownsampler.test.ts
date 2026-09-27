import { describe, it, expect } from 'vitest';
import { nearestSelectedIndex, pointBudgetForSpacing, selectFeatureSamples } from '../../../server/replay/trajectoryDownsampler.js';
import { ReplayTrajectoryPoint } from '../../../server/core/types.js';

// A lap sampled every 0.1 s at a steady 200 km/h, full throttle, no brake, unless overridden.
const lap = (count: number, at: (i: number) => Partial<ReplayTrajectoryPoint> = () => ({})): ReplayTrajectoryPoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: i, y: 0, z: 0, timeSec: i * 0.1, speedKmh: 200, throttle: 100, brake: 0, ...at(i) }));

const stride = (points: ReplayTrajectoryPoint[], maxPoints: number) =>
  Array.from({ length: maxPoints }, (_, i) => points[Math.floor((i * points.length) / maxPoints)]);

describe('selectFeatureSamples', () => {
  it('returns exactly maxPoints ascending indices, keeping the first and last samples', () => {
    const selected = selectFeatureSamples(lap(1000), 137);
    expect(selected).toHaveLength(137);
    expect(selected[0]).toBe(0);
    expect(selected[selected.length - 1]).toBe(999);
    expect(selected.every((idx, k) => k === 0 || idx > selected[k - 1])).toBe(true);
  });

  it('keeps everything when maxPoints covers the lap, and honours tiny limits', () => {
    expect(selectFeatureSamples(lap(5), 10)).toEqual([0, 1, 2, 3, 4]);
    expect(selectFeatureSamples(lap(5), 1)).toEqual([0]);
    expect(selectFeatureSamples(lap(5), 2)).toEqual([0, 4]);
  });

  it('still spreads samples over a lap where nothing changes (map line, timing)', () => {
    const points = lap(1000);
    const kept = selectFeatureSamples(points, 100).map(i => points[i].timeSec ?? 0);
    const evenSpacing = (99.9 - 0) / 99;
    const gaps = kept.slice(1).map((t, k) => t - kept[k]);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(3 * evenSpacing + 1e-9);
  });

  it('spends the samples where the traces change', () => {
    // Full throttle except a 2 s braking zone in the middle of a 100 s lap.
    const points = lap(1000, i => (i >= 490 && i < 510 ? { brake: 80, throttle: 0, speedKmh: 200 - (i - 490) * 5 } : {}));
    const kept = selectFeatureSamples(points, 100).map(i => points[i]);
    expect(kept.filter(p => (p.timeSec ?? 0) >= 48.9 && (p.timeSec ?? 0) <= 51.1).length).toBeGreaterThanOrEqual(10);
  });

  it('keeps a one-sample brake tap that keeping every Nth sample drops', () => {
    const points = lap(400, i => (i === 201 ? { brake: 60, throttle: 0 } : {}));
    expect(stride(points, 100).some(p => (p.brake ?? 0) > 0)).toBe(false);
    const kept = selectFeatureSamples(points, 100).map(i => points[i]);
    expect(kept.some(p => p.brake === 60)).toBe(true);
  });

  it('keeps the apex minimum speed', () => {
    const points = lap(400, i => ({ speedKmh: 80 + Math.abs(i - 173) * 0.7 }));
    const kept = selectFeatureSamples(points, 50).map(i => points[i]);
    expect(Math.min(...kept.map(p => p.speedKmh ?? Infinity))).toBe(80);
  });

  it('keeps both levels of a chattering throttle at half resolution, where every other sample keeps only one', () => {
    const points = lap(200, i => (i >= 50 && i < 150 ? { throttle: i % 2 === 0 ? 33 : 100 } : {}));
    const chatter = (kept: ReplayTrajectoryPoint[]) => kept.filter(p => (p.timeSec ?? 0) >= 5 && (p.timeSec ?? 0) < 15);
    expect(new Set(chatter(stride(points, 100)).map(p => p.throttle))).toEqual(new Set([33]));
    const kept = selectFeatureSamples(points, 100).map(i => points[i]);
    expect(new Set(chatter(kept).map(p => p.throttle))).toEqual(new Set([33, 100]));
  });
});

describe('nearestSelectedIndex', () => {
  it('finds the position of the kept sample nearest to a full-resolution index', () => {
    const selected = [0, 10, 20, 30];
    expect(nearestSelectedIndex(selected, 0)).toBe(0);
    expect(nearestSelectedIndex(selected, 14)).toBe(1);
    expect(nearestSelectedIndex(selected, 16)).toBe(2);
    expect(nearestSelectedIndex(selected, 99)).toBe(3);
  });
});

describe('pointBudgetForSpacing', () => {
  it('spaces the points over the track length when the lap is on a known track', () => {
    expect(pointBudgetForSpacing(lap(10), 13624.59, 2)).toBe(6813);
    expect(pointBudgetForSpacing(lap(10), 5724.06, 2)).toBe(2863);
  });

  it('falls back to the distance the recording covers', () => {
    // lap(101): x from 0 to 100 m
    expect(pointBudgetForSpacing(lap(101), undefined, 2)).toBe(50);
    expect(pointBudgetForSpacing(lap(101), 0, 3)).toBe(34);
  });

  it('never asks for fewer than the two end samples', () => {
    expect(pointBudgetForSpacing(lap(1), undefined, 2)).toBe(2);
  });
});
