import { CompressedTexture, DataTexture, RGBA_BPTC_Format, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import { fullPixels, isStreaming, releaseOnUpload, startStreaming, streamTexture, whenUploaded, type MipLevel } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import { focusOf } from '../../../../../src/components/replay/view3d/scenery/textureFocus.js';

const MiB = 1024 * 1024;

/** A renderer double that uploads like three: a source is uploaded once per version, then the texture's `onUpdate` runs. */
function fakeRenderer() {
  const seen = new WeakMap<object, number>(), uploads: {sourceWidth: number; widths: number[]; bytes: number}[] = [];
  const renderer = {
    initTexture: (texture: Texture) => {
      const {source} = texture;
      if (seen.get(source) === source.version) return;
      seen.set(source, source.version);
      const levels = texture.mipmaps as MipLevel[];
      uploads.push({sourceWidth: (source.data as {width: number}).width, widths: levels.map(level => level.width), bytes: levels.reduce((sum, level) => sum + level.data.byteLength, 0)});
      texture.onUpdate?.(texture);
    },
  } as unknown as WebGLRenderer;
  return {renderer, uploads};
}

/** A texture file: `drop` counts the loader copies let go. */
function file() {
  return {drop: vi.fn()};
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

const chainBytes = (size: number) => (bc7(size).mipmaps as MipLevel[]).reduce((sum, level) => sum + level.data.byteLength, 0);

/** How a loader reads the `missing` levels above a start file whose top is `startPx` wide. */
const above = (startPx: number, missing: number, source = file()) => ({missing, load: async () => (bc7(startPx << missing).mipmaps as MipLevel[]).slice(0, missing), ...source});

it('uploads the reduced levels first, then swaps in a source of the full size with every level, in one step', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), missing = 2;
  startStreaming(texture, above(512, missing));
  expect([texture.mipmaps.length, texture.source.data.width, isStreaming(texture), fullPixels(texture)]).toEqual([10, 512, true, 2048 * 2048]);
  expect(streamTexture(texture, gpu.renderer)).toBe(0); // Not on the GPU yet.
  texture.needsUpdate = true;
  gpu.renderer.initTexture(texture);
  expect(gpu.uploads).toEqual([{sourceWidth: 512, widths: Array.from({length: 10}, (_, i) => 512 >> i), bytes: chainBytes(2048) - 5 * MiB}]);
  const reduced = texture.source, dispose = vi.fn(() => { expect(texture.source).toBe(reduced); }); // The old storage is freed under the old source.
  texture.addEventListener('dispose', dispose);
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer)).toBe(chainBytes(2048)); });
  expect([dispose.mock.calls.length, texture.source === reduced, isStreaming(texture)]).toEqual([1, false, false]);
  expect(gpu.uploads[1]).toEqual({sourceWidth: 2048, widths: Array.from({length: 12}, (_, i) => 2048 >> i), bytes: chainBytes(2048)});
  // It comes into focus from the levels it drew without (textureFocus.ts).
  expect(focusOf(texture)).toBeGreaterThan(missing - 0.1);
  expect(streamTexture(texture, gpu.renderer)).toBe(0);
});

it('lets the levels go once the swap is on the GPU, and the loader copy with them', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), source = file(), full = (bc7(1024).mipmaps as MipLevel[]).map(level => [level.width, level.height]);
  startStreaming(texture, above(512, 1, source));
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  expect([source.drop.mock.calls.length, texture.mipmaps[0].data.byteLength > 0]).toEqual([0, true]);
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer)).toBe(chainBytes(1024)); });
  expect(source.drop).toHaveBeenCalledOnce();
  // Every level keeps its size but holds no data.
  expect((texture.mipmaps as MipLevel[]).map(level => [level.width, level.height, level.data.byteLength])).toEqual(full.map(([width, height]) => [width, height, 0]));
  // Nothing uploads the placeholders.
  texture.needsUpdate = true;
  expect(() => { gpu.renderer.initTexture(texture); }).toThrow('uploaded again');
});

it('swaps a raw texture the same way', async () => {
  const gpu = fakeRenderer(), levels = Array.from({length: 10}, (_, i) => ({data: new Uint8Array((512 >> i) ** 2 * 4), width: 512 >> i, height: 512 >> i}));
  const texture: Texture = new DataTexture(null, 128, 128);
  texture.mipmaps = levels.slice(2);
  startStreaming(texture, {missing: 2, load: async () => levels.slice(0, 2), ...file()});
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer)).toBe(levels.reduce((sum, level) => sum + level.data.byteLength, 0)); });
  expect(gpu.uploads.map(upload => [upload.sourceWidth, upload.widths.length])).toEqual([[128, 8], [512, 10]]);
});

