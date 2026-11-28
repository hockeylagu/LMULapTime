import { BatchedMesh, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshDepthMaterial, MeshStandardMaterial, Vector3, type BufferAttribute, type BufferGeometry, type Material } from 'three';
import { expect, it } from 'vitest';
import type { SceneryMaterialTotals } from '../../../../../shared/packageContract/index.js';
import { surfaceTextureUnits } from '../../../../../src/components/replay/view3d/scenery/materials/shaderParts.js';
import type { SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';
import { surface } from './surfaceFixture.js';
import { createSceneryBatches } from '../../../../../src/components/replay/view3d/scenery/sceneryBatches.js';

const BOX = {vertices: 24, indices: 36};
/** The package's totals for `key`: `primitives` boxes drawn `draws` times. */
const totals = (key: string, primitives: number, draws: number): SceneryMaterialTotals => ({key, vertices: BOX.vertices * primitives, indices: BOX.indices * primitives, primitives, draws});
/** A configured surface material (shared across chunks by the loader) with the package key `key`. */
const material = (key?: string, options = {}) => { const made = new MeshStandardMaterial(options); made.userData.surfaceConfigured = true; made.userData.surfaceTextureUnits = 10; if (key) made.userData.lmuMaterial = key; return made; };
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
  const batches = createSceneryBatches(scenery, [totals('a', 2, 3)], 16);
  const first = chunk([shared, asphalt], [shared, asphalt]), second = chunk([new BoxGeometry(), asphalt]);
  const created = batches.add(first);
  expect(created).toHaveLength(1);
  const batch = created[0];
  expect(batches.add(second)).toEqual([]); // The batch exists: nothing new to compile or upload.
  expect([batch.material, batch.perObjectFrustumCulled, batch.sortObjects]).toEqual([asphalt, false, false]);
  // A geometry two nodes use is stored once; the originals stay in their chunk, hidden and without geometry.
  expect([batch.getGeometryIdAt(0), batch.getGeometryIdAt(1), batch.getGeometryIdAt(2)]).toEqual([0, 0, 1]);
  const originals = first.children as Mesh[];
  expect(originals.every(mesh => !mesh.visible && mesh.layers.mask === 0 && mesh.geometry !== shared && !mesh.geometry.getAttribute('position'))).toBe(true);
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
  const asphalt = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 2, 2)], 16);
  const [batch] = batches.add(chunk([new BoxGeometry(), asphalt]));
  if (batch.boundingSphere === null) batch.computeBoundingSphere(); // As a first frame culling it.
  const far = chunk([new BoxGeometry(), asphalt]); far.children[0].position.x = 1000;
  batches.add(far);
  expect(batch.boundingSphere!.containsPoint(far.children[0].position)).toBe(true);
});

it('splits a material by shadow flags, each part reserving the material totals', () => {
  const asphalt = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 2, 2)], 16);
  const root = chunk([new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt]);
  (root.children[1] as Mesh).castShadow = true;
  const created = batches.add(root);
  expect(created.map(batch => [batch.castShadow, batch.maxInstanceCount])).toEqual([[false, 2], [true, 2]]);
});

it('keeps its own draw for a glTF material or a hooked mesh', () => {
  const batches = createSceneryBatches(new Group(), [totals('a', 1, 1), totals('g', 1, 1)], 16);
  const flag = new Mesh(new BoxGeometry(), material('f')); flag.onBeforeRender = () => {}; flag.userData.lmuMaterial = 'f';
  const root = chunk([new BoxGeometry(), material('a')], [new BoxGeometry(), material('g', {transparent: true})]);
  // A mesh without a surface description keeps its chunk's own glTF material: it cannot share a batch with other chunks.
  const gltf = new MeshStandardMaterial(); gltf.userData.lmuMaterial = 'a';
  root.add(flag, Object.assign(new Mesh(new BoxGeometry(), gltf), {userData: {lmuMaterial: 'a'}}));
  const [batch, glass] = batches.add(root);
  // The see-through surface batches too, its instances sorted back to front; the opaque batch is not sorted.
  expect((root.children as Mesh[]).map(mesh => mesh.visible)).toEqual([false, false, true, true]);
  expect([batch.sortObjects, glass.sortObjects]).toEqual([false, true]);
});

