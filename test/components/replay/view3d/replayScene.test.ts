import { expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { detachBarriers, groundBarriers } from '../../../../src/components/replay/view3d/replayScene.js';
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

it('extends a wall down to lower ground and leaves its flat top and grounded walls alone', () => {
  // A wall from 5 m to 6 m over ground at 2 m, then a flat cap at 6 m.
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 5, 0, 10, 5, 0, 0, 6, 0, 10, 6, 0, 0, 6, 1, 10, 6, 1], 3));
  geometry.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]);
  const root = new Group(); root.add(new Mesh(geometry, new MeshBasicMaterial()));
  groundBarriers(root, () => 2);
  expect(Array.from({length: 6}, (_, i) => Number(geometry.getAttribute('position').getY(i).toFixed(2)))).toEqual([1.7, 1.7, 6, 6, 6, 6]);
  groundBarriers(root, () => 9); // Ground above the base never lifts it.
  expect(geometry.getAttribute('position').getY(0)).toBeCloseTo(1.7);
});

it('extends both bottom corners of a wall quad, so a long wall never hangs in a sawtooth', () => {
  // The scene's wall pieces: bottom/top vertex pairs, triangles (v, v+2, v+3) and (v, v+3, v+1).
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 5, 0, 0, 6, 0, 4, 5, 0, 4, 6, 0], 3));
  geometry.setIndex([0, 2, 3, 0, 3, 1]);
  const root = new Group(); root.add(new Mesh(geometry, new MeshBasicMaterial()));
  groundBarriers(root, () => 2);
  expect(Array.from({length: 4}, (_, i) => Number(geometry.getAttribute('position').getY(i).toFixed(2)))).toEqual([1.7, 6, 1.7, 6]);
});
