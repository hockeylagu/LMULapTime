import { BatchedMesh, type BufferAttribute, type BufferGeometry, type Material, type Matrix4 } from 'three';

/** The vertex layout of a geometry: a batch holds geometries of one layout only. */
export function layoutOf(geometry: BufferGeometry): string {
  const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`);
  return [geometry.index ? 'indexed' : 'plain', ...attributes.sort()].join('|');
}

export interface BatchOptions {
  /** Room for this many instances, vertices and indices: a batch never grows. */
  draws: number; vertices: number; indices: number;
  material: Material;
  name: string;
  castShadow: boolean; receiveShadow: boolean;
  /** Whether the renderer culls the batch as a whole (default: yes). */
  frustumCulled?: boolean;
  /** Whether it culls each instance in every pass (default: no). */
  perObjectFrustumCulled?: boolean;
  /** Whether the batch's own matrix follows its parent every frame (default: yes). */
  matrixAutoUpdate?: boolean;
}

/** Main-thread time a sliced build runs before it yields a task (`createSlicer`): a frame's share of a 60 Hz budget. */
const SLICE_MS = 4;

/**
 * A long build's yield point: awaited between its steps, it yields a task (the browser draws a due frame) once the build has run
 * `SLICE_MS` since its last yield, else resolves at once.
 */
export function createSlicer(): () => Promise<void> {
  let start = performance.now();
  return async () => {
    if (performance.now() - start < SLICE_MS) return;
    await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    start = performance.now();
  };
}

/** A batch for one material, its instances not sorted (opaque parts only). */
export function createBatch(options: BatchOptions): BatchedMesh {
  const batch = new BatchedMesh(options.draws, options.vertices, options.indices, options.material);
  batch.frustumCulled = options.frustumCulled ?? true; batch.perObjectFrustumCulled = options.perObjectFrustumCulled ?? false;
  batch.sortObjects = false; batch.matrixAutoUpdate = options.matrixAutoUpdate ?? true;
  batch.castShadow = options.castShadow; batch.receiveShadow = options.receiveShadow; batch.name = options.name;
  return batch;
}

/** A new hidden instance of a stored geometry (at `matrix` when given); its owner shows it. */
export function addHiddenInstance(batch: BatchedMesh, geometryId: number, matrix?: Matrix4): number {
  const instance = batch.addInstance(geometryId);
  if (matrix) batch.setMatrixAt(instance, matrix);
  batch.setVisibleAt(instance, false);
  return instance;
}

/** The batch's culling bounds cover the instances it has now: call again after adding more. */
export function computeBatchBounds(batch: BatchedMesh): void {
  batch.computeBoundingBox(); batch.computeBoundingSphere();
}

/**
 * Once nothing writes to a batch's buffers again, each drops its CPU copy after the renderer's next upload (which carries every
 * pending range): a batch sized to its totals up front holds all its vertices otherwise. This is what three documents
 * `BufferAttribute.onUpload` for (clean-up once the data is not needed on the CPU side). After the upload, three r186's draw path
 * reads no buffer data: `WebGLAttributes.update` re-uploads only on a version bump, `WebGLBindingStates` takes the GL type and
 * element size it cached at upload, and `BatchedMesh.onBeforeRender` reads only `index.array.BYTES_PER_ELEMENT` (for the multi-draw
 * byte offsets). The copy therefore becomes an empty array of the same type. Raycasting, `optimize` and `setGeometryAt` would read the
 * data, and nothing calls them on these batches. A restored WebGL context would re-upload from these arrays: the caller treats a
 * lost context as a failure and rebuilds the scene from the files instead.
 */
export function releaseBatchOnUpload(batch: BatchedMesh): void {
  // The renderer sorts (and the warm-up draws) by the geometry's own bounds, computed from its arrays when missing: they take the
  // batch's, which cover every instance it holds (`computeBatchBounds` first).
  batch.geometry.boundingBox = batch.boundingBox!.clone();
  batch.geometry.boundingSphere = batch.boundingSphere!.clone();
  const buffers = [batch.geometry.index, ...Object.values(batch.geometry.attributes)].filter((buffer): buffer is BufferAttribute => !!buffer);
  for (const buffer of buffers) {
    buffer.onUpload(() => {
      buffer.array = new (buffer.array.constructor as new (length: number) => typeof buffer.array)(0);
      buffer.clearUpdateRanges();
    });
  }
}

/**
 * Counts the owners (a chunk, a car part) that show instances of each batch and tells `onVisible` whether a batch has any: a batch
 * with none is left out of every pass (main view, shadow cascades, reflection).
 */
export interface ShownCounts {
  /** `change` more (or fewer, when negative) owners show instances of `batch`. */
  change: (batch: BatchedMesh, change: number) => void;
  of: (batch: BatchedMesh) => number;
  clear: () => void;
}

export function createShownCounts(onVisible: (batch: BatchedMesh, visible: boolean) => void): ShownCounts {
  const counts = new Map<BatchedMesh, number>();
  return {
    change(batch, change) {
      const next = (counts.get(batch) ?? 0) + change;
      counts.set(batch, next);
      onVisible(batch, next > 0);
    },
    of: batch => counts.get(batch) ?? 0,
    clear: () => counts.clear(),
  };
}
