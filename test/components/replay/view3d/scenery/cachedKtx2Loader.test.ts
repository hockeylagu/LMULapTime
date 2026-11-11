import { CompressedTexture, RGBA_BPTC_Format, type WebGLRenderer } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { CachedKtx2Loader, firstReadEnd, skippedLevels, type TextureDetail } from '../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js';

afterEach(() => { vi.unstubAllGlobals(); });

const INDEX = 80, ENTRY = 24;
const renderer = {capabilities: {isWebGL2: true}, extensions: {has: () => false}} as unknown as WebGLRenderer;

/** A KTX2 container of a square texture: header, level index, then the levels smallest first, one byte per 4×4 block holding the level's number. */
function ktx2File(size: number, smallestFirst = true): Uint8Array {
  const levels = Math.log2(size) + 1, bytes = (level: number) => Math.ceil((size >> level) / 4) ** 2;
  const order = Array.from({length: levels}, (_, level) => level);
  if (smallestFirst) order.reverse();
  const file = new Uint8Array(INDEX + levels * ENTRY + order.reduce((sum, level) => sum + bytes(level), 0)), view = new DataView(file.buffer);
  view.setUint32(20, size, true); view.setUint32(24, size, true); view.setUint32(40, levels, true);
  let offset = INDEX + levels * ENTRY;
  for (const level of order) {
    view.setBigUint64(INDEX + level * ENTRY, BigInt(offset), true); view.setBigUint64(INDEX + level * ENTRY + 8, BigInt(bytes(level)), true);
    file.fill(level, offset, offset + bytes(level));
    offset += bytes(level);
  }
  return file;
}

/** Serves `file` in 64 KiB body chunks; `served()` is how many bytes were pulled over all requests. */
function serve(file: Uint8Array) {
  let served = 0;
  const fetchMock = vi.fn<typeof fetch>(async () => {
    let at = 0;
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= file.length) { controller.close(); return; }
        const chunk = file.slice(at, at + 65536);
        at += chunk.length; served += chunk.length;
        controller.enqueue(chunk);
      },
    }, {highWaterMark: 0}));
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Worker', undefined);
  return {fetchMock, served: () => served};
}

/** A loader whose parser reads the container the way the test file is laid out. */
function loader(detail?: TextureDetail): CachedKtx2Loader {
  const ktx2 = new CachedKtx2Loader(renderer, detail);
  vi.spyOn(ktx2, 'parse').mockImplementation((buffer, onLoad) => {
    const view = new DataView(buffer), width = view.getUint32(20, true), height = view.getUint32(24, true);
    const mipmaps = Array.from({length: view.getUint32(40, true)}, (_, level) => {
      const offset = Number(view.getBigUint64(INDEX + level * ENTRY, true)), length = Number(view.getBigUint64(INDEX + level * ENTRY + 8, true));
      return {data: new Uint8Array(buffer, offset, length), width: width >> level, height: height >> level};
    });
    onLoad?.(new CompressedTexture(mipmaps, width, height, RGBA_BPTC_Format));
  });
  return ktx2;
}

const INDEX_END = INDEX + 12 * ENTRY;
/** Bytes of a 2048 file up to and including the level whose side is the given size. */
const through = (px: number) => INDEX_END + Array.from({length: Math.log2(px) + 1}, (_, i) => Math.ceil((px >> i) / 4) ** 2).reduce((a, b) => a + b);

it('finds how much of a file its first read needs, once the level index has arrived', () => {
  const file = ktx2File(2048);
  expect(firstReadEnd(file.subarray(0, 79), undefined, true)).toBeUndefined();
  expect(firstReadEnd(file.subarray(0, INDEX_END - 1), undefined, true)).toBeUndefined();
  // Streamed: up to level 2. Capped at 1024: up to level 1. Both: the capped texture's own reduced levels, level 3.
  expect([firstReadEnd(file, undefined, true), firstReadEnd(file, 1024, false), firstReadEnd(file, 1024, true)]).toEqual([through(512), through(1024), through(256)]);
  // Whole: nothing to leave out, or not stored smallest first.
  expect([firstReadEnd(ktx2File(256), undefined, true), firstReadEnd(file, 2048, false), firstReadEnd(ktx2File(2048, false), 1024, true)]).toEqual([Infinity, Infinity, Infinity]);
});

