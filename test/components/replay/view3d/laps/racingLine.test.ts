import { expect, it } from 'vitest';
import { DoubleSide, Vector3 } from 'three';
import { colorRacingLine, exposureDivide, makeRacingLine, racingLineColors, RACING_LINE_WIDTH_M, syncRacingLine } from '../../../../../src/components/replay/view3d/laps/racingLine.js';
import { getHeatmapColor } from '../../../../../src/components/replay/map/replayMapUtils.js';
import { TELEMETRY_COLORS } from '../../../../../src/utils/themeColors.js';
import type { ReplayTrajectoryData } from '../../../../../shared/types/replay.js';
import { EXPOSURE_GLSL, exposureUniforms, inverseToneCurve, toneCurve } from '../../../../../src/components/replay/view3d/autoExposure.js';
import { composedParts, composedTextures } from '../../../../../src/components/replay/view3d/shaders/composer.js';

const curve = {a: 2.5, b: 0.6}, display = {toneCurve: curve, outputGamma: 1};

it('drapes the racing ribbon just above the ground, breaks it where the road is missing and recolours in place', () => {
  // Road at 1 m over x 0..10, nothing past it.
  const surfaceHeight = (point: {x: number}) => (point.x <= 10 ? 1 : null);
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 3, bounds: {minX: 0, maxX: 20, minZ: 0, maxZ: 1, spanX: 20, spanZ: 1}, points: [
    {x: 1, y: 1.32, z: 1, timeSec: 0}, {x: 2, y: 1.4, z: 1, timeSec: 0.1}, {x: 20, y: 1.4, z: 1, timeSec: 0.2},
  ]};
  const line = makeRacingLine(lap, new Vector3(0, 1, 0), ['#ff0000', '#00ff00', '#0000ff'], surfaceHeight, () => display);
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
  const line = makeRacingLine(lap, new Vector3(), [], () => 0, () => display), {material} = line;
  // It reads the exposure the GPU adapted (the same uniform as the canvas pass) and divides it out of the colour before the haze.
  expect(composedParts(material)?.map(part => part.name)).toEqual(['exposureDivide', 'haze']);
  expect(material.uniforms.exposure_state).toBe(exposureUniforms.exposure_state);
  expect(composedTextures(material)).toEqual([]); // The exposure state is the scene's, not the line's.
  expect(exposureDivide.slots.fragmentPars?.glsl).toBe(EXPOSURE_GLSL);
  expect(exposureDivide.slots.fragmentColour?.glsl.trim()).toBe('diffuseColor.rgb /= displayExposure();');
  const fragment = material.fragmentShader;
  expect(fragment.indexOf('diffuseColor.rgb /= displayExposure()')).toBeGreaterThan(fragment.indexOf('#include <color_fragment>'));
  expect(fragment.indexOf('diffuseColor.rgb /= displayExposure()')).toBeLessThan(fragment.indexOf('hazeColour'));
  expect([material.vertexColors, material.side, material.transparent, material.polygonOffset]).toEqual([true, DoubleSide, true, true]);
  // The lap view fades a line by its material's opacity, which the program reads at upload.
  material.opacity = 0.25;
  expect(material.uniforms.opacity.value).toBe(0.25);
  expect(makeRacingLine(lap, new Vector3(), [], () => 0, () => display).material.customProgramCacheKey()).toBe(material.customProgramCacheKey());});

it('colours the ribbon with the 2D map modes', () => {
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, points: [
    {x: 0, y: 0, z: 0, timeSec: 0, brake: 90, throttle: 0, speedKmh: 80}, {x: 1, y: 0, z: 0, timeSec: 0.1, brake: 0, throttle: 100, speedKmh: 90},
  ]};
  expect(racingLineColors(lap, null, 'pedal').primary).toEqual(lap.points.map(p => getHeatmapColor(p, 'pedal')));
  expect(racingLineColors(lap, null, 'default').primary).toEqual([TELEMETRY_COLORS.primary, TELEMETRY_COLORS.primary]);
  expect(racingLineColors(lap, lap, 'default').baseline).toEqual([TELEMETRY_COLORS.baseline, TELEMETRY_COLORS.baseline]);
});

it('re-bakes the line colours through the output encode when the camera type changes the display transform', () => {
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, points: [
    {x: 0, y: 0, z: 0, timeSec: 0}, {x: 1, y: 0, z: 0, timeSec: 0.1},
  ]};
  let current = display;
  const line = makeRacingLine(lap, new Vector3(), ['#808080', '#808080'], () => 0, () => current), colors = line.geometry.getAttribute('color');
  expect(colors.getX(0)).toBeCloseTo(inverseToneCurve(curve, 128 / 255), 5);
  current = {toneCurve: curve, outputGamma: 2.2};
  syncRacingLine(line);
  // The displayed value is the encoded one: decode it, then invert the curve.
  expect(colors.getX(0)).toBeCloseTo(inverseToneCurve(curve, (128 / 255) ** 2.2), 5);
});
