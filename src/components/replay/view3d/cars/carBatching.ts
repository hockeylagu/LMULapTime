import { BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RedFormat, type BatchedMesh, type Material } from 'three';
import { addHiddenInstance, computeBatchBounds, createBatch, createShownCounts, layoutOf, releaseBatchOnUpload } from '../batching/batchedParts.js';
import type { CarPart, CarParts } from './carParts.js';

/**
 * A lit car part whose material and geometry a batch can draw: lamps keep their own draws (switched per frame), and so do glass and
 * decals (`transparent`) unless the batching sorts them.
 */
export function batchable(mesh: Mesh<BufferGeometry, Material | Material[]>, transparent = false): mesh is Mesh<BufferGeometry, MeshStandardMaterial> {
  const material = mesh.material;
  return !Array.isArray(material) && material instanceof MeshStandardMaterial && (transparent || !material.transparent) && material.visible
    && !mesh.customDepthMaterial && mesh.onBeforeRender === Object3D.prototype.onBeforeRender;
}

/**
 * The camera layer of the shadow-only batches: the sun's shadow cameras see it, the view and the reflection probe do not (they see
 * layer 0 only).
 */
export const SHADOW_ONLY_LAYER = 1;
/**
 * What a shadow-only batch draws with: the shadow pass swaps it for its depth material (both faces, as the car materials cast), and
 * no other pass draws the batch.
 */
const SHADOW_ONLY = new MeshBasicMaterial({shadowSide: DoubleSide});

/**
 * What a batched stand-in holds once its vertices are only in its batch (`releaseParsed`): no vertices, the geometry's bounds (a
 * wheel rig measures its wheel from them).
 */
function moved(geometry: BufferGeometry): BufferGeometry {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  if (!geometry.boundingSphere) geometry.computeBoundingSphere();
  const stand = new BufferGeometry();
  stand.boundingBox = geometry.boundingBox!.clone(); stand.boundingSphere = geometry.boundingSphere!.clone();
  return stand;
}

/** Whether the part's material casts the whole surface of its geometry from both faces, as the shadow-only batch does: opaque, no cut-out. */
const castsSolid = (material: MeshStandardMaterial) => !material.transparent && material.alphaTest === 0 && !material.alphaToCoverage
  && (material.shadowSide ?? material.side) === DoubleSide;

/** The positions and index of `geometry`: what its sun shadow needs. */
function shadowGeometry(geometry: BufferGeometry): BufferGeometry {
  const source = geometry.attributes.position, positions = new Float32Array(source.count * 3);
  for (let index = 0; index < source.count; index++) {
    positions[3 * index] = source.getX(index); positions[3 * index + 1] = source.getY(index); positions[3 * index + 2] = source.getZ(index);
  }
  const shadow = new BufferGeometry();
  shadow.setAttribute('position', new BufferAttribute(positions, 3)); shadow.setIndex(geometry.index);
  return shadow;
}

/**
 * The car's layer in its material's livery arrays, set on each mesh drawn with a livery material (one material for the cars of a
 * body whose liveries share it, each car sampling its own layer); undefined for any other mesh.
 */
export const liveryLayerOf = (mesh: Mesh): number | undefined => mesh.userData.liveryLayer as number | undefined;

/**
 * Gives a livery material's batch its cars' layers: one texel per instance (R32F, at the instance id), which the material reads as
 * `userData.carLiveryLayer`. A livery material therefore has exactly one batch.
 */
function liveryLayers(batch: BatchedMesh, members: readonly CarPart[]): DataTexture {
  const layers = new Float32Array(batch.maxInstanceCount);
  for (const part of members) layers[part.instance] = liveryLayerOf(part.mesh)!;
  const texture = new DataTexture(layers, layers.length, 1, RedFormat, FloatType);
  texture.needsUpdate = true;
  batch.material.userData.carLiveryLayer = texture;
  return texture;
}

export interface CarBatchSet {
  /** The batches several cars share, for the caller to add beside the cars (their parent); empty for one car, whose batches ride in it. */
  readonly shared: Group;
  /** Every batch of the set, to warm up before `ready`. */
  readonly batches: readonly BatchedMesh[];
  /** Once warmed up (every batch uploaded, its vertices gone from the CPU): a batch draws only while one of its instances shows. */
  ready(): void;
  dispose(): void;
}

/**
 * Draws the opaque parts of a set of cars (their part tables) that share a material as one multi-draw: a draw costs the main thread
 * about the same whatever its size, and a car has about a hundred parts but a third as many materials once identical ones are
 * shared. The cars of a body that share their materials (the loader's `shareMaterials`) share their batches, which hold one copy of
 * each geometry: only the livery's own materials split them. The parts stay in each model as stand-ins without a camera layer,
 * their tables placing the instances (`sync`). A material with a single part keeps its own draw.
 *
 * The set is built at its exact size. With `releaseParsed` (cars of a body loaded all at once from a parsed file no other car reads),
 * the batched stand-ins let go of their geometry; the batches drop their own CPU copy once uploaded, in any case. With `transparent`
 * (every car drawn with its full model but the lap's ghost, and the far cars), glass and decals batch too, their instances drawn
 * back to front within each batch.
 * With `shadows`, the batched parts that cast a solid shadow cast it from one shadow-only batch (positions only, on
 * `SHADOW_ONLY_LAYER`) instead of their own batches: one draw per sun shadow layer for the set rather than one per material.
 */
