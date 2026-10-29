import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makeBrakeBoards } from '../../../../src/components/replay/view3d/brakeBoards.js';
import type { ReplayTrajectoryPoint } from '../../../../shared/types/replay.js';

// Native forward is -Z: this lap drives from z = 0 towards z = -100 with the body origin 0.33 m up.
const points: ReplayTrajectoryPoint[] = Array.from({length: 11}, (_, i) => ({x: 0, y: 5.33, z: -i * 10, timeSec: i}));

it('stands each labelled board on the road beside the lap, facing the approaching cars, in unmirrored scene space', () => {
  const origin = new Vector3(0, 0, 0);
  const boards = makeBrakeBoards([
    {id: 'a', center: [8, -50], label: '100', stationM: 50, side: 'right'},
    {id: 'b', center: [500, -50], label: '50', stationM: 50, side: 'right'}, // No lap within 80 m.
    {id: 'c', center: [8, -60], stationM: 60, side: 'right'}, // Unlabelled.
  ], points, origin, () => 5);
  expect(boards.children).toHaveLength(1);
  const board = boards.children[0];
  expect(board.name).toBe('brake-board-100');
  expect(board.position.toArray()).toEqual([8, 5, 50]); // Scene Z is native -Z.
  // Cars travel towards scene +Z, so the face looks back along scene -Z.
  const face = new Vector3(0, 0, 1).applyEuler(board.rotation);
  expect(face.z).toBeCloseTo(-1); expect(face.x).toBeCloseTo(0);
});

it('falls back to the lap road height where the board is beyond the scanned surfaces', () => {
  const boards = makeBrakeBoards([{id: 'a', center: [8, -50], label: 'DIGI', stationM: 50, side: 'right'}], points, new Vector3(), () => null);
  expect(boards.children[0].position.y).toBeCloseTo(5);
});
