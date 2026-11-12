import { BatchedMesh, BoxGeometry, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, type BufferGeometry, type Material } from 'three';
import { expect, it } from 'vitest';
import type { SceneryMaterialTotals } from '../../../../../shared/packageContract/index.js';
import { createSceneryBatches } from '../../../../../src/components/replay/view3d/scenery/sceneryBatches.js';

const BOX = {vertices: 24, indices: 36};
/** The package's totals for `key`: `primitives` boxes drawn `draws` times. */
const totals = (key: string, primitives: number, draws: number): SceneryMaterialTotals => ({key, vertices: BOX.vertices * primitives, indices: BOX.indices * primitives, primitives, draws});
/** A configured surface material (shared across chunks by the loader) with the package key `key`. */
const material = (key?: string, options = {}) => { const made = new MeshStandardMaterial(options); made.userData.surfaceConfigured = true; if (key) made.userData.lmuMaterial = key; return made; };
const chunk = (...meshes: Array<[BufferGeometry, Material]>) => {
  const root = new Group();
  // As the chunk loader: each mesh keeps its GLB material's package key.
  for (const [geometry, made] of meshes) {
    const mesh = new Mesh(geometry, made);
    const packageKey: unknown = made.userData.lmuMaterial;
    if (typeof packageKey === 'string') mesh.userData.lmuMaterial = packageKey;
    root.add(mesh);
  }
  return root;
};
/** Whether each instance of `batch` shows, in instance order. */
const shown = (batch: BatchedMesh, count: number) => Array.from({length: count}, (_, id) => batch.getVisibleAt(id));

it('draws a material once across chunks, each chunk shown while it is in the scene and visible', () => {
  const scenery = new Group(), asphalt = material('a'), shared = new BoxGeometry();
  const batches = createSceneryBatches(scenery, [totals('a', 2, 3)]);
  const first = chunk([shared, asphalt], [shared, asphalt]), second = chunk([new BoxGeometry(), asphalt]);
  const created = batches.add(first);
  expect(created).toHaveLength(1);
  const batch = created[0];
  expect(batches.add(second)).toEqual([]); // The batch exists: nothing new to compile or upload.
  expect([batch.material, batch.perObjectFrustumCulled, batch.sortObjects]).toEqual([asphalt, false, false]);
  // A geometry two nodes use is stored once; the originals stay in their chunk, hidden and without geometry.
  expect([batch.getGeometryIdAt(0), batch.getGeometryIdAt(1), batch.getGeometryIdAt(2)]).toEqual([0, 0, 1]);
  const originals = first.children as Mesh[];
  expect(originals.every(mesh => !mesh.visible && mesh.geometry !== shared && !mesh.geometry.getAttribute('position'))).toBe(true);
  // Loaded chunks stay hidden until they join the scene, and the batch stays out of it (its program is not drawn before the warm-up).
  expect([shown(batch, 3), batch.parent]).toEqual([[false, false, false], null]);
  scenery.add(first, second); batches.sync();
  expect([shown(batch, 3), batch.parent]).toEqual([[true, true, true], scenery]);
  second.visible = false; batches.sync();
  expect(shown(batch, 3)).toEqual([true, true, false]);
  first.visible = false; batches.sync();
  expect(batch.parent).toBeNull(); // No shown chunk draws from it.
  first.visible = true; batches.sync();
  expect(batch.parent).toBe(scenery);
  batches.dispose();
  expect(batch.parent).toBeNull();
});

it("grows a batch's culling bounds with each chunk it draws", () => {
  const asphalt = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 2, 2)]);
  const [batch] = batches.add(chunk([new BoxGeometry(), asphalt]));
  if (batch.boundingSphere === null) batch.computeBoundingSphere(); // As a first frame culling it.
  const far = chunk([new BoxGeometry(), asphalt]); far.children[0].position.x = 1000;
  batches.add(far);
  expect(batch.boundingSphere!.containsPoint(far.children[0].position)).toBe(true);
});

it('splits a material by shadow flags, each part reserving the material totals', () => {
  const asphalt = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 2, 2)]);
  const root = chunk([new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt]);
  (root.children[1] as Mesh).castShadow = true;
  const created = batches.add(root);
  expect(created.map(batch => [batch.castShadow, batch.maxInstanceCount])).toEqual([[false, 2], [true, 2]]);
});

it('keeps its own draw for a glTF material, a transparent, camera-facing or hooked mesh, and gives back a removed chunk', () => {
  const batches = createSceneryBatches(new Group(), [totals('a', 1, 1)]);
  const card = new Mesh(new BoxGeometry(), material('c')); card.customDepthMaterial = new MeshDepthMaterial(); card.userData.lmuMaterial = 'c';
  const flag = new Mesh(new BoxGeometry(), material('f')); flag.onBeforeRender = () => {}; flag.userData.lmuMaterial = 'f';
  const root = chunk([new BoxGeometry(), material('a')], [new BoxGeometry(), material('g', {transparent: true})]);
  // A mesh without a surface description keeps its chunk's own glTF material: it cannot share a batch with other chunks.
  const gltf = new MeshStandardMaterial(); gltf.userData.lmuMaterial = 'a';
  root.add(card, flag, Object.assign(new Mesh(new BoxGeometry(), gltf), {userData: {lmuMaterial: 'a'}}));
  const [batch] = batches.add(root);
  expect((root.children as Mesh[]).map(mesh => mesh.visible)).toEqual([false, true, true, true, true]);
  batches.remove(root);
  expect(() => batch.getVisibleAt(0)).toThrow();
});

it('goes by each mesh\'s own key when two package materials share one configured material', () => {
  const concrete = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 1, 1), totals('b', 1, 1)]);
  const root = chunk([new BoxGeometry(), concrete], [new BoxGeometry(), concrete]);
  root.children[1].userData.lmuMaterial = 'b';
  expect(batches.add(root).map(batch => [batch.material, batch.maxInstanceCount])).toEqual([[concrete, 1], [concrete, 1]]);
});

it('throws when a chunk does not match the package facts', () => {
  const make = () => createSceneryBatches(new Group(), [totals('a', 1, 1), totals('b', 2, 2)]);
  expect(() => make().add(chunk([new BoxGeometry(), material()]))).toThrow('without its package key');
  expect(() => make().add(chunk([new BoxGeometry(), material('z')]))).toThrow('not in the layout');
  expect(() => make().add(chunk([new BoxGeometry(), material('a')], [new BoxGeometry(), material('a')]))).toThrow('two materials');
  const asphalt = material('a');
  expect(() => make().add(chunk([new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt]))).toThrow('more primitives');
  const shared = new BoxGeometry();
  expect(() => make().add(chunk([shared, asphalt], [shared, asphalt]))).toThrow('draws more');
  const kerb = material('b'), plain = new BoxGeometry().toNonIndexed();
  expect(() => make().add(chunk([new BoxGeometry(), kerb], [plain, kerb]))).toThrow('different attributes');
});
