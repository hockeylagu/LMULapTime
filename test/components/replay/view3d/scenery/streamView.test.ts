import { describe, expect, it } from 'vitest';
import { FREE_REPLAN_M, LAP_REPLAN_M, isFreeCameraMode, stationAt, viewMoved } from '../../../../../src/components/replay/view3d/scenery/streamView.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/replay.js';

const points = [0, 100, 3990, 10].map(stationM => ({ x: 0, y: 0, z: 0, stationM })) as ReplayTrajectoryPoint[];

it('streams around the car except for the panned orbit and overhead cameras', () => {
  expect([isFreeCameraMode('orbit'), isFreeCameraMode('top')]).toEqual([true, true]);
  expect(['follow', 'chase', 'cockpit', 'trackside'].some(mode => isFreeCameraMode(mode as 'follow'))).toBe(false);
});

describe('stationAt', () => {
  it('interpolates between samples', () => { expect(stationAt(points, 0, 0.25, 4000)).toBe(25); });
  it('never interpolates across the start/finish wrap', () => { expect(stationAt(points, 2, 0.5, 4000)).toBe(3990); });
  it('is undefined without a finite station', () => {
    expect(stationAt([{ ...points[0], stationM: undefined }], 0, 0, 4000)).toBeUndefined();
    expect(stationAt(points, 9, 0, 4000)).toBeUndefined();
  });
  it('uses the last sample alone and clamps the fraction', () => {
    expect(stationAt(points, 3, 0.5, 4000)).toBe(10); expect(stationAt(points, 0, 7, 4000)).toBe(100);
  });
});

describe('viewMoved', () => {
  it('replans on the first view and when the view kind changes', () => {
    expect(viewMoved(null, { kind: 'lap', lapDistanceM: 0 }, 4000)).toBe(true);
    expect(viewMoved({ kind: 'lap', lapDistanceM: 0 }, { kind: 'free', x: 0, z: 0 }, 4000)).toBe(true);
  });
  it('replans a lap view only after the replan distance, across the wrap too', () => {
    const at = (m: number) => ({ kind: 'lap' as const, lapDistanceM: m });
    expect(viewMoved(at(100), at(100 + LAP_REPLAN_M - 1), 4000)).toBe(false);
    expect(viewMoved(at(100), at(100 + LAP_REPLAN_M), 4000)).toBe(true);
    expect(viewMoved(at(3990), at(5), 4000)).toBe(false);
    expect(viewMoved(at(3990), at(3990 - LAP_REPLAN_M - 1), 4000)).toBe(true);
  });
  it('replans a free view only after the replan distance', () => {
    expect(viewMoved({ kind: 'free', x: 0, z: 0 }, { kind: 'free', x: 30, z: 30 }, 4000)).toBe(false);
    expect(viewMoved({ kind: 'free', x: 0, z: 0 }, { kind: 'free', x: FREE_REPLAN_M, z: 0 }, 4000)).toBe(true);
  });
});