it('streams nothing for a texture read whole, and leaves one without a loader file as it is', () => {
  const texture = bc7(2048), source = texture.source;
  startStreaming(texture);
  expect([isStreaming(texture), texture.source === source, texture.mipmaps.length, fullPixels(texture)]).toEqual([false, true, 12, 0]);
});

it('tells a waiting caller when the texture is on the GPU', () => {
  const gpu = fakeRenderer(), texture = bc7(512), early = vi.fn(), late = vi.fn();
  startStreaming(texture, above(512, 1));
  whenUploaded(texture, early);
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  whenUploaded(texture, late);
  expect([early.mock.calls.length, late.mock.calls.length]).toEqual([1, 1]);
});

it('drops detail that finishes after the texture is disposed', async () => {
  const gpu = fakeRenderer(), texture = bc7(512);
  let finish!: (levels: MipLevel[]) => void;
  const detail = new Promise<MipLevel[]>(resolve => { finish = resolve; });
  startStreaming(texture, {missing: 1, load: () => detail, ...file()});
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  expect(streamTexture(texture, gpu.renderer)).toBe(0);
  texture.dispose();
  finish((bc7(1024).mipmaps as MipLevel[]).slice(0, 1));
  await detail;
  expect([isStreaming(texture), texture.onUpdate, streamTexture(texture, gpu.renderer)]).toEqual([false, null, 0]);
  expect(gpu.uploads).toHaveLength(1);
});

it('starts a texture read from its start file on those levels alone, and fetches the levels above when it sharpens', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), full = bc7(2048).mipmaps as MipLevel[];
  const detail = vi.fn(async () => full.slice(0, 2));
  startStreaming(texture, {missing: 2, load: detail, ...file()});
  expect([texture.mipmaps.map(level => level.width).slice(0, 2), texture.source.data.width, fullPixels(texture)]).toEqual([[512, 256], 512, 2048 * 2048]);
  expect(streamTexture(texture, gpu.renderer)).toBe(0); // Not on the GPU: nothing is asked for.
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  // Nothing to swap until the levels arrive; they are asked for once.
  expect([streamTexture(texture, gpu.renderer), streamTexture(texture, gpu.renderer), isStreaming(texture)]).toEqual([0, 0, true]);
  expect(detail).toHaveBeenCalledOnce();
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer)).toBe(chainBytes(2048)); });
  expect([gpu.uploads[1].widths.slice(0, 3), gpu.uploads[1].sourceWidth, isStreaming(texture)]).toEqual([[2048, 1024, 512], 2048, false]);
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
      startStreaming(texture, {missing: 2, load: detail, ...file()});
      texture.needsUpdate = true; gpu.renderer.initTexture(texture);
      expect(streamTexture(texture, gpu.renderer)).toBe(0);
      await vi.waitFor(() => { expect(isStreaming(texture)).toBe(false); });
      return streamTexture(texture, gpu.renderer);
    }));
    expect(kept).toEqual([0, 0]);
    expect(reported.mock.calls.map(([error]) => (error as Error).message).sort()).toEqual(['A texture file does not hold the levels above its start file', 'Request failed (404)']);
  } finally { vi.unstubAllGlobals(); }
});

it('sharpens a texture whose given size is one level above its start file', async () => {
  const gpu = fakeRenderer(), texture = bc7(512), full = bc7(1024).mipmaps as MipLevel[];
  startStreaming(texture, {missing: 1, load: async () => full.slice(0, 1), ...file()});
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  expect(streamTexture(texture, gpu.renderer)).toBe(0);
  await vi.waitFor(() => { expect(streamTexture(texture, gpu.renderer)).toBe(chainBytes(1024)); });
  expect([gpu.uploads[1].widths.slice(0, 2), isStreaming(texture)]).toEqual([[1024, 512], false]);
});

it('lets a texture read whole go right after its first upload', () => {
  const gpu = fakeRenderer(), texture = bc7(256), source = file();
  releaseOnUpload(texture, source);
  expect([isStreaming(texture), source.drop.mock.calls.length]).toEqual([false, 0]);
  texture.needsUpdate = true; gpu.renderer.initTexture(texture);
  expect([gpu.uploads[0].widths.length, source.drop.mock.calls.length, texture.mipmaps[0].width, texture.mipmaps[0].data.byteLength, texture.mipmaps.length]).toEqual([9, 1, 256, 0, 9]);
});