it('batches camera-facing cards with their shadow material, the culling bounds grown by how far a card reaches as it turns', () => {
  const batches = createSceneryBatches(new Group(), [totals('c', 1, 2)], 16), leaves = material('c'), shadow = new MeshDepthMaterial();
  // A card's corners: 3 m either side of its pivot.
  const geometry = new BoxGeometry();
  geometry.setAttribute('_lmu_corner', new Float32BufferAttribute(Array.from({length: geometry.getAttribute('position').count}, (_, i) => [i % 2 ? 3 : -3, 0]).flat(), 2));
  const root = chunk([geometry, leaves], [geometry, leaves]);
  for (const card of root.children as Mesh[]) card.customDepthMaterial = shadow;
  (root.children[1] as Mesh).scale.setScalar(2); // A card scaled twice reaches twice as far.
  const [batch] = batches.add(root);
  expect([batch.instanceCount, batch.customDepthMaterial, root.children.some(card => card.visible)]).toEqual([2, shadow, false]);
  // The box's own bounds (half a metre, up to 1 m scaled), grown by the widest reach: 6 m.
  expect(batch.boundingBox!.max.x).toBeCloseTo(1 + 6);
  // A card with another shadow material cannot join the batch.
  const other = chunk([geometry, leaves]);
  (other.children[0] as Mesh).customDepthMaterial = new MeshDepthMaterial();
  expect(() => batches.add(other)).toThrow('draws with two materials');
});

it('keeps its own draw for a node the night switch shows and hides', () => {
  const batches = createSceneryBatches(new Group(), [totals('a', 2, 2)], 16), asphalt = material('a');
  const root = chunk([new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt]);
  root.children[1].userData.lmuVisibility = 'day';
  const [batch] = batches.add(root);
  expect([batch.instanceCount, root.children[1].visible]).toEqual([1, true]);
});

it('takes a material that only switched nodes draw, with no batch for it', () => {
  const batches = createSceneryBatches(new Group(), [totals('a', 1, 1)], 16), root = chunk([new BoxGeometry(), material('a')]);
  root.children[0].userData.lmuVisibility = 'night';
  expect(batches.add(root)).toEqual([]);
});

it('goes by each mesh\'s own key when two package materials share one configured material', () => {
  const concrete = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 1, 1), totals('b', 1, 1)], 16);
  const root = chunk([new BoxGeometry(), concrete], [new BoxGeometry(), concrete]);
  root.children[1].userData.lmuMaterial = 'b';
  expect(batches.add(root).map(batch => [batch.material, batch.maxInstanceCount])).toEqual([[concrete, 1], [concrete, 1]]);
});

