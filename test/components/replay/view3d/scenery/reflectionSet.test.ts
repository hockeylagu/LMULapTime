import { expect, it } from 'vitest';
import { Group, Object3D, Vector3 } from 'three';
import { createReflectionSet } from '../../../../../src/components/replay/view3d/scenery/reflectionSet.js';
import type { ChunkLoader } from '../../../../../src/components/replay/view3d/scenery/chunkLoader.js';
import type { SceneryLayout, SceneryReflectionChunk } from '../../../../../shared/types/scenes/scenery.js';
import { testLayout } from './layoutFixture.js';

const chunk = (id: string): SceneryReflectionChunk => ({
  id, kind: 'main', lapStartM: 0, lapEndM: 500, bounds: {min: [0, 0, 0], max: [1, 1, 1]}, sha256: id.padEnd(64, '0'), byteLength: 10,
  triangles: 1, vertices: 3, drawCalls: 1, blocks: 1, geometryBytes: 10, asset: `scenery/${id}.glb`, textures: [],
});
const withReflection = (chunks: SceneryReflectionChunk[]): SceneryLayout => {
  const layout = testLayout();
  return {...layout, reflection: {...layout.reflection, chunks}};
};
function stubLoader() {
  const loaded: string[] = [];
  const loader = {load: (file: {id: string}) => { loaded.push(file.id); return Promise.resolve(new Group()); }} as unknown as ChunkLoader;
  return {loader, loaded};
}

it('has an empty root without reflection chunks: the probe then reflects only the sky', async () => {
  const {loader, loaded} = stubLoader();
  const set = createReflectionSet(withReflection([]), loader, new Vector3());
  expect(set.root.children).toEqual([]); expect(set.root.visible).toBe(false);
  expect(await set.load('s000', new AbortController().signal)).toBeNull();
  expect(loaded).toEqual([]);
});

it("loads a scenery chunk's reflection chunk by id, shifted by the scene origin, and shows it while its scenery shows", async () => {
  const {loader, loaded} = stubLoader();
  const set = createReflectionSet(withReflection([chunk('s000')]), loader, new Vector3(100, 0, 50));
  expect(set.root.visible).toBe(false); expect(set.root.position.toArray()).toEqual([-100, -0, -50]);
  // A sector without a reflection chunk (sectors may have none) loads nothing.
  expect(await set.load('s001', new AbortController().signal)).toBeNull();
  const reflection = await set.load('s000', new AbortController().signal) as Object3D;
  expect(loaded).toEqual(['s000']);
  const parent = new Group(), scenery = new Group(); parent.add(scenery);
  set.join(scenery, reflection);
  expect(reflection.parent).toBe(set.root); expect(reflection.visible).toBe(false);
  // Placed once on joining: the set never shows in a frame, so the scene's matrix update never reaches it.
  expect(reflection.matrixWorld.elements[12]).toBe(-100);
  set.sync(); expect(reflection.visible).toBe(true);
  scenery.visible = false; set.sync(); expect(reflection.visible).toBe(false);
  // A scenery chunk taken out of the scene hides its reflection too.
  scenery.visible = true; parent.remove(scenery); set.sync(); expect(reflection.visible).toBe(false);
});
