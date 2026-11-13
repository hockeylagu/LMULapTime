import { BufferGeometry, Mesh, Object3D, type BatchedMesh, type Material } from 'three';
import type { SceneryMaterialTotals } from '../../../../../shared/packageContract/index.js';
import { BATCH_VERTEX_TEXTURES } from './materials/shaderParts.js';
import { addHiddenInstance, computeBatchBounds, createBatch, createShownCounts, layoutOf, releaseBatchOnUpload } from '../batching/batchedParts.js';

export interface SceneryBatches {
  /**
   * Moves `root`'s batchable meshes into their batches, hidden until the chunk joins the scene. Returns the batches this chunk
   * created: they have programs to compile and buffers to upload.
   */
  add(root: Object3D): BatchedMesh[];
  /** Gives back `root`'s instances (a chunk that never joined the scene). */
  remove(root: Object3D): void;
  /** Shows each chunk's instances while its root is in the scene and visible. */
  sync(): void;
  dispose(): void;
}

interface Placed { batch: BatchedMesh; instances: number[]; geometries: number[] }
interface Batch { mesh: BatchedMesh; layout: string }
interface Used { primitives: number; draws: number }

/** Stands in for a batched mesh's own geometry: its data lives in the batch. */
const MOVED = new BufferGeometry();

/**
 * Whether a mesh can draw from a batch. Only configured surfaces share one material across chunks (a mesh without a surface
 * description keeps its chunk's own glTF material). A camera-facing card has its own shadow material, and a mesh with a per-draw
 * hook must keep its own draw. A see-through surface (fences, glass, decals) batches too, its batch sorting its instances back to
 * front in each pass. A program whose samplers plus the batch's vertex textures pass `maxTextures` (three's limit on texture units
 * across both stages) keeps its mesh's own draw.
 */
function batchable(mesh: Mesh<BufferGeometry, Material | Material[]>, maxTextures: number): mesh is Mesh<BufferGeometry, Material> {
  if (!mesh.visible || Array.isArray(mesh.material) || mesh.material.userData.surfaceConfigured !== true) return false;
  const units: unknown = mesh.material.userData.surfaceTextureUnits;
  if (typeof units !== 'number') throw Error(`Configured scenery material without its texture unit count (${mesh.name})`);
  return units + BATCH_VERTEX_TEXTURES <= maxTextures && !mesh.customDepthMaterial && mesh.onBeforeRender === Object3D.prototype.onBeforeRender;
}

/**
 * Draws each scenery material once across the chunks, as one multi-draw per material and shadow flags, in place of a draw per
 * chunk: a draw costs the main thread about the same whatever its size, and a venue has about one primitive per material per
 * chunk. The package names each material by its content (`lmuMaterial`, kept on the mesh by the chunk loader) and gives its totals
 * over the layout, so a batch is sized once and its buffers never grow; a material split by shadow flags reserves its totals in each part.
 * `maxTextures` is the renderer's `capabilities.maxTextures`. Instances are neither culled nor sorted one by one: that per-pass work cost more than the draws it saved, and the hidden-chunk
 * rule already leaves out what is far away.
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
  /** A batch is in the scene while any shown chunk draws from it. */
  const counts = createShownCounts((mesh, visible) => { if (!visible) mesh.removeFromParent(); else if (!mesh.parent) parent.add(mesh); });
  /** Shows or hides a chunk's instances; a batch joins the scene with its first shown chunk and leaves with its last. */
  const show = (placed: readonly Placed[], shown: boolean) => {
    for (const {batch: mesh, instances} of placed) {
      for (const instance of instances) mesh.setVisibleAt(instance, shown);
      counts.change(mesh, shown ? 1 : -1);
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
        if (!placed) { placed = {batch: batch.mesh, instances: [], geometries: []}; byBatch.set(batch.mesh, placed); }
        let geometryId = stored.get(mesh.geometry);
        if (geometryId === undefined) {
          if (++count.primitives > total.primitives) throw Error(`Scenery material ${key} has more primitives than the layout gives`);
          try { geometryId = batch.mesh.addGeometry(mesh.geometry); } catch (error) {
            throw Error(`Scenery material ${key} has more geometry than the layout gives (${mesh.name})`, {cause: error});
          }
          stored.set(mesh.geometry, geometryId); placed.geometries.push(geometryId);
        }
        if (++count.draws > total.draws) throw Error(`Scenery material ${key} draws more than the layout gives`);
        placed.instances.push(addHiddenInstance(batch.mesh, geometryId, mesh.matrixWorld));
        moved.push(mesh);
      });
      // The originals stay in the chunk (their materials are released with it) but draw nothing and hold no geometry.
      for (const mesh of moved) { mesh.geometry.dispose(); mesh.geometry = MOVED; mesh.visible = false; }
      // A batch's bounds (its frustum culling) cover the instances it had when first computed: they grow with each chunk.
      for (const batch of byBatch.keys()) computeBatchBounds(batch);
      // The last primitive of a material fills its batches: they keep no CPU copy past their next upload.
      for (const key of keys) if (used.get(key)!.primitives === totals.get(key)!.primitives) for (const {mesh} of byKey.get(key)!) releaseBatchOnUpload(mesh);
      chunks.set(root, {placed: [...byBatch.values()], shown: false});
      return fresh;
    },
    remove(root) {
      const chunk = chunks.get(root);
      if (!chunk) return;
      chunks.delete(root);
      if (chunk.shown) show(chunk.placed, false);
      for (const {batch, instances, geometries} of chunk.placed) {
        for (const instance of instances) batch.deleteInstance(instance);
        for (const geometry of geometries) batch.deleteGeometry(geometry);
      }
    },
    sync() {
      for (const [root, chunk] of chunks) {
        const shown = root.parent !== null && root.visible;
        if (shown === chunk.shown) continue;
        chunk.shown = shown;
        show(chunk.placed, shown);
      }
    },
    dispose() {
      for (const {mesh} of batches.values()) { mesh.removeFromParent(); mesh.dispose(); }
      batches.clear(); byKey.clear(); counts.clear(); chunks.clear(); used.clear();
    },
  };
}
