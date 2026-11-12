import { CompressedTexture, DataTexture, RGBA_BPTC_Format, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { isStreaming, startStreaming, STREAMED_LEVELS, streamTexture, type MipLevel } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';

const MiB = 1024 * 1024;
const GL = {TEXTURE_2D: 0xde1, TEXTURE_BASE_LEVEL: 0x813c, UNPACK_FLIP_Y_WEBGL: 0x9240, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_ALIGNMENT: 0xcf5, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401};
const SRGB_BC7 = 0x8e8d, LINEAR_BC7 = 0x8e8c;

/** A renderer double recording the sub-image copies (level, y, height, bytes) and base-level changes. */
function fakeRenderer(onGpu = true) {
  type Call = (...args: unknown[]) => void;
  const texParameteri = vi.fn<Call>(), compressed = vi.fn<Call>(), raw = vi.fn<Call>(), pixelStorei = vi.fn<Call>();
  const renderer = {
    getContext: () => ({...GL, texParameteri}),
    extensions: {get: (name: string) => (name === 'EXT_texture_compression_bptc' ? {COMPRESSED_RGBA_BPTC_UNORM_EXT: LINEAR_BC7, COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT: SRGB_BC7} : null)},
    properties: {has: () => onGpu, get: () => ({__webglTexture: {}})},
    state: {bindTexture: vi.fn(), pixelStorei, compressedTexSubImage2D: compressed, texSubImage2D: raw},
  } as unknown as WebGLRenderer;
  const baseLevels = () => texParameteri.mock.calls.map(call => call[2] as number);
  const copies = (spy: typeof compressed) => spy.mock.calls.map(call => [call[1] as number, call[3] as number, call[5] as number, (call.at(-1) as Uint8Array).byteLength]);
  return {renderer, baseLevels, compressed: () => copies(compressed), raw: () => copies(raw), pixelStorei};
}

/** A BC7 chain: 16 bytes per 4×4 block. */
function bc7(size: number): CompressedTexture {
  const levels = Array.from({length: Math.log2(size) + 1}, (_, i) => {
    const side = size >> i, blocks = Math.ceil(side / 4) ** 2;
    return {data: new Uint8Array(blocks * 16), width: side, height: side};
  });
  const texture = new CompressedTexture(levels, size, size, RGBA_BPTC_Format);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

it('fills the reduced levels on allocation, then streams the top levels in budgeted bands into the same texture', () => {
  const gpu = fakeRenderer(), texture = bc7(2048);
  startStreaming(texture, gpu.renderer);
  expect([texture.source.dataReady, texture.mipmaps.length]).toEqual([false, 12]); // three allocates the full chain.
  texture.onUpdate?.(texture);
  // Levels 2…11 whole, in the sRGB format three allocated, sampled from level 2.
  expect(gpu.compressed().map(([level, y]) => [level, y])).toEqual(Array.from({length: 10}, (_, i) => [i + STREAMED_LEVELS, 0]));
  expect(gpu.baseLevels()).toEqual([2]);
  expect(gpu.compressed()[0][3]).toBe(128 * 128 * 16); // Level 2: 512² in 4×4 blocks.
  const before = gpu.compressed().length;
  const copied = [1, 2, 3, 4, 5].map(() => streamTexture(texture, gpu.renderer, MiB));
  // Level 1 (1 MiB) in one band, then level 0 (4 MiB) in four bands of 512 rows.
  expect(copied).toEqual([MiB, MiB, MiB, MiB, MiB]);
  expect(gpu.compressed().slice(before)).toEqual([[1, 0, 1024, MiB], [0, 0, 512, MiB], [0, 512, 512, MiB], [0, 1024, 512, MiB], [0, 1536, 512, MiB]]);
  expect(gpu.baseLevels()).toEqual([2, 1, 0]);
  expect(isStreaming(texture)).toBe(false);
  expect(streamTexture(texture, gpu.renderer, MiB)).toBe(0);
  // Allocated again once full (a lost context): every level is refilled and sampled.
  texture.onUpdate?.(texture);
  expect(gpu.compressed().slice(before + 5).map(([level]) => level)).toEqual(Array.from({length: 12}, (_, i) => i));
  expect(gpu.baseLevels().at(-1)).toBe(0);
  texture.dispose();
  expect(texture.onUpdate).toBeNull();
});

it('drops detail that finishes after the texture is disposed', async () => {
  const gpu = fakeRenderer(), texture = bc7(512);
  let finish!: (levels: MipLevel[]) => void;
  const detail = new Promise<MipLevel[]>(resolve => { finish = resolve; });
  startStreaming(texture, gpu.renderer, {missing: 1, load: () => detail});
  expect(streamTexture(texture, gpu.renderer, MiB)).toBe(0);
  texture.dispose();
  finish((bc7(1024).mipmaps as MipLevel[]).slice(0, 1));
  await detail;
  expect([isStreaming(texture), texture.onUpdate, texture.mipmaps[0].data.byteLength]).toEqual([false, null, 0]);
  expect(streamTexture(texture, gpu.renderer, MiB)).toBe(0);
});

it('copies at least one row of a raw texture with a clean unpack state, and waits for the texture to be on the GPU', () => {
  const levels = Array.from({length: 10}, (_, i) => ({data: new Uint8Array((512 >> i) ** 2 * 4), width: 512 >> i, height: 512 >> i}));
  const texture: Texture = new DataTexture(null, 512, 512);
  texture.mipmaps = levels;
  const offline = fakeRenderer(false);
  startStreaming(texture, offline.renderer);
  expect(streamTexture(texture, offline.renderer, MiB)).toBe(0);
  const gpu = fakeRenderer();
  expect(streamTexture(texture, gpu.renderer, 100)).toBe(256 * 4); // One 256-pixel row of level 1, though over budget.
  expect(gpu.raw()).toEqual([[1, 0, 1, 1024]]);
  expect(gpu.pixelStorei.mock.calls).toContainEqual([GL.UNPACK_FLIP_Y_WEBGL, false]);
  expect(streamTexture(texture, gpu.renderer, 2 * MiB)).toBe(255 * 1024 + 512 * 512 * 4); // Rest of level 1, then all of level 0.
  expect([gpu.baseLevels(), isStreaming(texture)]).toEqual([[1, 0], false]);
});

it('allocates the full chain of a texture read from its start file and fetches the levels above when it sharpens', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), full = bc7(2048).mipmaps as MipLevel[];
  const detail = vi.fn(async () => full.slice(0, 2));
  startStreaming(texture, gpu.renderer, {missing: 2, load: detail});
  expect(texture.mipmaps.map(level => level.width).slice(0, 3)).toEqual([2048, 1024, 512]);
  texture.onUpdate?.(texture);
  expect(gpu.compressed().map(([level]) => level)).toEqual(Array.from({length: 10}, (_, i) => i + STREAMED_LEVELS));
  // Nothing to copy until the levels arrive; they are asked for once.
  expect([streamTexture(texture, gpu.renderer, MiB), streamTexture(texture, gpu.renderer, MiB), isStreaming(texture)]).toEqual([0, 0, true]);
  expect(detail).toHaveBeenCalledOnce();
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer, 8 * MiB)).toBe(5 * MiB); });
  expect([gpu.baseLevels(), isStreaming(texture)]).toEqual([[2, 1, 0], false]);
});