it('throws when a chunk does not match the package facts', () => {
  const make = () => createSceneryBatches(new Group(), [totals('a', 1, 1), totals('b', 2, 2)], 16);
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

it("drops a batch's CPU arrays after the upload that follows its material's last primitive", () => {
  const asphalt = material('a'), batches = createSceneryBatches(new Group(), [totals('a', 2, 2)], 16);
  const [batch] = batches.add(chunk([new BoxGeometry(), asphalt]));
  const buffers = [batch.geometry.index!, ...Object.values(batch.geometry.attributes)] as BufferAttribute[];
  const upload = () => buffers.forEach(buffer => buffer.onUploadCallback());
  const bytes = () => buffers.map(buffer => buffer.array.length);
  upload(); // A chunk is still to come: the batch keeps writing into its arrays.
  expect(bytes().every(length => length > 0)).toBe(true);
  batches.add(chunk([new BoxGeometry(), asphalt]));
  expect(bytes().every(length => length > 0)).toBe(true); // Not uploaded yet: the pending ranges still read them.
  upload();
  expect(bytes()).toEqual(buffers.map(() => 0));
  expect(buffers.map(buffer => [buffer.updateRanges.length, buffer.count > 0])).toEqual(buffers.map(() => [0, true]));
  // Its geometry keeps the batch's bounds: a sort or a warm-up draw never computes them from the emptied arrays.
  expect(batch.geometry.boundingSphere!.radius).toBeCloseTo(batch.boundingSphere!.radius);
  expect(batch.geometry.boundingBox!.equals(batch.boundingBox!)).toBe(true);
});

const MAP: SurfaceMap = {texture: 't', uv: 'uv0', scale: [1, 1], srgb: true};
const TERRAIN_KEYS = ['layerA', 'layerB', 'layerC', 'layerD', 'normalA', 'normalB', 'mix', 'pattern', 'splatter', 'splatterOverlay'];

it("keeps a material whose program needs more texture units than three allows (with the batch's two vertex textures) as its own draw", () => {
  const heavy = material('t'), light = material('s'), batches = createSceneryBatches(new Group(), [totals('t', 1, 1), totals('s', 1, 1)], 16);
  const terrain = (count: number) => surfaceTextureUnits(surface('terrain', {maps: Object.fromEntries(TERRAIN_KEYS.slice(0, count).map(key => [key, MAP])), flags: {layers: '4'}}));
  heavy.userData.surfaceTextureUnits = terrain(10); light.userData.surfaceTextureUnits = terrain(9);
  const root = chunk([new BoxGeometry(), heavy], [new BoxGeometry(), light]);
  const created = batches.add(root);
  expect(created.map(batch => batch.material)).toEqual([light]);
  expect((root.children as Mesh[]).map(mesh => [mesh.visible, mesh.material])).toEqual([[true, heavy], [false, light]]);
});

it('throws for a configured material without its unit count', () => {
  const bare = material('a'); delete bare.userData.surfaceTextureUnits;
  expect(() => createSceneryBatches(new Group(), [totals('a', 1, 1)], 16).add(chunk([new BoxGeometry(), bare]))).toThrow('texture unit count');
});

it("draws each instance within its node's distance range from a car's eye, and every instance from no eye", () => {
  const scenery = new Group(), asphalt = material('a'), kerb = material('k');
  scenery.position.set(5, 0, 0); scenery.updateMatrixWorld(); // The batches draw in the scenery's space; the eye is in world space.
  const batches = createSceneryBatches(scenery, [totals('a', 3, 3), totals('k', 1, 1)], 16);
  const root = chunk([new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt], [new BoxGeometry(), asphalt], [new BoxGeometry(), kerb]);
  const [near, far, unlimited, kerbMesh] = root.children;
  near.userData.lmuLod = {inM: 0, outM: 100};
  far.position.x = 300; far.userData.lmuLod = {inM: 0, outM: 250};
  unlimited.position.x = 5000; unlimited.userData.lmuLod = {inM: 0, outM: null};
  kerbMesh.position.x = 400; kerbMesh.userData.lmuLod = {inM: 0, outM: 200};
  const [batch, kerbs] = batches.add(root);
  scenery.add(root); batches.sync();
  expect(shown(batch, 3)).toEqual([true, true, true]); // Until the first eye, everything resident draws.
  batches.cull(new Vector3(5, 0, 0));
  // 299.5 m to the far box's nearest face is past its 250 m; the kerb batch draws nothing and leaves the scene.
  expect([shown(batch, 3), kerbs.parent]).toEqual([[true, false, true], null]);
  batches.cull(new Vector3(14, 0, 0)); // Under the step: not checked again.
  expect(shown(batch, 3)).toEqual([true, false, true]);
  batches.cull(new Vector3(205, 0, 0));
  // 199.5 m to the near box now, 99.5 m to the far one, 199.5 m to the kerb's.
  expect([shown(batch, 3), kerbs.parent]).toEqual([[false, true, true], scenery]);
  // A view's LOD multiplier scales every range, checked again at once though the eye has not moved: 199.5 / 2 is inside 100 m.
  batches.cull(new Vector3(205, 0, 0), 2);
  expect(shown(batch, 3)).toEqual([true, true, true]);
  batches.cull(null);
  expect(shown(batch, 3)).toEqual([true, true, true]);
  // A chunk added while a car's eye culls takes its ranges from that eye.
  batches.cull(new Vector3(5, 0, 0));
  const late = chunk([new BoxGeometry(), material('b')]); late.children[0].position.x = 600; late.children[0].userData.lmuLod = {inM: 0, outM: 500};
  const lateBatches = createSceneryBatches(scenery, [totals('b', 1, 1)], 16);
  lateBatches.cull(new Vector3(5, 0, 0));
  const [lateBatch] = lateBatches.add(late);
  scenery.add(late); lateBatches.sync();
  expect([shown(lateBatch, 1), lateBatch.parent]).toEqual([[false], null]);
  batches.dispose(); lateBatches.dispose();
});
