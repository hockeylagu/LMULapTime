import { expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { detachBarriers, sightLineFloor } from '../../../../src/components/replay/view3d/replayScene.js';
import { createSurfaceHeight } from '../../../../src/components/replay/view3d/surfaceProjection.js';

it('moves barrier nodes out of the ground so road heights never land on a wall top', () => {
  const root = new Group(), node = (name: string) => { const mesh = new Mesh(new BoxGeometry(4, 1, 4), new MeshBasicMaterial()); mesh.name = name; return mesh; };
  const road = node('road'), wall = node('tyreBarrier'); wall.position.y = 3; root.add(road, wall, node('barrier'), node('tecpro'));
  const barriers = detachBarriers(root);
  expect(root.children.map(child => child.name)).toEqual(['road']);
  expect(barriers.children.map(child => child.name)).toEqual(['tyreBarrier', 'barrier', 'tecpro']);
  expect(barriers.children.every(child => child.castShadow && child.receiveShadow)).toBe(true);
  expect(createSurfaceHeight(root)({x: 0, y: 5, z: 0}, 10)).toBeCloseTo(0.5);
});

it('keeps the sight line to a car low on a banking over the banking top, and leaves flat-road views alone', () => {
  const sheet = (values: number[]) => {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
    const root = new Group(); root.add(new Mesh(geometry, new MeshBasicMaterial()));
    return createSurfaceHeight(root);
  };
  // A banking rising from 10 m to 16 m over x 0..10, nothing past its top edge (native z 0..100).
  const banking = sheet([0, 10, 0, 10, 16, 0, 10, 16, 100, 0, 10, 0, 10, 16, 100, 0, 10, 100]), origin = new Vector3();
  // Car at the bottom, eye 5 m past the top and below it: the top edge three quarters of the way out blocks the view.
  const floor = sightLineFloor(new Vector3(15, 14, -50), new Vector3(1, 10.6, -50), origin, banking);
  expect(floor).toBeGreaterThan(16);
  expect(floor).toBeLessThan(20);
  const flat = sheet([0, 0, 0, 100, 0, 0, 100, 0, 100, 0, 0, 0, 100, 0, 100, 0, 0, 100]);
  expect(sightLineFloor(new Vector3(60, 1.5, -50), new Vector3(40, 0.5, -50), origin, flat)).toBeLessThan(1.5);
});
