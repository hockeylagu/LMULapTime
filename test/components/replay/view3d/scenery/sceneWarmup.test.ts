import { CompressedTexture, PerspectiveCamera, RGBA_BPTC_Format, Scene, type Texture, type WebGLRenderer } from 'three';
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
  const uploaded = new Set<Texture>(), copies = vi.fn();
  const renderer = {
    getRenderTarget: () => null, setRenderTarget: () => {}, compile: () => {},
    getContext: () => ({TEXTURE_2D: 0xde1, TEXTURE_BASE_LEVEL: 0x813c, texParameteri: () => {}}),
    extensions: {get: (name: string) => (name === 'EXT_texture_compression_bptc' ? {COMPRESSED_RGBA_BPTC_UNORM_EXT: BC7} : null)},
    properties: {has: (texture: Texture) => uploaded.has(texture), get: () => ({__webglTexture: {}})},
    state: {bindTexture: () => {}, compressedTexSubImage2D: copies},
  } as unknown as WebGLRenderer;
  const changed = vi.fn(), warmup = createSceneWarmup(renderer, new Scene(), new PerspectiveCamera(), () => {}, changed);
  /** A 1024 px texture streaming from its 256 px level. */
  const texture = () => {
    const levels = Array.from({length: 11}, (_, i) => ({data: new Uint8Array(Math.ceil((1024 >> i) / 4) ** 2 * 16), width: 1024 >> i, height: 1024 >> i}));
    const made = new CompressedTexture(levels, 1024, 1024, RGBA_BPTC_Format);
    startStreaming(made, renderer);
    return made;
  };
  const upload = (made: Texture) => { uploaded.add(made); (made.onUpdate as unknown as () => void)(); };
  /** Runs frames until none is asked for; returns how many ran. */
  const drain = () => { let ran = 0; while (frames.length && ran < 100) { frames.shift()!(); ran++; } return ran; };
  return {warmup, texture, upload, drain, changed};
}

it('sharpens a queued texture once it is on the GPU, and asks for no frame while it is not', () => {
  const {warmup, texture, upload, drain, changed} = fixture(), undrawn = texture();
  try {
    warmup.sharpen(undrawn); warmup.shown();
    expect([frames.length, isStreaming(undrawn)]).toEqual([0, true]); // Nothing to copy yet: the queue is empty, no frame loop runs.
    upload(undrawn);
    expect(frames).toHaveLength(1);
    expect(drain()).toBeGreaterThan(0);
    expect([isStreaming(undrawn), frames.length, changed.mock.calls.length > 0]).toEqual([false, 0, true]); // Sharp, and the loop ended.
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
