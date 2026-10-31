import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createSurfaceHeight, prepareSurfaceLayers } from '../../../../src/components/replay/view3d/surfaceProjection.js';
import { colorRacingLine, makeRacingLine, racingLineColors, RACING_LINE_WIDTH_M } from '../../../../src/components/replay/view3d/racingLine.js';
import { getHeatmapColor } from '../../../../src/components/replay/map/replayMapUtils.js';
import { TELEMETRY_COLORS } from '../../../../src/utils/themeColors.js';
import type { ReplayTrajectoryData } from '../../../../shared/types/replay.js';

function triangle(values: number[]): Mesh {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  return new Mesh(geometry, new MeshBasicMaterial());
}

it('samples native road elevation and banking and does not select a different bridge layer', () => {
  const surface = new Group();
  surface.add(triangle([0, 1, 0, 10, 2, 0, 0, 1, 10]), triangle([0, 6, 0, 10, 7, 0, 0, 6, 10]));
  const height = createSurfaceHeight(surface);
  expect(height({x: 5, y: 1.82, z: 1})).toBeCloseTo(1.5);
  expect(height({x: 5, y: 6.82, z: 1})).toBeCloseTo(6.5);
  expect(height({x: 100, y: 1.32, z: 1})).toBeNull();
  expect(height({x: 5, y: 4, z: 1})).toBeNull();
  expect(height({x: NaN, y: 0, z: 0})).toBeNull();
  expect(height({x: 5, y: 4, z: 1}, 5)).toBeCloseTo(1.5); // A wider reach finds the road far below a camera.
});

it('handles indexed meshes, native transforms, cell edges and large terrain triangles', () => {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute([-1000, 0, -1000, 1000, 0, -1000, 0, 0, 1000], 3)); geometry.setIndex([0, 1, 2]);
  const surface = new Group(); surface.position.y = 2; surface.add(new Mesh(geometry, new MeshBasicMaterial()));
  const height = createSurfaceHeight(surface);
  expect(height({x: 0, y: 2.32, z: 0})).toBe(2);
  expect(height({x: 32, y: 2.32, z: 0})).toBe(2);
});

it('drapes the racing ribbon just above the ground, breaks it where the road is missing and recolours in place', () => {
  const surface = triangle([0, 1, 0, 10, 1, 0, 0, 1, 10]);
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 3, bounds: {minX: 0, maxX: 20, minZ: 0, maxZ: 1, spanX: 20, spanZ: 1}, points: [
    {x: 1, y: 1.32, z: 1, timeSec: 0}, {x: 2, y: 1.4, z: 1, timeSec: 0.1}, {x: 20, y: 1.4, z: 1, timeSec: 0.2},
  ]};
  const line = makeRacingLine(lap, new Vector3(0, 1, 0), ['#ff0000', '#00ff00', '#0000ff'], createSurfaceHeight(surface));
  expect(line.geometry.index?.count).toBe(6); // One quad: no floating continuation where the road surface is missing.
  const positions = line.geometry.getAttribute('position');
  expect(positions.getY(0)).toBeCloseTo(0.04); expect(positions.getY(3)).toBeCloseTo(0.04);
  expect(Math.abs(positions.getZ(0) - positions.getZ(1))).toBeCloseTo(RACING_LINE_WIDTH_M);
  const colors = line.geometry.getAttribute('color');
  expect([colors.getX(0), colors.getY(2)]).toEqual([1, 1]);
  colorRacingLine(line, ['#0000ff', '#0000ff', '#0000ff']);
  expect([colors.getX(0), colors.getZ(0)]).toEqual([0, 1]);
  expect(lap.points[0].y).toBe(1.32); // Visual projection never rewrites measured pose/analytics.
});

it('colours the ribbon with the 2D map modes', () => {
  const lap: ReplayTrajectoryData = {replayName: 'test', pointsCount: 2, bounds: {minX: 0, maxX: 1, minZ: 0, maxZ: 1, spanX: 1, spanZ: 1}, points: [
    {x: 0, y: 0, z: 0, timeSec: 0, brake: 90, throttle: 0, speedKmh: 80}, {x: 1, y: 0, z: 0, timeSec: 0.1, brake: 0, throttle: 100, speedKmh: 90},
  ]};
  expect(racingLineColors(lap, null, 'pedal').primary).toEqual(lap.points.map(p => getHeatmapColor(p, 'pedal')));
  expect(racingLineColors(lap, null, 'default').primary).toEqual([TELEMETRY_COLORS.primary, TELEMETRY_COLORS.primary]);
  expect(racingLineColors(lap, lap, 'default').baseline).toEqual([TELEMETRY_COLORS.baseline, TELEMETRY_COLORS.baseline]);
});

it('keeps packaged filler out of road contact and retains its authored geometry', () => {
  const sheet = (y: number, name: string) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, y, 0, 10, y, 0, 0, y, 10], 3));
    geometry.setIndex([0, 1, 2]);
    const mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = name;
    return mesh;
  };
  const root = new Group(), road = sheet(2, 'road'), filler = sheet(0, 'ground'); root.add(road, filler);
  const layers = prepareSurfaceLayers(root);
  expect(layers.fillerGround).toBe(filler);
  expect(root.children).toContain(filler);
  expect(layers.surfaceHeight({x: 1, y: 1, z: 1})).toBeNull();
  expect(layers.groundHeight({x: 1, y: 1, z: 1})).toBe(0);
  expect(Array.from(road.geometry.index!.array)).toEqual([0, 1, 2]);
});
