// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGpsSceneDynamics } from '../../../../../src/components/replay/map/scene/useGpsSceneDynamics.js';
import { projectTrajectoryPoints } from '../../../../../src/components/replay/map/replayMapUtils.js';
import type { ReplayTrajectoryPoint } from '../../../../../shared/types/index.js';

const points: ReplayTrajectoryPoint[] = Array.from({ length: 10 }, (_, index) => ({
  x: index * 20, y: 0, z: 0, timeSec: index, speedKmh: 100, throttle: 50, brake: 0,
}));
const bounds = { minX: 0, maxX: 180, minZ: 0, maxZ: 0, spanX: 180, spanZ: 0 };
const svgPoints = projectTrajectoryPoints(points, bounds, 800, 60);

describe('useGpsSceneDynamics', () => {
  it('has no comparison, delta or ghost without a baseline', () => {
    const { result } = renderHook(() => useGpsSceneDynamics({ points, baselinePoints: [], svgPoints, bounds, currentIndex: 4 }));
    expect(result.current.activeIndex).toBe(4);
    expect(result.current.currentPos).toEqual({ sx: svgPoints[4].sx, sy: svgPoints[4].sy });
    expect(result.current.comparisons).toBeNull();
    expect(result.current.currentDeltaTimeSec).toBeNull();
    expect(result.current.baselineGhostPos).toBeNull();
  });

  it('aligns a slower baseline by distance: primary ahead (negative delta), ghost on the same line', () => {
    const slower = points.map(point => ({ ...point, timeSec: (point.timeSec ?? 0) * 1.1 }));
    const { result } = renderHook(() => useGpsSceneDynamics({ points, baselinePoints: slower, svgPoints, bounds, currentIndex: 5 }));
    expect(result.current.comparisons).toHaveLength(points.length);
    expect(result.current.currentDeltaTimeSec).toBeLessThan(0);
    expect(result.current.baselineGhostPos?.point.x).toBeCloseTo(100);
    expect(result.current.currentLineDistM).toBeCloseTo(0);
    expect(result.current.baselineHeadingIndex).toBe(5);
  });
});
