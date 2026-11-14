import { Box3, CompressedTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBA_BPTC_Format, Scene, Vector3, type Object3D, type Texture, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isStreaming, startStreaming } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import { createSceneWarmup } from '../../../../../src/components/replay/view3d/scenery/sceneWarmup.js';

let frames: (() => void)[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

/** A renderer double whose textures are on the GPU once `upload` ran for them, as after their first draw. */
function fixture() {
  const bound: Texture[] = [], versions = new WeakMap<object, number>();
  // Like three: a source uploads once per version, then the texture's onUpdate runs. `bound` lists the swaps in order.
  const initTexture = (texture: Texture) => {
    if (versions.get(texture.source) === texture.source.version) return;
    versions.set(texture.source, texture.source.version);
    if (texture.mipmaps.length === Math.log2(texture.mipmaps[0].width) + 1) bound.push(texture);
    texture.onUpdate?.(texture);
  };
  const renderer = {getRenderTarget: () => null, setRenderTarget: () => {}, compile: () => {}, compileAsync: () => Promise.resolve(), initTexture, render: () => {}} as unknown as WebGLRenderer;
  const changed = vi.fn(), warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, changed);
  /** A `size` px texture (1024 by default) streaming from its quarter-size level. */
  const texture = (size = 1024) => {
    const levels = Array.from({length: Math.log2(size) + 1}, (_, i) => ({data: new Uint8Array(Math.ceil((size >> i) / 4) ** 2 * 16), width: size >> i, height: size >> i}));
    const made = new CompressedTexture(levels, size, size, RGBA_BPTC_Format);
    startStreaming(made);
    return made;
  };
  const upload = (made: Texture) => { made.needsUpdate = true; renderer.initTexture(made); };
  /** Runs frames until none is asked for; returns how many ran. */
  const drain = () => { let ran = 0; while (frames.length && ran < 100) { frames.shift()!(); ran++; } return ran; };
  return {warmup, texture, upload, drain, changed, bound};
}

it('sharpens a queued texture once it is on the GPU, and asks for no frame while it is not', () => {
  const {warmup, texture, upload, drain, changed} = fixture(), undrawn = texture();
  try {
    warmup.sharpen(undrawn); warmup.shown();
    expect([frames.length, isStreaming(undrawn)]).toEqual([0, true]); // Nothing to copy yet: the queue is empty, no frame loop runs.
    expect(warmup.sharpening()).toEqual({sharp: 0, total: 0}); // Not queued until it is on the GPU.
    upload(undrawn);
    expect(warmup.sharpening()).toEqual({sharp: 0, total: 1});
    expect(frames).toHaveLength(1);
    expect(drain()).toBeGreaterThan(0);
    expect([isStreaming(undrawn), frames.length, changed.mock.calls.length > 0]).toEqual([false, 0, true]); // Sharp, and the loop ended.
    expect(warmup.sharpening()).toEqual({sharp: 1, total: 1});
  } finally { warmup.dispose(); }
});

it('keeps a held texture on its reduced levels until released, then sharpens it when it is on the GPU', () => {
  const {warmup, texture, upload, drain} = fixture(), drawn = texture(), undrawn = texture();
  try {
    warmup.hold(drawn); warmup.hold(undrawn); warmup.shown();
    upload(drawn);
    expect([drain(), isStreaming(drawn)]).toEqual([0, true]);
    warmup.sharpenHeld();
    drain();
    expect([isStreaming(drawn), isStreaming(undrawn), frames.length]).toEqual([false, true, 0]);
    upload(undrawn); drain();
    expect([isStreaming(undrawn), frames.length]).toEqual([false, 0]);
  } finally { warmup.dispose(); }
});

it('sharpens the car first, then the scenery nearest the camera, the largest first within a chunk', async () => {
  const {warmup, texture, upload, drain, bound} = fixture(), signal = new AbortController().signal;
  const [car, far, nearSmall, nearLarge] = [texture(), texture(), texture(512), texture()];
  const chunk = (...maps: Texture[]) => maps.map(map => new Mesh(new PlaneGeometry(), new MeshBasicMaterial({map})));
  const box = (x: number) => new Box3(new Vector3(x, 0, 0), new Vector3(x + 10, 1, 10));
  try {
    await warmup.queue(chunk(far), signal, box(500));
    await warmup.queue(chunk(nearSmall, nearLarge), signal, box(20));
    for (const made of [far, nearSmall, nearLarge, car]) upload(made);
    warmup.sharpen(car);
    bound.length = 0;
    warmup.shown();
    drain();
    expect([...new Set(bound)]).toEqual([car, nearLarge, nearSmall, far]); // The order their missing levels were copied in.
    expect([car, far, nearSmall, nearLarge].some(isStreaming)).toBe(false);
  } finally { warmup.dispose(); drain(); }
});

it('swaps whole textures within the frame budget: the first one even if bigger, then one frame each for big ones', () => {
  const {warmup, texture, upload, drain, bound} = fixture(), [big, other, small, smaller] = [texture(2048), texture(2048), texture(512), texture(512)];
  try {
    for (const made of [big, other, small, smaller]) { upload(made); warmup.sharpen(made); }
    bound.length = 0;
    warmup.shown();
    frames.shift()!(); // One frame: the 5.3 MiB swap is over the 2 MiB budget alone, so nothing else goes with it.
    expect(bound).toHaveLength(1);
    frames.shift()!();
    expect(bound).toHaveLength(2);
    drain();
    expect([big, other, small, smaller].some(isStreaming)).toBe(false);
  } finally { warmup.dispose(); drain(); }
});

it('warms a shown scene within the frame byte budget: the first upload whole, then the next frame', async () => {
  const {warmup, bound} = fixture(), mib = 1024 * 1024;
  // Uploads return at once: only the bytes end the frame's slice.
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const card = () => new Mesh(new PlaneGeometry(), new MeshBasicMaterial({map: new CompressedTexture([{data: new Uint8Array(1.5 * mib), width: 1, height: 1}], 1, 1, RGBA_BPTC_Format)}));
  try {
    warmup.shown();
    const done = warmup.warm([card(), card(), card()], new AbortController().signal);
    await vi.waitFor(() => expect(bound).toHaveLength(2)); // 1.5 MiB, then 3 MiB: over the 2 MiB budget, the frame ends.
    expect(frames).toHaveLength(1);
    frames.shift()!();
    await done;
    expect(bound).toHaveLength(3);
  } finally { warmup.dispose(); vi.restoreAllMocks(); }
});

it('compiles what a camera layer draws, hidden or not, and no stand-in in no layer', async () => {
  const compiled: Object3D[] = [];
  const renderer = {getRenderTarget: () => null, setRenderTarget: () => {}, initTexture: () => {}, render: () => {}, compile: () => {},
    compileAsync: (object: Object3D) => { object.traverse(child => { compiled.push(child); }); return Promise.resolve(); }} as unknown as WebGLRenderer;
  const warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, () => {});
  const root = new Group(), drawn = new Mesh(new PlaneGeometry(), new MeshBasicMaterial()), hidden = drawn.clone(), standIn = drawn.clone();
  hidden.visible = false; standIn.layers.disableAll();
  root.add(drawn, hidden, standIn);
  try {
    await warmup.warm(root, new AbortController().signal);
    expect(compiled).toEqual([root, drawn, hidden]); // A hidden part may show later (a cockpit, a chunk); a stand-in never draws.
  } finally { warmup.dispose(); }
});
