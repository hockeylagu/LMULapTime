import { Mesh, Object3D, Vector3, type Box3, type Material, type PerspectiveCamera, type Scene, type Texture, type WebGLRenderer } from 'three';
import { createGeometryWarmup, type UploadSlice } from './geometryWarmup.js';
import { surfaceTextureMaps } from './materials/configureSurfaceMaterial.js';
import { fullPixels, isStreaming, streamTexture, whenUploaded } from './materials/mipStreaming.js';

/** Upload slice while the scene shows (a frame each), and behind the loading screen (a task each). */
const UPLOAD_SLICE_MS = 1, LOADING_SLICE_MS = 50;
/**
 * Bytes a frame uploads once the first frame is out, for the warm-ups and again for the sharpening: an upload call returns before
 * the GPU has copied the data, so time alone does not bound its cost (a millisecond slice let a near car send 7-15 MiB a frame).
 * A texture or geometry goes whole, so a frame's first upload goes even if it is bigger.
 */
const UPLOAD_BYTES_PER_FRAME = 2 * 1024 * 1024;

/** The bytes a texture's upload sends: its levels' data, else its image's pixels (four bytes each). */
function textureBytes(texture: Texture): number {
  const levels = texture.mipmaps as {data?: ArrayBufferView}[] | undefined;
  if (levels?.length && levels.every(level => level.data)) return levels.reduce((sum, level) => sum + level.data!.byteLength, 0);
  const image = texture.image as {data?: ArrayBufferView; width?: number; height?: number} | null | undefined;
  if (image?.data) return image.data.byteLength;
  return (image?.width ?? 0) * (image?.height ?? 0) * 4;
}

export interface SceneWarmup {
  /**
   * Compiles the programs of `roots` and uploads their textures and geometry, so their first draw does not stall playback; their
   * streamed textures then queue to sharpen. `prepare` runs before the compile (the frame's render target and haze).
   */
  warm(roots: Object3D | readonly Object3D[], signal: AbortSignal): Promise<void>;
  /**
   * As `warm`, with the uploads one call after another: chunks that arrive together compile together and upload in turn. A chunk
   * comes with the scenery batches it created, which draw outside its root, and its world box (`where`): its textures sharpen
   * in order of the camera's distance to the nearest box that uses them.
   */
  queue(roots: Object3D | readonly Object3D[], signal: AbortSignal, where?: Box3): Promise<void>;
  /** The first frame is out: warm-ups upload in per-frame slices from now on, and the reduced textures start sharpening. */
  shown(): void;
  /** Queues a car texture to sharpen, ahead of the scenery. */
  sharpen(texture: Texture): void;
  /** Keeps a streamed texture on its reduced levels until `sharpenHeld`. */
  hold(texture: Texture): void;
  /** Sharpens the held textures from now on, ahead of the rest. */
  sharpenHeld(): void;
  /** How many queued textures have their full detail (or failed to get it): the streaming indicator's progress. */
  sharpening(): {sharp: number; total: number};
  dispose(): void;
}

/**
 * A chunk compiles its programs and uploads its textures before it joins the scene: a texture per frame while the scene shows, in
 * long slices behind the loading screen. Scenery textures join on their reduced levels; once the first frame is out, they sharpen
 * whole, one texture after another within the frame's byte budget: the car's first, then the scenery nearest the camera, the
 * largest first within the same chunk. `changed` asks for a frame.
 */