it('leaves out the levels above the given size for good, then the streamed ones of what is still large', () => {
  expect(skippedLevels(2048, 2048, 12, undefined, true)).toEqual({dropped: 0, later: 2});
  expect(skippedLevels(2048, 2048, 12, 1024, true)).toEqual({dropped: 1, later: 2});
  // Sized by the longer side; under the streamed size once capped, so nothing comes later.
  expect(skippedLevels(4096, 512, 13, 1024, true)).toEqual({dropped: 2, later: 0});
  expect(skippedLevels(2048, 2048, 12, 512, true)).toEqual({dropped: 2, later: 2});
  expect(skippedLevels(2048, 2048, 1, 512, false)).toEqual({dropped: 0, later: 0});
});

it('reads a large texture as far as its reduced levels, then its largest levels from one whole read', async () => {
  const file = ktx2File(2048), {fetchMock, served} = serve(file), ktx2 = loader({streamed: true});
  const texture = await ktx2.loadAsync('/scenery/textures/road.ktx2.zst');
  expect(await ktx2.loadAsync('/scenery/textures/road.ktx2.zst')).toBe(texture);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(served()).toBeLessThan(file.length / 2);
  // A complete texture of levels 2…11: a quarter of the size, each level holding its own bytes.
  expect([texture.image.width, texture.mipmaps.length]).toEqual([512, 10]);
  expect(texture.mipmaps.map(level => [level.width, level.data.length, level.data[0]]).slice(0, 2)).toEqual([[512, 128 * 128, 2], [256, 64 * 64, 3]]);
  expect(texture.mipmaps.at(-1)?.data[0]).toBe(11);
  const detail = ktx2.detail(texture);
  const [first, again] = await Promise.all([detail?.(), detail?.()]);
  expect(again).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(first?.map(level => [level.width, level.data.length, level.data[0]])).toEqual([[2048, 512 * 512, 0], [1024, 256 * 256, 1]]);
});

it('never reads the levels above a texture\'s given size, on the first read or when it sharpens', async () => {
  const file = ktx2File(2048), {served} = serve(file);
  const ktx2 = loader({streamed: true, maxPx: url => (url.endsWith('stand.ktx2.zst') ? 1024 : undefined)});
  const texture = await ktx2.loadAsync('/scenery/textures/stand.ktx2.zst');
  // The 1024 texture's reduced levels (file levels 3…11), then file levels 1 and 2 from a read that stops before level 0.
  expect([texture.image.width, texture.mipmaps.length, texture.mipmaps[0].data[0]]).toEqual([256, 9, 3]);
  const levels = await ktx2.detail(texture)?.();
  expect(levels?.map(level => [level.width, level.data[0]])).toEqual([[1024, 1], [512, 2]]);
  // Both reads together stay well short of the file: its largest level is most of it.
  expect(served()).toBeLessThan(file.length * 0.6);
});

it('reads small textures, and every texture of a loader given no detail rule, whole', async () => {
  serve(ktx2File(256));
  const small = loader({streamed: true}), texture = await small.loadAsync('/scenery/textures/sign.ktx2.zst');
  expect([texture.mipmaps.length, small.detail(texture)]).toEqual([9, undefined]);
  const {served} = serve(ktx2File(2048)), whole = loader(), car = await whole.loadAsync('/vehicles/textures/body.ktx2.zst');
  expect([car.image.width, car.mipmaps.length, whole.detail(car), served()]).toEqual([2048, 12, undefined, ktx2File(2048).length]);
});

it('reads a capped texture no larger than the cap and never fetches the rest', async () => {
  const file = ktx2File(2048), {fetchMock, served} = serve(file), ktx2 = loader({maxPx: () => 1024});
  const texture = await ktx2.loadAsync('/vehicles/textures/body.ktx2.zst');
  expect([texture.image.width, texture.mipmaps.length, texture.mipmaps[0].data[0], ktx2.detail(texture)]).toEqual([1024, 11, 1, undefined]);
  expect(served()).toBeLessThan(file.length / 2);
  expect(fetchMock).toHaveBeenCalledOnce();
});
