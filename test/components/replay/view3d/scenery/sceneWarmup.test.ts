import { Box3, CompressedTexture, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, RGBA_BPTC_Format, Scene, Vector3, type Texture, type WebGLRenderer } from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { isStreaming, startStreaming } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import { createSceneWarmup } from '../../../../../src/components/replay/view3d/scenery/sceneWarmup.js';

const BC7 = 0x8e8c;
let frames: (() => void)[] = [];
beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => frames.push(run));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());

/** A renderer double whose textures are on the GPU once `upload` ran for them, as after their first draw. */
function fixture() {
  const uploaded = new Set<Texture>(), copies = vi.fn(), gpu = new Map<Texture, object>(), bound: Texture[] = [];
  const renderer = {
    getRenderTarget: () => null, setRenderTarget: () => {}, compile: () => {}, compileAsync: () => Promise.resolve(), initTexture: () => {}, render: () => {},
    getContext: () => ({TEXTURE_2D: 0xde1, TEXTURE_BASE_LEVEL: 0x813c, texParameteri: () => {}}),
    extensions: {get: (name: string) => (name === 'EXT_texture_compression_bptc' ? {COMPRESSED_RGBA_BPTC_UNORM_EXT: BC7} : null)},
    properties: {has: (texture: Texture) => uploaded.has(texture), get: (texture: Texture) => ({__webglTexture: gpu.get(texture)})},
    state: {bindTexture: (_: number, handle: object) => bound.push([...gpu].find(([, value]) => value === handle)![0]), compressedTexSubImage2D: copies},
  } as unknown as WebGLRenderer;
  const changed = vi.fn(), warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, changed);
  /** A `size` px texture (1024 by default) streaming from its quarter-size level. */
  const texture = (size = 1024) => {
    const levels = Array.from({length: Math.log2(size) + 1}, (_, i) => ({data: new Uint8Array(Math.ceil((size >> i) / 4) ** 2 * 16), width: size >> i, height: size >> i}));
    const made = new CompressedTexture(levels, size, size, RGBA_BPTC_Format);
    startStreaming(made, renderer);
    return made;
  };
  const upload = (made: Texture) => { uploaded.add(made); gpu.set(made, {}); (made.onUpdate as unknown as () => void)(); };
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