export function batchCars(tables: readonly CarParts[], {releaseParsed, transparent = false, shadows = false}:
  {releaseParsed: boolean; transparent?: boolean; shadows?: boolean}): CarBatchSet {
  const groups = new Map<string, CarPart[]>(), unbatched = new Set<BufferGeometry>();
  for (const table of tables) for (const part of table.parts) {
    const mesh = part.mesh;
    const livery = liveryLayerOf(mesh) !== undefined;
    if (!batchable(mesh, transparent)) {
      if (livery) throw Error(`Car livery material ${String((mesh.material as Material).name)} cannot be batched`);
      unbatched.add(mesh.geometry); continue;
    }
    // A livery material's parts share one batch, which carries their layers: they need one vertex layout.
    const key = livery ? mesh.material.uuid : `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${layoutOf(mesh.geometry)}`;
    if (livery && groups.has(key) && layoutOf(groups.get(key)![0].mesh.geometry) !== layoutOf(mesh.geometry)) {
      throw Error(`Car livery material ${mesh.material.name} draws geometries of two vertex layouts`);
    }
    groups.set(key, [...groups.get(key) ?? [], part]);
  }
  const single = tables.length === 1 ? tables[0] : null, shared = new Group(), batches: BatchedMesh[] = [], copied = new Set<BufferGeometry>();
  /** The parts the shadow-only batch casts for. */
  const casting: CarPart[] = [];
  /** The livery batches' layer textures. */
  const layerTextures: DataTexture[] = [];
  let warmed = false;
  const counts = createShownCounts((batch, visible) => { if (warmed) batch.visible = visible; });
  for (const members of groups.values()) {
    const first = members[0].mesh as Mesh<BufferGeometry, MeshStandardMaterial>, livery = liveryLayerOf(first) !== undefined;
    // A livery part reads its layer through its batch, even alone.
    if (members.length < 2 && !livery) { unbatched.add(first.geometry); continue; }
    const geometries = [...new Set(members.map(part => part.mesh.geometry))];
    const vertices = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
    const indices = geometries.reduce((sum, geometry) => sum + (geometry.index?.count ?? 0), 0);
    // The caller culls a car as a whole. A field spreads round the lap: a shared batch draws in each pass (main view, each shadow
    // cascade) the parts inside it. A car's own batch draws in the car's frame, which its table sets (`sync`).
    const shadowOnly = shadows && first.castShadow && castsSolid(first.material) && geometries.every(geometry => geometry.index);
    if (shadowOnly) casting.push(...members);
    const batch = createBatch({
      draws: members.length, vertices, indices, material: first.material, name: `car batch ${first.material.name}`,
      castShadow: first.castShadow && !shadowOnly, receiveShadow: first.receiveShadow, frustumCulled: false, perObjectFrustumCulled: !single, matrixAutoUpdate: false,
    });
    batch.sortObjects = first.material.transparent;
    const ids = new Map(geometries.map(geometry => [geometry, batch.addGeometry(geometry)]));
    for (const part of members) {
      part.batch = batch; part.instance = addHiddenInstance(batch, ids.get(part.mesh.geometry)!); part.shown = false;
      part.mesh.layers.disableAll(); part.mesh.castShadow = false; part.mesh.receiveShadow = false;
    }
    if (livery) layerTextures.push(liveryLayers(batch, members));
    for (const geometry of geometries) copied.add(geometry);
    computeBatchBounds(batch); releaseBatchOnUpload(batch);
    if (single) single.car.add(batch); else shared.add(batch);
    batches.push(batch);
  }
  if (casting.length) {
    const geometries = [...new Set(casting.map(part => part.mesh.geometry))], copies = new Map(geometries.map(geometry => [geometry, shadowGeometry(geometry)]));
    const batch = createBatch({
      draws: casting.length, vertices: geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0),
      indices: geometries.reduce((sum, geometry) => sum + geometry.index!.count, 0), material: SHADOW_ONLY, name: 'car shadow batch',
      castShadow: true, receiveShadow: false, frustumCulled: false, perObjectFrustumCulled: !single, matrixAutoUpdate: false,
    });
    batch.layers.set(SHADOW_ONLY_LAYER);
    const ids = new Map(geometries.map(geometry => [geometry, batch.addGeometry(copies.get(geometry)!)]));
    for (const part of casting) part.shadow = {batch, instance: addHiddenInstance(batch, ids.get(part.mesh.geometry)!)};
    for (const copy of copies.values()) copy.dispose();
    computeBatchBounds(batch); releaseBatchOnUpload(batch);
    if (single) single.car.add(batch); else shared.add(batch);
    batches.push(batch);
  }
  for (const table of tables) { table.onShown = counts.change; table.own = single ? batches : []; }
  if (releaseParsed) {
    // The batches hold the vertices now. The batched stand-ins draw nothing and no pass reads their vertices (no camera layer, no
    // shadow): they keep the bounds alone, and once the caller drops its parsed file nothing holds the parsed vertices.
    const stands = new Map<BufferGeometry, BufferGeometry>();
    for (const table of tables) for (const part of table.parts) {
      const geometry = part.mesh.geometry;
      if (!part.batch || unbatched.has(geometry)) continue;
      let stand = stands.get(geometry);
      if (!stand) { stand = moved(geometry); stands.set(geometry, stand); }
      part.mesh.geometry = stand;
    }
    // A parsed body's geometry (`sharedAsset`) may still draw another car built from the same parse (the lap's ghost): the parse
    // owns it.
    for (const geometry of copied) if (!unbatched.has(geometry) && geometry.userData.sharedAsset !== true) geometry.dispose();
  }
  return {
    shared, batches,
    ready() { warmed = true; for (const batch of batches) batch.visible = counts.of(batch) > 0; },
    dispose() {
      for (const table of tables) { table.own = []; table.onShown = () => {}; for (const part of table.parts) part.shadow = null; }
      for (const batch of batches) { batch.removeFromParent(); batch.dispose(); }
      for (const texture of layerTextures) texture.dispose();
      shared.removeFromParent();
    },
  };
}
