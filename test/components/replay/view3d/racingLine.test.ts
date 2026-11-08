import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { colorRacingLine, makeRacingLine, racingLineColors, RACING_LINE_WIDTH_M } from '../../../../src/components/replay/view3d/racingLine.js';
import { getHeatmapColor } from '../../../../src/components/replay/map/replayMapUtils.js';
import { TELEMETRY_COLORS } from '../../../../src/utils/themeColors.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';
import { inverseToneCurve, toneCurve } from '../../../../src/components/replay/view3d/autoExposure.js';

const curve = {a: 2.5, b: 0.6};

it('drapes the racing ribbon just above the ground, breaks it where the road is missing and recolours in place', () => {
  // Road at 1 m over x 0..10, nothing past it.
  const surfaceHeight = (point: {x: number}) => (point.x <= 10 ? 1 : null);
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 3, bounds: {minX: 0, maxX: 20, minZ: 0, maxZ: 1, spanX: 20, spanZ: 1}, points: [
    {x: 1, y: 1.32, z: 1, timeSec: 0}, {x: 2, y: 1.4, z: 1, timeSec: 0.1}, {x: 20, y: 1.4, z: 1, timeSec: 0.2},
  ]};
  const line = makeRacingLine(lap, new Vector3(0, 1, 0), ['#ff0000', '#00ff00', '#0000ff'], surfaceHeight, curve);
  expect(line.geometry.index?.count).toBe(6); // One quad: no floating continuation where the road surface is missing.
  const positions = line.geometry.getAttribute('position');
  expect(positions.getY(0)).toBeCloseTo(0.01); expect(positions.getY(3)).toBeCloseTo(0.01);
  expect(Math.abs(positions.getZ(0) - positions.getZ(1))).toBeCloseTo(RACING_LINE_WIDTH_M);
  const colors = line.geometry.getAttribute('color');
  // Stored before the tone curve, so the curve displays the 2D map's colours.
  const full = inverseToneCurve(curve, 1);
  expect(colors.getX(0)).toBeCloseTo(full, 5); expect(colors.getY(2)).toBeCloseTo(full, 5);
  colorRacingLine(line, ['#0000ff', '#0000ff', '#0000ff']);
  expect(colors.getX(0)).toBe(0); expect(colors.getZ(0)).toBeCloseTo(full, 5);
  expect(toneCurve(curve, full)).toBeGreaterThan(0.99);
  expect(lap.points[0].y).toBe(1.32); // Visual projection never rewrites measured pose/analytics.
});

it('divides auto-exposure out of the line colour, so the line keeps its colours whatever the exposure', () => {
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, points: [
    {x: 0, y: 0, z: 0, timeSec: 0}, {x: 1, y: 0, z: 0, timeSec: 0.1},
  ]};
  const line = makeRacingLine(lap, new Vector3(), [], () => 0, curve);
  line.onBeforeRender({toneMappingExposure: 2} as never, null as never, null as never, null as never, null as never, null as never);
  expect(line.material.color.r).toBeCloseTo(0.5);
});

it('colours the ribbon with the 2D map modes', () => {
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, points: [
    {x: 0, y: 0, z: 0, timeSec: 0, brake: 90, throttle: 0, speedKmh: 80}, {x: 1, y: 0, z: 0, timeSec: 0.1, brake: 0, throttle: 100, speedKmh: 90},
  ]};
  expect(racingLineColors(lap, null, 'pedal').primary).toEqual(lap.points.map(p => getHeatmapColor(p, 'pedal')));
  expect(racingLineColors(lap, null, 'default').primary).toEqual([TELEMETRY_COLORS.primary, TELEMETRY_COLORS.primary]);
  expect(racingLineColors(lap, lap, 'default').baseline).toEqual([TELEMETRY_COLORS.baseline, TELEMETRY_COLORS.baseline]);
});
