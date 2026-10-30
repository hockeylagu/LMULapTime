import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { prepareSurfaceLayers } from '../../../../src/components/replay/view3d/compatibility/sceneSurfaces.js';

function sheet(y: number, name: string) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, y, 0, 10, y, 0, 0, y, 10], 3));
  geometry.setIndex([0, 1, 2]);
  const mesh = new Mesh(geometry, new MeshBasicMaterial()); mesh.name = name;
  return mesh;
}

it('opens legacy scenes without filler and repairs their face winding without moving surfaces', () => {
  const root = new Group(), kerb = sheet(2, 'kerb-source-yellow'); root.add(kerb);
  const positions = Array.from(kerb.geometry.getAttribute('position').array);
  const layers = prepareSurfaceLayers(root);
  expect(layers.fillerGround).toBeUndefined();
  expect(layers.surfaceHeight({x: 1, y: 3, z: 1})).toBe(2);
  expect(layers.groundHeight({x: 1, y: 3, z: 1})).toBe(2);
  expect(Array.from(kerb.geometry.index!.array)).toEqual([0, 2, 1]);
  expect(Array.from(kerb.geometry.getAttribute('position').array)).toEqual(positions);
});

it('keeps packaged filler out of road contact and retains its authored geometry', () => {
  const root = new Group(), road = sheet(2, 'road'), filler = sheet(0, 'ground'); root.add(road, filler);
  const layers = prepareSurfaceLayers(root);
  expect(layers.fillerGround).toBe(filler);
  expect(root.children).toContain(filler);
  expect(layers.surfaceHeight({x: 1, y: 1, z: 1})).toBeNull();
  expect(layers.groundHeight({x: 1, y: 1, z: 1})).toBe(0);
  expect(Array.from(road.geometry.index!.array)).toEqual([0, 1, 2]);
});
