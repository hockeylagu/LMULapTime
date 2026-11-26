import { Box3, BufferGeometry, Mesh, Object3D, Vector3, type BatchedMesh, type Material } from 'three';
import type { SceneryMaterialTotals } from '../../../../../shared/packageContract/index.js';
import { BATCH_VERTEX_TEXTURES } from './materials/shaderParts.js';
import { sceneVisibility } from '../night/nightSwitch.js';
import { addHiddenInstance, computeBatchBounds, createBatch, createShownCounts, layoutOf, releaseBatchOnUpload } from '../batching/batchedParts.js';

export interface SceneryBatches {
  /**
   * Moves `root`'s batchable meshes into their batches, hidden until the chunk joins the scene. Returns the batches this chunk
   * created: they have programs to compile and buffers to upload.
   */
  add(root: Object3D): BatchedMesh[];
  /** Shows each chunk's instances while its root is in the scene and visible. */
  sync(): void;
  /**
   * Draws each instance only within its node's distance range from `eye` (world space): the package's `lmuLod` {inM, outM},
   * measured to the nearest point of the instance's box. Checked again once the eye has moved `CULL_STEP_M`; a batch with no
   * instance in range leaves the scene, so it costs no draw. A null eye draws every instance: the zoomed trackside views, whose
   * distance scale follows the zoom, and the free views. `lodMultiplier` scales every range (the view's, `CameraRig.lodMultiplier`).
   */
  cull(eye: Vector3 | null, lodMultiplier?: number): void;
  dispose(): void;
}

/** An instance and its node's distance range (squared, metres), against its box in the batch's space. */
interface Ranged { instance: number; box: Box3; inSq: number; outSq: number; inRange: boolean; drawn: boolean }
interface Placed { batch: BatchedMesh; instances: Ranged[] }
interface Batch { mesh: BatchedMesh; layout: string }
interface Used { primitives: number; draws: number }

/** Stands in for a batched mesh's own geometry: its data lives in the batch. */
const MOVED = new BufferGeometry();

/** The eye moves this far before the distance ranges are checked again. */
export const CULL_STEP_M = 10;

/**
 * The node's distance range (`extras.lmuLod`, on the mesh or, for a node of several primitives, on its group): drawn from inM to
 * outM metres, to any distance when outM is null. A node without one draws at every distance.
 */
function rangeOf(mesh: Mesh): {inSq: number; outSq: number} {
  const lod: unknown = mesh.userData.lmuLod ?? mesh.parent?.userData.lmuLod;
  if (!lod || typeof lod !== 'object') return {inSq: 0, outSq: Infinity};
  const {inM, outM} = lod as {inM?: unknown; outM?: unknown};
  return {inSq: typeof inM === 'number' ? inM * inM : 0, outSq: typeof outM === 'number' ? outM * outM : Infinity};
}

/**
 * Whether a mesh can draw from a batch. Only configured surfaces share one material across chunks (a mesh without a surface
 * description keeps its chunk's own glTF material). A camera-facing card has its own shadow material, and a mesh with a per-draw
 * hook must keep its own draw. A see-through surface (fences, glass, decals) batches too, its batch sorting its instances back to
 * front in each pass. A program whose samplers plus the batch's vertex textures pass `maxTextures` (three's limit on texture units
 * across both stages) keeps its mesh's own draw, and so does a node the night switch shows and hides (night/nightSwitch.ts).
 */
function batchable(mesh: Mesh<BufferGeometry, Material | Material[]>, maxTextures: number): mesh is Mesh<BufferGeometry, Material> {
  if (!mesh.visible || sceneVisibility(mesh) || Array.isArray(mesh.material) || mesh.material.userData.surfaceConfigured !== true) return false;
  const units: unknown = mesh.material.userData.surfaceTextureUnits;
  if (typeof units !== 'number') throw Error(`Configured scenery material without its texture unit count (${mesh.name})`);
  return units + BATCH_VERTEX_TEXTURES <= maxTextures && !mesh.customDepthMaterial && mesh.onBeforeRender === Object3D.prototype.onBeforeRender;
}

