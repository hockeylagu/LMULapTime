import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createDefaultTerrain } from '../../../../src/components/replay/view3d/defaultTerrain.js';

function surface(values: number[]): Group {
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(values, 3));
  geometry.setIndex(Array.from({length: values.length / 3}, (_, i) => i));
  const root = new Group(); root.add(new Mesh(geometry, new MeshBasicMaterial()));
  return root;
}

it('follows raised track surfaces from below, never rising through them, and fades to the horizon level away from the track', () => {
  // A 40 m wide road sheet climbing from 10 m to 30 m in 10 m strips: a hill the old flat ground left hovering.
  const strips: number[] = [];
  for (let z = 0; z < 200; z += 10) {
    const y0 = 10 + z / 10, y1 = y0 + 1;
    strips.push(0, y0, z, 40, y0, z, 0, y1, z + 10, 40, y0, z, 40, y1, z + 10, 0, y1, z + 10);
  }
  const root = surface(strips);
  const bounds = {min: [0, 10, 0], max: [40, 30, 200]}, origin = new Vector3(20, 20, 100);
  const terrain = createDefaultTerrain([root], bounds, origin, 9.4, '#76734f');
  for (const [x, y, z] of [[20, 10, 5], [20, 20, 100], [20, 29, 190]]) {
    const height = terrain.heightAt(x - origin.x, z - origin.z) + origin.y;
    expect(height).toBeLessThan(y); // Below the road at every station...
    expect(height).toBeGreaterThan(y - 4); // ...and close enough that no hillside hovers over void.
  }
  expect(terrain.heightAt(2000 - origin.x, 100 - origin.z) + origin.y).toBeCloseTo(9.4); // Outside the grid: flat edge level.
  expect(terrain.heightAt(800 - origin.x, 100 - origin.z) + origin.y).toBeCloseTo(9.4, 0); // Faded out beyond 700 m.
  const positions = terrain.mesh.geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) expect(Number.isFinite(positions.getY(i))).toBe(true);
  expect(terrain.mesh.receiveShadow).toBe(false);
});

it('rises to the base of a wall standing off the road, so it never floats', () => {
  // A road sheet at 10 m and, 60 m to its side, a wall standing from 14 m to 15 m.
  const road = surface([0, 10, 0, 40, 10, 0, 0, 10, 200, 40, 10, 0, 40, 10, 200, 0, 10, 200]);
  const wall = surface([100, 14, 0, 100, 14, 200, 100, 15, 0, 100, 14, 200, 100, 15, 200, 100, 15, 0]);
  const bounds = {min: [0, 10, 0], max: [100, 15, 200]}, origin = new Vector3(50, 12, 100);
  const height = (x: number) => createDefaultTerrain([road, wall], bounds, origin, 9.4, '#76734f').heightAt(x - origin.x, 100 - origin.z) + origin.y;
  expect(height(100)).toBeLessThan(14);
  expect(height(100)).toBeGreaterThan(13.5);
  expect(createDefaultTerrain([road], bounds, origin, 9.4, '#76734f').heightAt(100 - origin.x, 0)).toBeLessThan(height(100) - origin.y - 1); // Road-only relief left it hovering.
});
