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
