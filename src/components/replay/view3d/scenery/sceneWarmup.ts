import { Mesh, type Material, type Object3D, type PerspectiveCamera, type Scene, type Texture, type WebGLRenderer } from 'three';
import { createGeometryWarmup } from './geometryWarmup.js';
import { surfaceTextureMaps } from './materials/configureSurfaceMaterial.js';
import { isStreaming, streamTexture } from './materials/mipStreaming.js';

/** Upload slice while the scene shows (a frame each), and behind the loading screen (a task each). */
const UPLOAD_SLICE_MS = 1, LOADING_SLICE_MS = 50;
/**
 * Bytes of missing top levels uploaded per frame once the first frame is out. The budget is bytes, not time: an upload call returns
 * before the GPU has copied the data, so time does not bound its cost.
 */
const SHARPEN_BYTES_PER_FRAME = 2 * 1024 * 1024;

export interface SceneWarmup {
  /**
   * Compiles `root`'s programs and uploads its textures and geometry, so its first draw does not stall playback; its streamed
   * textures then queue to sharpen. `prepare` runs before the compile (the frame's render target and haze).
   */
  warm(root: Object3D, signal: AbortSignal): Promise<void>;
  /** As `warm`, with the uploads one root after another: chunks that arrive together compile together and upload in turn. */
  queue(root: Object3D, signal: AbortSignal): Promise<void>;
  /** The first frame is out: warm-ups upload in per-frame slices from now on, and the reduced textures start sharpening. */
  shown(): void;
  /** Queues a streamed texture to sharpen, whichever material holds it. */
  sharpen(texture: Texture): void;
  /** Keeps a streamed texture on its reduced levels until `sharpenHeld`. */
  hold(texture: Texture): void;
  /** Sharpens the held textures from now on, ahead of the rest. */
  sharpenHeld(): void;
  dispose(): void;
}

/**
 * A chunk compiles its programs and uploads its textures before it joins the scene: a texture per frame while the scene shows, in
 * long slices behind the loading screen. Scenery textures join on their reduced levels; once the first frame is out, their missing
 * top levels stream in, in bands of rows, one texture after another. `changed` asks for a frame.
 */
export function createSceneWarmup(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, prepare: () => void,
  changed: () => void): SceneWarmup {
  const nextFrame = () => new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
  const nextTask = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
  const geometryWarmup = createGeometryWarmup(renderer, nextFrame, UPLOAD_SLICE_MS);
  const held = new Set<Texture>();
  let blurry = new Set<Texture>();
  let shown = false, disposed = false, sharpenFrame = 0, warming = Promise.resolve();
  const sharpen = () => {
    sharpenFrame = 0;
    if (disposed) return;
    let uploaded = 0;
    for (const texture of blurry) {
      uploaded += streamTexture(texture, renderer, SHARPEN_BYTES_PER_FRAME - uploaded);
      if (!isStreaming(texture)) blurry.delete(texture);
      if (uploaded >= SHARPEN_BYTES_PER_FRAME) break;
    }
    if (uploaded) changed();
    if (blurry.size) sharpenFrame = requestAnimationFrame(sharpen);
  };
  const startSharpen = () => { if (shown && !sharpenFrame && blurry.size) sharpenFrame = requestAnimationFrame(sharpen); };
  const compile = (root: Object3D) => {
    // Programs depend on the render target (tone mapping, output colour space): compile for the HDR target the frame uses.
    const previous = renderer.getRenderTarget();
    prepare();
    const compiled = renderer.compileAsync(root, camera, scene);
    renderer.setRenderTarget(previous);
    return compiled;
  };
  const warm = async (root: Object3D, signal: AbortSignal, compiled: Promise<unknown> = compile(root)) => {
    await compiled;
    const textures = new Set<Texture>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const own = (object as Mesh).material, materials: Material[] = Array.isArray(own) ? own : [own];
      for (const material of materials) {
        for (const value of Object.values(material as unknown as Record<string, unknown>)) if (value && (value as Texture).isTexture) textures.add(value as Texture);
        for (const texture of surfaceTextureMaps.get(material) ?? []) textures.add(texture);
      }
    });
    // During playback, upload in per-frame slices: a whole chunk at once is the stall this avoids. Behind the loading screen
    // nothing is drawn, so long slices only yield a task now and then to keep the page responsive.
    const budgetMs = shown ? UPLOAD_SLICE_MS : LOADING_SLICE_MS, pause = shown ? nextFrame : nextTask;
    let sliceEnd = performance.now() + budgetMs;
    for (const texture of textures) {
      signal.throwIfAborted();
      renderer.initTexture(texture);
      // eslint-disable-next-line no-await-in-loop -- yields between upload slices
      if (performance.now() >= sliceEnd) { await pause(); sliceEnd = performance.now() + budgetMs; }
    }
    await geometryWarmup.upload(root, camera, signal, budgetMs, pause);
    for (const texture of textures) if (isStreaming(texture) && !held.has(texture)) blurry.add(texture);
    startSharpen();
  };
  return {
    warm,
    queue(root, signal) {
      // Programs compile off the main thread: a chunk's start as it arrives, while the chunks before it compile and upload.
      const compiled = compile(root);
      compiled.catch(() => {});
      const warmed = warming.then(async () => { signal.throwIfAborted(); await warm(root, signal, compiled); });
      warming = warmed.catch(() => {});
      return warmed;
    },
    shown() { shown = true; startSharpen(); },
    sharpen(texture) { blurry.add(texture); startSharpen(); },
    hold(texture) { held.add(texture); },
    sharpenHeld() {
      // A held texture not yet on the GPU waits there: `streamTexture` copies nothing until its first upload.
      blurry = new Set([...[...held].filter(isStreaming), ...blurry]);
      held.clear();
      startSharpen();
    },
    dispose() { disposed = true; cancelAnimationFrame(sharpenFrame); geometryWarmup.dispose(); },
  };
}
