import { describe, expect, it } from 'vitest';
import { detectHandlingBalanceEvents, evaluateTireScrub } from '../../../src/utils/handlingBalanceDetection.js';
import { evaluateHandlingEvidence } from '../../../src/utils/handlingBalance/evidence.js';
import { computeLapComparisons } from '../../../src/utils/replayComparison.js';
import type { ReplayTrajectoryPoint } from '../../../shared/types/index.js';

function corner(step = 0.05, sign = 1): ReplayTrajectoryPoint[] {
  return Array.from({ length: Math.round(1 / step) + 1 }, (_, i) => ({
    x: 0, y: 0, z: i * step * 30, timeSec: i * step, speedKmh: 108,
    steerYaw: sign * (20 + i * step * 35), yawRateDeg: sign * (24 - i * step * 13),
    understeerDeg: 6, accelLatG: sign * 1.2, throttle: 0, brake: 0,
  }));
}

function comparison(points: ReplayTrajectoryPoint[], localLoss = 0.2, initialLoss = 2) {
  const baseline = points.map(p => ({ ...p, timeSec: (p.timeSec ?? 0) * 0.8, speedKmh: 120, steerYaw: (p.steerYaw ?? 0) * 0.5 }));
  return computeLapComparisons(points, baseline).map((c, i) => ({
    ...c, deltaTimeSec: initialLoss + i / (points.length - 1) * localLoss,
  }));
}

describe('handling events worth reviewing', () => {
  it.each([0.01, 0.05, 0.1])('keeps sustained loss-of-response events at %s s sampling', step => {
    const points = corner(step);
    const events = detectHandlingBalanceEvents(points);
    expect(events).toHaveLength(1);
    expect(events[0].isTireScrub).toBe(true);
    expect(events[0].timeLossSec).toBeNull();
    expect(events[0].evidence).toBe('More steering but less rotation');
  });

  it('rejects a 40 ms burst even with five samples at 100 Hz', () => {
    const points = corner(0.01).map((p, i) => ({ ...p, understeerDeg: i >= 30 && i <= 34 ? 12 : 0 }));
    expect(detectHandlingBalanceEvents(points)).toEqual([]);
  });

  it('does not call large, stable steering demand tyre scrub', () => {
    const points = corner().map(p => ({ ...p, steerYaw: 150, yawRateDeg: 20, understeerDeg: 12 }));
    expect(evaluateTireScrub(points, 0, points.length - 1, 12).isTireScrub).toBe(false);
    expect(detectHandlingBalanceEvents(points)).toEqual([]);
  });

  it('does not infer scrub from ordinary braking or a single acceleration spike', () => {
    const points = corner().map(p => ({ ...p, steerYaw: 40, yawRateDeg: 20, throttle: 70, accelLonG: -0.4, brake: 20 }));
    expect(detectHandlingBalanceEvents(points)).toEqual([]);
    const spike = points.map((p, i) => ({ ...p, brake: 0, accelLonG: i === 10 ? -0.4 : 0 }));
    expect(detectHandlingBalanceEvents(spike)).toEqual([]);
  });

  it('does not infer a response collapse from one yaw spike', () => {
    const points = corner(0.01).map((p, i) => ({ ...p, yawRateDeg: i === 75 ? 5 : 24 }));
    expect(detectHandlingBalanceEvents(points)).toEqual([]);
  });

  it.each([1, -1])('finds baseline-relative excess lock symmetrically (direction %s)', sign => {
    const points = corner(0.05, sign).map(p => ({ ...p, steerYaw: sign * 55, yawRateDeg: sign * 20, understeerDeg: 4 }));
    const events = detectHandlingBalanceEvents(points, undefined, undefined, comparison(points));
    expect(events).toHaveLength(1);
    expect(events[0].isTireScrub).toBe(false);
    expect(events[0].timeLossSec).toBe(0.2);
  });

  it('reports local delta growth rather than the deficit accumulated earlier', () => {
    const points = corner();
    const events = detectHandlingBalanceEvents(points, undefined, undefined, comparison(points, 0.2, 8));
    expect(events[0].timeLossSec).toBe(0.2);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comparison(points, 0, 8))).toEqual([]);
  });

  it.each([0.099, -0.2, 0])('hides events below the significance floor (%s s)', loss => {
    const points = corner();
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comparison(points, loss))).toEqual([]);
  });

  it('keeps an event at exactly 0.10 s and rejects delta growth without a sustained speed deficit', () => {
    const points = corner();
    const comps = comparison(points, 0.1);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comps)).toHaveLength(1);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comps.map(c => ({ ...c, deltaSpeedKmh: 1 })))).toEqual([]);
  });

  it('suppresses unaligned, partial and non-finite comparisons', () => {
    const points = corner();
    const comps = comparison(points);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comps.slice(0, -1))).toEqual([]);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comps.map(c => ({ ...c, primary: { ...c.primary, timeSec: 99 } })))).toEqual([]);
    expect(detectHandlingBalanceEvents(points, undefined, undefined, comps.map(c => ({ ...c, deltaTimeSec: NaN })))).toEqual([]);
  });

  it('requires rear-slide evidence rather than yaw lag or negative balance alone', () => {
    const points = corner().map(p => ({ ...p, steerYaw: -15, yawRateDeg: 20, understeerDeg: -3, slipAngleDeg: 0.8 }));
    expect(detectHandlingBalanceEvents(points)).toEqual([]);
    expect(detectHandlingBalanceEvents(points.map(p => ({ ...p, slipAngleDeg: 4 })))[0].isCountersteer).toBe(true);
  });

  it('does not bridge missing timestamps or large telemetry gaps into an event', () => {
    const points = corner(0.1).map(p => ({ ...p, slipAngleDeg: 4, steerYaw: -15, yawRateDeg: 20, understeerDeg: -3 }));
    expect(detectHandlingBalanceEvents(points.map(p => ({ ...p, timeSec: undefined })))).toEqual([]);
    const sparse = points.slice(0, 2).concat(points.slice(-2).map(p => ({ ...p, timeSec: (p.timeSec ?? 0) + 2 })));
    expect(detectHandlingBalanceEvents(sparse)).toEqual([]);
  });

  it('excludes off-track events and incomplete dynamics', () => {
    const points = corner();
    expect(detectHandlingBalanceEvents(points.map(p => ({ ...p, isOffTrack: true })))).toEqual([]);
    expect(detectHandlingBalanceEvents(points.map(p => ({ ...p, yawRateDeg: undefined })))).toEqual([]);
  });

  it('does not mistake a turn reversal for tyre response collapse', () => {
    const points = corner().map((p, i) => ({ ...p, yawRateDeg: i > 10 ? -10 : 20, steerYaw: i > 10 ? -55 : 20 }));
    expect(evaluateHandlingEvidence(points, 0, points.length - 1).responseCollapse).toBe(false);
  });
});
