import { BatchedMesh, BufferGeometry, Mesh, Object3D, type Material } from 'three';
import type { SceneryMaterialTotals } from '../../../../../shared/packageContract/index.js';

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
/** `shown`: how many shown chunks draw from the batch; it is in the scene while any does. */
interface Batch { mesh: BatchedMesh; layout: string; shown: number }
interface Used { primitives: number; draws: number }

/** Stands in for a batched mesh's own geometry: its data lives in the batch. */
const MOVED = new BufferGeometry();

function layoutOf(geometry: BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`);
  return [geometry.index ? 'indexed' : 'plain', ...attributes.sort()].join('|');
}

/**
 * Whether a mesh can draw from a batch. Only configured surfaces share one material across chunks (a mesh without a surface
 * description keeps its chunk's own glTF material). A transparent mesh is sorted against the others one by one, a camera-facing
 * card has its own shadow material, and a mesh with a per-draw hook must keep its own draw.
 */
function batchable(mesh: Mesh<BufferGeometry, Material | Material[]>): mesh is Mesh<BufferGeometry, Material> {
  return mesh.visible && !Array.isArray(mesh.material) && mesh.material.userData.surfaceConfigured === true && !mesh.material.transparent
    && !mesh.customDepthMaterial && mesh.onBeforeRender === Object3D.prototype.onBeforeRender;
}

/**
 * Draws each scenery material once across the chunks, as one multi-draw per material and shadow flags, in place of a draw per
 * chunk: a draw costs the main thread about the same whatever its size, and a venue has about one primitive per material per
 * chunk. The package names each material by its content (`lmuMaterial`, kept on the mesh by the chunk loader) and gives its totals
 * over the layout, so a batch is sized once and its buffers never grow; a material split by shadow flags reserves its totals in each part.
 * Instances are neither culled nor sorted one by one: that per-pass work cost more than the draws it saved, and the hidden-chunk
 * rule already leaves out what is far away.
 */
export function createSceneryBatches(parent: Object3D, materials: readonly SceneryMaterialTotals[]): SceneryBatches {
  const totals = new Map(materials.map(row => [row.key, row]));
  const batches = new Map<string, Batch>(), byMesh = new Map<BatchedMesh, Batch>(), used = new Map<string, Used>();
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
    const made = new BatchedMesh(total.draws, total.vertices, total.indices, mesh.material);
    made.perObjectFrustumCulled = false; made.sortObjects = false;
    made.castShadow = mesh.castShadow; made.receiveShadow = mesh.receiveShadow; made.name = `batch ${id}`;
    // Outside the scene until a chunk that draws from it is shown, like a chunk's root: three sets a drawn object's program even
    // with no instance to draw, so a batch in the scene before its chunk's warm-up would link its program on the main thread.
    const batch = {mesh: made, layout, shown: 0};
    batches.set(id, batch); byMesh.set(made, batch); fresh.push(made);
    return batch;
  };
  /** Shows or hides a chunk's instances; a batch joins the scene with its first shown chunk and leaves with its last. */
  const show = (placed: readonly Placed[], shown: boolean) => {
    for (const {batch: mesh, instances} of placed) {
      for (const instance of instances) mesh.setVisibleAt(instance, shown);
      const batch = byMesh.get(mesh)!;
      batch.shown += shown ? 1 : -1;
      if (batch.shown > 0 && !mesh.parent) parent.add(mesh);
      else if (batch.shown === 0) mesh.removeFromParent();
    }
  };
  return {
    add(root) {
      if (chunks.has(root)) throw Error('Scenery chunk batched twice');
      root.updateWorldMatrix(true, true);
      const fresh: BatchedMesh[] = [], byBatch = new Map<BatchedMesh, Placed>(), moved: Mesh[] = [];
      // A geometry several nodes use is stored once in its batch.
      const stored = new Map<BufferGeometry, number>();
      root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const mesh = object as Mesh<BufferGeometry, Material | Material[]>;
        if (!batchable(mesh)) return;
        const key: unknown = mesh.userData.lmuMaterial;
        if (typeof key !== 'string') throw Error(`Scenery material without its package key (${mesh.name})`);
        const batch = batchFor(key, mesh, layoutOf(mesh.geometry), fresh), total = totals.get(key)!;
        const count = used.get(key) ?? {primitives: 0, draws: 0};
        used.set(key, count);
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
        const instance = batch.mesh.addInstance(geometryId);
        batch.mesh.setMatrixAt(instance, mesh.matrixWorld);
        batch.mesh.setVisibleAt(instance, false);
        placed.instances.push(instance);
        moved.push(mesh);
      });
      // The originals stay in the chunk (their materials are released with it) but draw nothing and hold no geometry.
      for (const mesh of moved) { mesh.geometry.dispose(); mesh.geometry = MOVED; mesh.visible = false; }
      // A batch's bounds (its frustum culling) cover the instances it had when first computed: they grow with each chunk.
      for (const batch of byBatch.keys()) { batch.computeBoundingBox(); batch.computeBoundingSphere(); }
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
      batches.clear(); byMesh.clear(); chunks.clear(); used.clear();
    },
  };
}
