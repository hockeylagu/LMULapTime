import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import { applyKerbStripes } from '../../../../src/components/replay/view3d/kerbStripes.js';

it('gives each kerb vertex its continuous lap distance, and leaves kerbs beyond the lap unstriped', () => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([3, 0, 5, 3, 0, 7.5, 500, 0, 0], 3));
  const kerb = new Mesh(geometry, new MeshStandardMaterial()); kerb.name = 'kerb';
  const root = new Group(); root.add(kerb);
  // Samples every 5 m along +Z: kerbs are metres off the line, between samples.
  const points = Array.from({length: 5}, (_, i) => ({x: 0, y: 0, z: i * 5}));
  applyKerbStripes(root, points, points.map((_, i) => 100 + i * 5));
  const stations = geometry.getAttribute('kerbStation');
  expect(stations.getX(0)).toBeCloseTo(105); expect(stations.getX(1)).toBeCloseTo(107.5); expect(stations.getX(2)).toBe(-1);
  expect(Object.hasOwn(kerb.material, 'onBeforeCompile')).toBe(true); // Striped by the shader patch.
});
