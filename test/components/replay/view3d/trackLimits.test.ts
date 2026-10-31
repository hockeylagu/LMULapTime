import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeTrackLimits, TRACK_LIMIT_WIDTH_M } from '../../../../src/components/replay/view3d/trackLimits.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';

const lap: ReplayTrajectoryPoint[] = [0, 50, 100].map(z => ({x: 5, y: 10, z, timeSec: z / 50}));

it('drapes each boundary on the road at the lap level, a white line wide, and breaks where no road is below', () => {
  const road = (point: {x: number; y: number; z: number}) => point.z > 60 ? null : 10;
  const lines = makeTrackLimits([[[0, 0], [0, 100]], [[10, 0], [10, 100]]], lap, new Vector3(0, 0, 0), road);
  const position = lines.geometry.getAttribute('position'), index = lines.geometry.index!;
  for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(10.03);
  expect(Math.abs(position.getX(1) - position.getX(0))).toBeCloseTo(TRACK_LIMIT_WIDTH_M);
  // 2 m steps up to the 60 m gap: 30 joined quads per side, nothing bridged over the missing road.
  expect(index.count).toBe(2 * 30 * 6);
});

it('interpolates small mesh seams up to GAP_M to keep the painted line continuous', () => {
  // Road has a small 4 m seam at z=20..24 where surface query returns null
  const road = (point: {x: number; y: number; z: number}) => (point.z >= 20 && point.z <= 24) ? null : 10;
  const lines = makeTrackLimits([[[0, 0], [0, 40]]], lap, new Vector3(0, 0, 0), road);
  const position = lines.geometry.getAttribute('position'), index = lines.geometry.index!;
  // 40 m / 2 m step = 20 quads, fully joined without breaking across the seam
  expect(index.count).toBe(20 * 6);
  for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(10.03);
});

it('conforms ribbon edges to road and curb elevations independently to avoid clipping', () => {
  // Road on the left (x <= 0) is at y=10.0; raised curb on the right (x > 0) is at y=10.15
  const road = (point: {x: number; y: number; z: number}) => point.x > 0 ? 10.15 : 10.00;
  const lines = makeTrackLimits([[[0, 0], [0, 20]]], lap, new Vector3(0, 0, 0), road);
  const position = lines.geometry.getAttribute('position');
  // For z from 0 to 20 (facing +Z, tangent dx=0, dz=1):
  // left vertex has x = -0.125 (road), right vertex has x = +0.125 (curb)
  for (let i = 0; i < position.count; i += 2) {
    expect(position.getY(i)).toBeCloseTo(10.03); // road side + LIFT_M
    expect(position.getY(i + 1)).toBeCloseTo(10.18); // curb side + LIFT_M
  }
});

it('finds lap elevation hints even when trajectory is wide and connects closed loops seamlessly', () => {
  // Car is at x=50, boundary is at x=0 (50 m away, well past 25 m cell size)
  const wideLap: ReplayTrajectoryPoint[] = [0, 20, 40].map(z => ({x: 50, y: 15, z, timeSec: z / 20}));
  const road = (_p: {x: number; y: number; z: number}) => 15;
  // A closed triangular boundary: [0, 0] -> [10, 0] -> [5, 10] -> [0, 0] (closed loop)
  const loop: Array<[number, number]> = [[0, 0], [10, 0], [5, 10], [0, 0]];
  const lines = makeTrackLimits([loop], wideLap, new Vector3(0, 0, 0), road);
  const position = lines.geometry.getAttribute('position'), index = lines.geometry.index!;
  expect(position.count).toBeGreaterThan(0);
  for (let i = 0; i < position.count; i++) expect(position.getY(i)).toBeCloseTo(15.03);
  // Entire closed loop forms a continuous cycle of triangles
  expect(index.count).toBeGreaterThan(0);
  expect(index.count % 6).toBe(0);
});