/**
 * Draws each scenery material once across the chunks, as one multi-draw per material and shadow flags, in place of a draw per
 * chunk: a draw costs the main thread about the same whatever its size, and a venue has about one primitive per material per
 * chunk. The package names each material by its content (`lmuMaterial`, kept on the mesh by the chunk loader) and gives its totals
 * over the layout, so a batch is sized once and its buffers never grow; a material split by shadow flags reserves its totals in each part.
 * A chunk's instances stay in their batches until the scene goes (chunks never unload): a hidden chunk only hides them.
 * `maxTextures` is the renderer's `capabilities.maxTextures`. Instances are neither frustum culled nor sorted one by one: that per-pass
 * work cost more than the draws it saved. They are culled by distance once per step of the eye (`cull`), within the package's per-node draw distances.
 */
export function createSceneryBatches(parent: Object3D, materials: readonly SceneryMaterialTotals[], maxTextures: number): SceneryBatches {
  const totals = new Map(materials.map(row => [row.key, row]));
  const batches = new Map<string, Batch>(), byKey = new Map<string, Batch[]>(), used = new Map<string, Used>();
  const chunks = new Map<Object3D, {placed: Placed[]; shown: boolean}>();
  const batchFor = (key: string, mesh: Mesh<BufferGeometry, Material>, layout: string, fresh: BatchedMesh[]): Batch => {
    const id = `${key}|${mesh.castShadow}|${mesh.receiveShadow}`, existing = batches.get(id);
    if (existing) {
      if (existing.mesh.material !== mesh.material) throw Error(`Scenery material ${key} draws with two materials (${mesh.name})`);
      if (existing.layout !== layout) throw Error(`Scenery material ${key} has primitives with different attributes (${mesh.name})`);
      return existing;
    }
    const total = totals.get(key);
    if (!total) throw Error(`Scenery material ${key} is not in the layout (${mesh.name})`);
    const made = createBatch({...total, material: mesh.material, name: `batch ${id}`, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow});
    made.sortObjects = mesh.material.transparent;
    // Outside the scene until a chunk that draws from it is shown, like a chunk's root: three sets a drawn object's program even
    // with no instance to draw, so a batch in the scene before its chunk's warm-up would link its program on the main thread.
    const batch = {mesh: made, layout};
    batches.set(id, batch); fresh.push(made);
    byKey.set(key, [...byKey.get(key) ?? [], batch]);
    return batch;
  };
  /** A batch is in the scene while it draws any instance: one of a shown chunk, within its distance range. */
  const counts = createShownCounts((mesh, visible) => { if (!visible) mesh.removeFromParent(); else if (!mesh.parent) parent.add(mesh); });
  const draw = (mesh: BatchedMesh, ranged: Ranged, drawn: boolean) => {
    if (ranged.drawn === drawn) return;
    ranged.drawn = drawn;
    mesh.setVisibleAt(ranged.instance, drawn);
    counts.change(mesh, drawn ? 1 : -1);
  };
  /** Shows or hides a chunk's instances (those in range). */
  const show = (placed: readonly Placed[], shown: boolean) => {
    for (const {batch: mesh, instances} of placed) for (const ranged of instances) draw(mesh, ranged, shown && ranged.inRange);
  };
  const local = new Vector3();
  /** Where the ranges were last checked (batch space); null while every instance draws. */
  let culledAt: Vector3 | null = null, lodSq = 1;
  /** Sets an instance's range flag against the eye (batch space), or in range with none; a new chunk's instances are set before it is shown. */
  const place = (ranged: Ranged, eye: Vector3 | null) => {
    const distanceSq = eye ? ranged.box.distanceToPoint(eye) ** 2 / lodSq : 0;
    ranged.inRange = !eye || (distanceSq >= ranged.inSq && distanceSq < ranged.outSq);
  };
  const placeAll = (eye: Vector3 | null) => {
    for (const chunk of chunks.values()) {
      for (const {batch: mesh, instances} of chunk.placed) {
        for (const ranged of instances) {
          place(ranged, eye);
          if (chunk.shown) draw(mesh, ranged, ranged.inRange);
        }
      }
    }
  };
  return {
    add(root) {
      if (chunks.has(root)) throw Error('Scenery chunk batched twice');
      root.updateWorldMatrix(true, true);
      const fresh: BatchedMesh[] = [], byBatch = new Map<BatchedMesh, Placed>(), moved: Mesh[] = [], keys = new Set<string>();
      // A geometry several nodes use is stored once in its batch.
      const stored = new Map<BufferGeometry, number>();
      root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
        if (!batchable(mesh, maxTextures)) return;
        const key: unknown = mesh.userData.lmuMaterial;
        if (typeof key !== 'string') throw Error(`Scenery material without its package key (${mesh.name})`);
        const batch = batchFor(key, mesh, layoutOf(mesh.geometry), fresh), total = totals.get(key)!;
        const count = used.get(key) ?? {primitives: 0, draws: 0};
        used.set(key, count); keys.add(key);
        let placed = byBatch.get(batch.mesh);
        if (!placed) { placed = {batch: batch.mesh, instances: []}; byBatch.set(batch.mesh, placed); }
        let geometryId = stored.get(mesh.geometry);
        if (geometryId === undefined) {
          if (++count.primitives > total.primitives) throw Error(`Scenery material ${key} has more primitives than the layout gives`);
          try { geometryId = batch.mesh.addGeometry(mesh.geometry); } catch (error) {
            throw Error(`Scenery material ${key} has more geometry than the layout gives (${mesh.name})`, {cause: error});
          }
          stored.set(mesh.geometry, geometryId);
        }
        if (++count.draws > total.draws) throw Error(`Scenery material ${key} draws more than the layout gives`);
        mesh.geometry.computeBoundingBox();
        const ranged: Ranged = {instance: addHiddenInstance(batch.mesh, geometryId, mesh.matrixWorld), box: mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld),
          ...rangeOf(mesh), inRange: true, drawn: false};
        place(ranged, culledAt);
        placed.instances.push(ranged);
        moved.push(mesh);
      });
      // The originals stay in the chunk (their materials are released with it) but draw nothing, hold no geometry and are in no
      // camera layer, so no program is linked for them (sceneWarmup.ts).
      for (const mesh of moved) { mesh.geometry.dispose(); mesh.geometry = MOVED; mesh.visible = false; mesh.layers.disableAll(); }
      // A batch's bounds (its frustum culling) cover the instances it had when first computed: they grow with each chunk.
      for (const batch of byBatch.keys()) computeBatchBounds(batch);
      // The last primitive of a material fills its batches: they keep no CPU copy past their next upload.
      for (const key of keys) if (used.get(key)!.primitives === totals.get(key)!.primitives) for (const {mesh} of byKey.get(key)!) releaseBatchOnUpload(mesh);
      chunks.set(root, {placed: [...byBatch.values()], shown: false});
      return fresh;
    },
    sync() {
      for (const [root, chunk] of chunks) {
        const shown = root.parent !== null && root.visible;
        if (shown === chunk.shown) continue;
        chunk.shown = shown;
        show(chunk.placed, shown);
      }
    },
    cull(eye, lodMultiplier = 1) {
      if (!eye) {
        if (culledAt) { culledAt = null; placeAll(null); }
        return;
      }
      parent.updateWorldMatrix(true, false);
      parent.worldToLocal(local.copy(eye));
      const scaled = lodMultiplier * lodMultiplier !== lodSq;
      if (culledAt && !scaled && local.distanceToSquared(culledAt) < CULL_STEP_M * CULL_STEP_M) return;
      lodSq = lodMultiplier * lodMultiplier;
      culledAt = (culledAt ?? new Vector3()).copy(local);
      placeAll(culledAt);
    },
    dispose() {
      for (const {mesh} of batches.values()) { mesh.removeFromParent(); mesh.dispose(); }
      batches.clear(); byKey.clear(); counts.clear(); chunks.clear(); used.clear();
    },
  };
}