export function createSceneWarmup(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, prepare: () => void,
  changed: () => void): SceneWarmup {
  const nextFrame = () => new Promise<void>(resolve => { requestAnimationFrame(() => resolve()); });
  const nextTask = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
  const geometryWarmup = createGeometryWarmup(renderer);
  const sent = new WeakSet<Texture>();
  const held = new Set<Texture>(), cars = new WeakSet<Texture>(), places = new WeakMap<Texture, Box3[]>(), eye = new Vector3();
  const blurry = new Set<Texture>();
  let shown = false, disposed = false, sharpenFrame = 0, warming = Promise.resolve(), sharp = 0;
  /** Car textures first (-1), then by the camera's distance to the nearest chunk using the texture; unplaced ones last. */
  const distance = (texture: Texture) => cars.has(texture) ? -1
    : (places.get(texture) ?? []).reduce((nearest, box) => Math.min(nearest, box.distanceToPoint(eye)), Infinity);
  const sharpen = () => {
    sharpenFrame = 0;
    if (disposed) return;
    let uploaded = 0;
    camera.getWorldPosition(eye);
    const order = [...blurry].map(texture => ({texture, distance: distance(texture), pixels: fullPixels(texture)}))
      .sort((a, b) => a.distance - b.distance || b.pixels - a.pixels);
    for (const {texture} of order) {
      uploaded += streamTexture(texture, renderer);
      if (!isStreaming(texture)) { blurry.delete(texture); sharp++; }
      if (uploaded >= UPLOAD_BYTES_PER_FRAME) break;
    }
    if (uploaded) changed();
    if (blurry.size) sharpenFrame = requestAnimationFrame(sharpen);
  };
  const startSharpen = () => { if (shown && !sharpenFrame && blurry.size) sharpenFrame = requestAnimationFrame(sharpen); };
  /**
   * During playback, uploads go in per-frame slices of time and bytes: a whole chunk or car at once is the stall this avoids.
   * Behind the loading screen nothing is drawn, so long slices only yield a task now and then to keep the page responsive.
   */
  const slice = (): UploadSlice => {
    const budgetMs = shown ? UPLOAD_SLICE_MS : LOADING_SLICE_MS, budgetBytes = shown ? UPLOAD_BYTES_PER_FRAME : Infinity, pause = shown ? nextFrame : nextTask;
    let end = performance.now() + budgetMs, bytes = 0;
    return async sentBytes => {
      bytes += sentBytes;
      if (performance.now() < end && bytes < budgetBytes) return;
      await pause();
      end = performance.now() + budgetMs; bytes = 0;
    };
  };
  const list = (roots: Object3D | readonly Object3D[]): readonly Object3D[] => (roots instanceof Object3D ? [roots] : roots);
  const compile = (roots: readonly Object3D[]) => {
    // Programs depend on the render target (tone mapping, output colour space): compile for the HDR target the frame uses.
    const previous = renderer.getRenderTarget();
    prepare();
    const compiled = Promise.all(roots.map(root => renderer.compileAsync(root, camera, scene)));
    renderer.setRenderTarget(previous);
    return compiled;
  };
  const warm = async (roots: readonly Object3D[], signal: AbortSignal, compiled: Promise<unknown> = compile(roots), where?: Box3) => {
    await compiled;
    const textures = new Set<Texture>();
    for (const root of roots) root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const own = (object as Mesh).material, materials: Material[] = Array.isArray(own) ? own : [own];
      for (const material of materials) {
        for (const value of Object.values(material as unknown as Record<string, unknown>)) if (value && (value as Texture).isTexture) textures.add(value as Texture);
        for (const texture of surfaceTextureMaps.get(material) ?? []) textures.add(texture);
      }
    });
    const next = slice();
    for (const texture of textures) {
      signal.throwIfAborted();
      // A texture already on the GPU sends nothing again.
      const bytes = sent.has(texture) ? 0 : textureBytes(texture);
      renderer.initTexture(texture);
      sent.add(texture);
      // eslint-disable-next-line no-await-in-loop -- yields between upload slices
      await next(bytes);
    }
    // oxlint-disable-next-line no-await-in-loop -- one root's geometry after another, in the same slices
    for (const root of roots) await geometryWarmup.upload(root, camera, signal, next);
    for (const texture of textures) {
      if (!isStreaming(texture)) continue;
      if (where) places.set(texture, [...places.get(texture) ?? [], where]);
      if (!held.has(texture)) blurry.add(texture);
    }
    startSharpen();
  };
  return {
    warm: (roots, signal) => warm(list(roots), signal),
    queue(roots, signal, where) {
      // Programs compile off the main thread: a chunk's start as it arrives, while the chunks before it compile and upload.
      const all = list(roots), compiled = compile(all);
      compiled.catch(() => {});
      const warmed = warming.then(async () => { signal.throwIfAborted(); await warm(all, signal, compiled, where); });
      warming = warmed.catch(() => {});
      return warmed;
    },
    shown() { shown = true; startSharpen(); },
    // A texture nothing has drawn yet is not on the GPU: it joins the queue at its first upload, so the queue can empty.
    sharpen(texture) { cars.add(texture); whenUploaded(texture, () => { blurry.add(texture); startSharpen(); }); },
    hold(texture) {
      held.add(texture);
      const release = () => {
        held.delete(texture);
        blurry.delete(texture);
        texture.removeEventListener('dispose', release);
      };
      texture.addEventListener('dispose', release);
    },
    sharpenHeld() {
      // Car textures: ahead of the scenery, those on the GPU now and the others as each is first drawn.
      const released = [...held];
      held.clear();
      for (const texture of released) { cars.add(texture); whenUploaded(texture, () => { blurry.add(texture); startSharpen(); }); }
    },
    sharpening: () => ({sharp, total: sharp + blurry.size}),
    dispose() { disposed = true; cancelAnimationFrame(sharpenFrame); held.clear(); blurry.clear(); geometryWarmup.dispose(); },
  };
}
