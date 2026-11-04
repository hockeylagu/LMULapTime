import { BufferGeometry, Mesh, MeshBasicMaterial, Scene, WebGLRenderTarget, type Camera, type Object3D, type WebGLRenderer } from 'three';

export function createGeometryWarmup(renderer: WebGLRenderer, nextFrame: () => Promise<void>, sliceMs: number) {
  const target = new WebGLRenderTarget(1, 1), material = new MeshBasicMaterial({colorWrite: false, depthWrite: false});
  const empty = new BufferGeometry(), probe = new Mesh(empty, material), scene = new Scene();
  const uploaded = new WeakSet<BufferGeometry>();
  probe.frustumCulled = false;
  scene.add(probe);
  let disposed = false;
  return {
    async upload(root: Object3D, camera: Camera, signal: AbortSignal, budgetMs = sliceMs): Promise<void> {
      const geometries = new Set<BufferGeometry>();
      root.traverse(object => {
        if (!(object instanceof Mesh) || !object.visible || !(object.geometry instanceof BufferGeometry)) return;
        geometries.add((object as Mesh<BufferGeometry>).geometry);
      });
      let deadline = performance.now() + budgetMs;
      for (const geometry of geometries) {
        signal.throwIfAborted();
        if (disposed) return;
        if (uploaded.has(geometry)) continue;
        const previous = renderer.getRenderTarget();
        try {
          probe.geometry = geometry;
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
          uploaded.add(geometry);
        } finally {
          probe.geometry = empty;
          renderer.setRenderTarget(previous);
        }
        if (performance.now() >= deadline) {
          // oxlint-disable-next-line no-await-in-loop -- GPU uploads yield between frame-budget slices
          await nextFrame();
          deadline = performance.now() + budgetMs;
        }
      }
    },
    dispose() { disposed = true; target.dispose(); material.dispose(); empty.dispose(); },
  };
}