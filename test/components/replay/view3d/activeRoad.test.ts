import { expect, it } from 'vitest';
import { BufferGeometry, Color, DataTexture, Group, Mesh, MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { ACTIVE_ROAD_COLOR, applyActiveRoad } from '../../../../src/components/replay/view3d/activeRoad.js';

const bounds = {min: [0, 0, 0], max: [100, 10, 50]};
function scene(): {root: Group; material: MeshStandardMaterial} {
  const material = new MeshStandardMaterial({color: '#888888'}), road = new Mesh(new BufferGeometry(), material);
  road.name = 'road'; const root = new Group(); root.add(road);
  return {root, material};
}

it('paints the whole road in the active colour when the layout has no 2D road outline', () => {
  const {root, material} = scene();
  applyActiveRoad(root, null, bounds);
  expect(material.color.getHex()).toBe(new Color(ACTIVE_ROAD_COLOR).getHex());
  expect(material.onBeforeCompile.toString()).not.toContain('activeRoad');
});

it('samples the outline mask by native x/z across the scene bounds', () => {
  const {root, material} = scene(), mask = new DataTexture(new Uint8Array(1), 1, 1);
  applyActiveRoad(root, mask, bounds);
  const shader = {uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>'} as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as never);
  expect(shader.uniforms.activeRoad.value).toBe(mask);
  expect(shader.uniforms.activeRoadMin.value).toEqual([0, 0]);
  expect(shader.uniforms.activeRoadSpan.value).toEqual([100, 50]);
  expect(shader.vertexShader).toContain('position.xz');
  expect(shader.fragmentShader).toContain('texture2D(activeRoad');
});
