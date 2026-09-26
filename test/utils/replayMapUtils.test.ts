import { describe, it, expect } from 'vitest';
import {
  projectTrajectoryPoints,
  buildContinuousSvgPath,
  computeDispersedCornerMarkers,
  getHeatmapColor,
  computeTrackBoundaryPathD,
  computeGhostPosition,
  computeBaselineDeltaByIdx,
} from '../../src/components/replay/map/replayMapUtils.js';
import type { ReplayTelemetryPoint } from '../../server/core/types.js';
import { getDistancesInReferenceFrame, getTrajectoryDistances } from '../../src/utils/lapAlignment.js';

describe('replayMapUtils', () => {
  const mockPoints: ReplayTelemetryPoint[] = [
    { x: 10, y: 0, z: 20, speedKmh: 80, throttle: 0, brake: 100 },
    { x: 20, y: 0, z: 30, speedKmh: 140, throttle: 50, brake: 0 },
    { x: 30, y: 0, z: 40, speedKmh: 200, throttle: 100, brake: 0 },
  ];

  const mockBounds = { minX: 10, maxX: 30, spanX: 20, minZ: 20, maxZ: 40, spanZ: 20 };

  it('projects 3D telemetry points to 2D SVG points within viewBox', () => {
    const projected = projectTrajectoryPoints(mockPoints, mockBounds, 800, 50);
    expect(projected).toHaveLength(3);
    expect(projected[0].sx).toBe(50);
    expect(projected[2].sx).toBe(750);
    expect(projected[0].idx).toBe(0);
    expect(projected[2].idx).toBe(2);
  });

  it('builds continuous SVG path string and handles teleport points', () => {
    const closePoints = [
      { sx: 100, sy: 100, x: 10, y: 0, z: 10 },
      { sx: 110, sy: 110, x: 11, y: 0, z: 11 },
      { sx: 120, sy: 120, x: 12, y: 0, z: 12 },
    ];
    const pathD = buildContinuousSvgPath(closePoints);
    expect(pathD.startsWith('M 100.0 100.0')).toBe(true);
    expect(pathD).toContain('L 110.0 110.0');
    expect(pathD).toContain('L 120.0 120.0');

    // Teleport point creates a new 'M' move segment
    const withTeleport = [...closePoints, { sx: 400, sy: 400, x: 100, z: 100, isTeleport: true }];
    const teleportPath = buildContinuousSvgPath(withTeleport);
    expect(teleportPath.split('M').length - 1).toBe(2);
  });

  it('computes dispersed corner markers with trajectory and pedal clearance', () => {
    const projected = projectTrajectoryPoints(mockPoints, mockBounds, 800, 50);
    const primaryDists = [0, 50, 100];

    // Pedal marker near corner apex
    const pedalMarkers = [{ sx: 400, sy: 420, nx: 0, ny: 1 }];

    const markers = computeDispersedCornerMarkers(
      [{ cornerNumber: 1, minDistM: 50 }],
      primaryDists,
      projected,
      undefined,
      pedalMarkers
    );

    expect(markers).toHaveLength(1);
    expect(markers[0].cornerNumber).toBe(1);

    // Marker position maintains safe clearance from apex (actualSx, actualSy)
    const distToApex = Math.hypot(markers[0].sx - markers[0].actualSx, markers[0].sy - markers[0].actualSy);
    expect(distToApex).toBeGreaterThanOrEqual(30);

    // Marker maintains separation from pedal badge
    const distToPedal = Math.hypot(markers[0].sx - 400, markers[0].sy - (420 + 22));
    expect(distToPedal).toBeGreaterThanOrEqual(25);
  });

  it('returns appropriate heatmap colors for pedal, speed, and delta modes', () => {
    // 100% Brake -> full red rgb(239, 68, 68)
    const brakeColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 100, throttle: 0, speedKmh: 100 }, 'pedal');
    expect(brakeColor).toBe('rgb(239, 68, 68)');

    // 100% Throttle -> full green rgb(16, 185, 129)
    const throttleColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 0, throttle: 100, speedKmh: 150 }, 'pedal');
    expect(throttleColor).toBe('rgb(16, 185, 129)');

    // Coast point (neither pedal) -> COAST_COLOR
    const coastColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 0, throttle: 0, speedKmh: 120 }, 'pedal');
    expect(coastColor).toBe('#475569');

    // Speed mode produces rgb gradient string
    const speedColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 0, throttle: 100, speedKmh: 200 }, 'speed');
    expect(speedColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);

    // Delta mode (gaining time -> green, losing time -> red)
    const gainingColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 0, throttle: 100, speedKmh: 200 }, 'delta', -0.6);
    expect(gainingColor).toBe('rgb(16, 185, 129)');

    const losingColor = getHeatmapColor({ x: 0, y: 0, z: 0, brake: 0, throttle: 100, speedKmh: 200 }, 'delta', 0.6);
    expect(losingColor).toBe('rgb(239, 68, 68)');
  });

  describe('computeTrackBoundaryPathD', () => {
    it('uses centerlineSvgPoints when available', () => {
      const centerline = [{ sx: 10, sy: 20 }, { sx: 30, sy: 40 }];
      const left = [{ sx: 8, sy: 18 }];
      const right = [{ sx: 12, sy: 22 }];
      const result = computeTrackBoundaryPathD(centerline, left, right);
      expect(result).toBe('M 10.0 20.0 L 30.0 40.0 Z');
    });

    it('derives boundary path from midpoints of left and right boundaries when centerline is absent', () => {
      const left = [{ sx: 10, sy: 10 }, { sx: 20, sy: 20 }];
      const right = [{ sx: 30, sy: 10 }, { sx: 40, sy: 20 }];
      const result = computeTrackBoundaryPathD([], left, right);
      expect(result).toBe('M 20.0 10.0 L 30.0 20.0 Z');
    });

    it('falls back to left boundary if right is absent', () => {
      const left = [{ sx: 15, sy: 25 }];
      const result = computeTrackBoundaryPathD([], left, []);
      expect(result).toBe('M 15.0 25.0 Z');
    });

    it('returns undefined if all boundary point arrays are empty', () => {
      const result = computeTrackBoundaryPathD([], [], []);
      expect(result).toBeUndefined();
    });
  });

  describe('computeGhostPosition station-domain matching', () => {
    it('aligns ghost position side-by-side using canonical station rather than divergent odometer distances', () => {
      const primary: ReplayTelemetryPoint[] = [
        { x: -111.03, y: 0, z: -36.83, stationM: 1.36, distM: 0, timeSec: 0, speedKmh: 320 },
        { x: -113.13, y: 0, z: -39.70, stationM: 4.91, distM: 3.56, timeSec: 0.04, speedKmh: 320 },
      ];
      // Baseline sliced 8 m downstream, shifted laterally across the track width, and extended back
      // to the line by the server (its first sample, station 0).
      const baseline: ReplayTelemetryPoint[] = [
        { x: -111.07, y: 0, z: -35.11, stationM: 0, distM: 0, timeSec: 375.12, speedKmh: 320 },
        { x: -115.95, y: 0, z: -41.52, stationM: 8.04, distM: 8.06, timeSec: 375.21, speedKmh: 320 },
        { x: -117.03, y: 0, z: -42.94, stationM: 9.82, distM: 9.84, timeSec: 375.23, speedKmh: 321 },
      ];

      const bounds = { minX: -200, maxX: 200, spanX: 400, minZ: -200, maxZ: 200, spanZ: 400 };
      const ghost = computeGhostPosition(
        getTrajectoryDistances(primary, 5724.1),
        getDistancesInReferenceFrame(baseline, primary, 5724.1),
        baseline,
        0, // Primary at station 1.36
        bounds,
        800,
        60
      );

      expect(ghost).not.toBeNull();
      // At station 1.36 m the ghost sits between the line and station 8.04 m, side by side with the primary car
      const dist = Math.hypot(primary[0].x - ghost!.point.x, primary[0].z - ghost!.point.z);
      expect(dist).toBeLessThan(3.0);
    });
  });

  describe('computeBaselineDeltaByIdx', () => {
    it('colours each baseline sample with the primary delta at the same distance (primary frame)', () => {
      // Baseline samples at primary-frame distances 9, 21 and 40 m.
      expect(computeBaselineDeltaByIdx([-0.1, -0.2, -0.3], [10, 20, 30], [9, 21, 40])).toEqual([-0.1, -0.2, -0.3]);
      expect(computeBaselineDeltaByIdx(null, [10], [10])).toBeNull();
    });
  });
});
