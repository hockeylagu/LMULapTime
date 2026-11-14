import { BufferAttribute, BufferGeometry, Camera, Mesh, MeshBasicMaterial, Scene, WebGLRenderTarget, type Object3D, type WebGLRenderer } from 'three';

/** Ends an upload slice once enough time or bytes went out: called after each upload with its bytes, it waits for the next slice. */
export type UploadSlice = (bytes: number) => Promise<void>;

/** The bytes a geometry's first upload sends: its buffers, an interleaved one counted once. */
function geometryBytes(geometry: BufferGeometry): number {
  const buffers = new Set([...Object.values(geometry.attributes).map(attribute => attribute.array), ...(geometry.index ? [geometry.index.array] : [])]);
  return [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
}

export function createGeometryWarmup(renderer: WebGLRenderer) {
  const target = new WebGLRenderTarget(1, 1), material = new MeshBasicMaterial({colorWrite: false, depthWrite: false});
  const empty = new BufferGeometry(), probe = new Mesh(empty, material), scene = new Scene();
  const uploaded = new WeakSet<BufferGeometry>();
  probe.frustumCulled = false;
  scene.add(probe);
  let disposed = false;
  // The probe's program links now, while nothing else compiles: linked on its first draw, it waits on the main thread behind
  // the programs of the chunks that arrived with it. A program is shared by geometry with the same kinds of attributes.
  const typical = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(9), 3)).setAttribute('normal', new BufferAttribute(new Float32Array(9), 3));
  const before = renderer.getRenderTarget();
  probe.geometry = typical; renderer.setRenderTarget(target);
  renderer.compile(scene, new Camera());
  probe.geometry = empty; renderer.setRenderTarget(before); typical.dispose();
  return {
    /** Uploads `root`'s geometry, one geometry after another, each followed by `slice` with its bytes. */
    async upload(root: Object3D, camera: Camera, signal: AbortSignal, slice: UploadSlice): Promise<void> {
      const geometries = new Set<BufferGeometry>();
      root.traverse(object => {
        // A mesh in no camera layer is never drawn (a batch's stand-in part): nothing of it goes to the GPU.
        if (!(object instanceof Mesh) || !object.visible || object.layers.mask === 0 || !(object.geometry instanceof BufferGeometry)) return;
        geometries.add((object as Mesh<BufferGeometry>).geometry);
      });
      for (const geometry of geometries) {
        signal.throwIfAborted();
        if (disposed) return;
        if (uploaded.has(geometry)) continue;
        // Counted before the upload: a batch lets its CPU copy go once uploaded (releaseBatchOnUpload).
        const bytes = geometryBytes(geometry), previous = renderer.getRenderTarget();
        try {
          probe.geometry = geometry;
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          uploaded.add(geometry);
        } finally {
          probe.geometry = empty;
          renderer.setRenderTarget(previous);
        }
        // oxlint-disable-next-line no-await-in-loop -- GPU uploads yield between slices
        await slice(bytes);
      }
    },
    dispose() { disposed = true; target.dispose(); material.dispose(); empty.dispose(); },
  };
}