it('keeps a texture on its reduced levels and reports the error when the levels above cannot be read or do not fit', async () => {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  try {
    const gpu = fakeRenderer();
    const unreadable = async (): Promise<MipLevel[]> => Promise.reject(Error('Request failed (404)'));
    const wrongSize = async () => (bc7(1024).mipmaps as MipLevel[]).slice(0, 2);
    const kept = await Promise.all([unreadable, wrongSize].map(async detail => {
      const texture = bc7(512);
      startStreaming(texture, gpu.renderer, {missing: 2, load: detail});
      expect(streamTexture(texture, gpu.renderer, MiB)).toBe(0);
      await vi.waitFor(() => { expect(isStreaming(texture)).toBe(false); });
      return streamTexture(texture, gpu.renderer, MiB);
    }));
    expect(kept).toEqual([0, 0]);
    expect(reported.mock.calls.map(([error]) => (error as Error).message).sort()).toEqual(['A texture file does not hold the levels above its start file', 'Request failed (404)']);
  } finally { vi.unstubAllGlobals(); }
});

it('sharpens by one level a texture whose given size is one level above its start file', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), full = bc7(1024).mipmaps as MipLevel[];
  startStreaming(texture, gpu.renderer, {missing: 1, load: async () => full.slice(0, 1)});
  expect(texture.mipmaps.map(level => level.width).slice(0, 2)).toEqual([1024, 512]);
  texture.onUpdate?.(texture);
  expect(streamTexture(texture, gpu.renderer, MiB)).toBe(0);
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer, 8 * MiB)).toBe(MiB); });
  expect([gpu.baseLevels(), isStreaming(texture)]).toEqual([[1, 0], false]);
});
