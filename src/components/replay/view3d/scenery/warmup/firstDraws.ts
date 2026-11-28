import { BatchedMesh, DepthTexture, Light, Mesh, PerspectiveCamera, type Material, type Object3D, type Scene, type WebGLRenderTarget, type WebGLRenderer } from 'three';

/**
 * A program's first draw costs the GPU process more than its link: a GT3 body's 21 materials, linked before the car showed, held the
 * frame that first drew them 230-320 ms (Barcelona race, 2026-11-27), while a later frame drew them in a few milliseconds. Drawing
 * each material once beforehand, one a frame into a pixel of the frame's own kind of target, spreads that cost over as many frames.
 */
export interface FirstDraws {
  /**
   * Draws each material of `roots` (those with no parent: what has not joined the scene yet) once, as the main pass would (with the
   * scene's lights, through `camera`, into a pixel copy of the target `prepare` sets, which there must be), then as the sun shadow
   * would. Waits `next` before each draw; draws of several calls go one after another.
   */
  draw(roots: readonly Object3D[], camera: PerspectiveCamera, prepare: () => void, next: () => Promise<void>, signal: AbortSignal): Promise<void>;
  dispose(): void;
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * A mesh for each material under `roots` that a camera layer draws (a batch's stand-in parts are in none), with its root: drawing
 * those meshes uses every program the roots draw with. A mesh whose materials all came earlier is left out.
 */
export function materialMeshes(roots: readonly Object3D[]): {root: Object3D; mesh: Mesh}[] {
  const meshes: {root: Object3D; mesh: Mesh}[] = [], seen = new Set<Material>();
  for (const root of roots) {
    root.traverse(object => {
      if (!(object instanceof Mesh) || object.layers.mask === 0) return;
      const materials = materialsOf(object as Mesh);
      if (materials.every(material => seen.has(material))) return;
      for (const material of materials) seen.add(material);
      meshes.push({root, mesh: object as Mesh});
    });
  }
  return meshes;
}

/**
 * A pixel copy of `frame` (its kind: samples, type, depth), with a depth texture of its own: three's copy gives a clone's depth
 * texture the original's image, so drawing the copy at its size would set the frame's depth image to it.
 */
function pixelOf(frame: WebGLRenderTarget): WebGLRenderTarget {
  const pixel = frame.clone(), depth = frame.depthTexture;
  if (depth) pixel.depthTexture = Object.assign(new DepthTexture(1, 1, depth.type), {format: depth.format});
  pixel.setSize(1, 1);
  return pixel;
}

/** `shadows` draws what shows of the scene, and the root on its own, as the sun shadow's passes do (`CascadeShadows.drawFirst`). */
export function createFirstDraws(renderer: WebGLRenderer, scene: Scene, shadows: (root: Object3D, view: PerspectiveCamera) => void): FirstDraws {
  const eye = new PerspectiveCamera();
  let target: WebGLRenderTarget | null = null, drawing = Promise.resolve(), disposed = false;
  /** Draws `mesh` alone: everything else of the scene and of its root hidden, its path shown, its culling off; all put back after. */
  const drawOne = (root: Object3D, mesh: Mesh, camera: PerspectiveCamera, prepare: () => void) => {
    const previous = renderer.getRenderTarget();
    prepare();
    target ??= pixelOf(renderer.getRenderTarget()!);
    const shown = new Map<Object3D, boolean>(), path = new Set<Object3D>();
    mesh.traverseAncestors(ancestor => path.add(ancestor));
    const show = (object: Object3D, visible: boolean) => { if (object.visible !== visible) { shown.set(object, object.visible); object.visible = visible; } };
    for (const child of scene.children) if (!(child instanceof Light)) show(child, false);
    scene.add(root);
    root.traverse(object => { if (object !== mesh) show(object, path.has(object)); });
    show(mesh, true);
    const culled = mesh.frustumCulled;
    mesh.frustumCulled = false;
    // A batch draws its shown instances only, culled each against the camera: its first one shows for the draw.
    const batch = mesh instanceof BatchedMesh && mesh.instanceCount > 0 ? mesh : null;
    const instanceShown = batch?.getVisibleAt(0), perObject = batch?.perObjectFrustumCulled;
    if (batch) { batch.setVisibleAt(0, true); batch.perObjectFrustumCulled = false; }
    eye.copy(camera); eye.layers.enableAll();
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, eye);
      shadows(root, eye);
    } finally {
      if (batch) { batch.setVisibleAt(0, instanceShown!); batch.perObjectFrustumCulled = perObject!; }
      mesh.frustumCulled = culled;
      for (const [object, visible] of shown) object.visible = visible;
      scene.remove(root);
      renderer.setRenderTarget(previous);
    }
  };
  return {
    draw(roots, camera, prepare, next, signal) {
      const steps = materialMeshes(roots.filter(root => !root.parent));
      const drawn = drawing.then(async () => {
        for (const {root, mesh} of steps) {
          // oxlint-disable-next-line no-await-in-loop -- one first draw a frame
          await next();
          if (disposed || signal.aborted) return;
          // A root that joined the scene meanwhile draws there: taking it out for its draw would leave it out.
          if (!root.parent) drawOne(root, mesh, camera, prepare);
        }
      });
      drawing = drawn.catch(() => {});
      return drawn;
    },
    dispose() { disposed = true; target?.dispose(); },
  };
}
