import { CompressedTexture, RGBA_BPTC_Format, type WebGLRenderer } from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { CachedKtx2Loader, withoutLevelsAbove, type TextureDetail } from '../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js';

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

/** Serves each URL its file; without workers, so background reads run on the main thread. */
function serve(files: Record<string, Uint8Array>) {
  const fetchMock = vi.fn<typeof fetch>(async url => new Response(files[url as string].slice()));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Worker', undefined);
  return fetchMock;
}

/** The start file of a texture: the same texture from its third level down, as a file of its own. */
const startFile = (size: number) => ktx2File(size / 4);

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

it('cuts a file to the levels no larger than a given size, and leaves alone what it cannot or need not cut', () => {
  const file = ktx2File(2048).buffer as ArrayBuffer, cut = new DataView(withoutLevelsAbove(file, 1024));
  expect([cut.getUint32(20, true), cut.getUint32(24, true), cut.getUint32(40, true)]).toEqual([1024, 1024, 11]);
  // The first level left is the file's second: its bytes hold their level number.
  expect(new Uint8Array(cut.buffer)[Number(cut.getBigUint64(INDEX, true))]).toBe(1);
  expect([withoutLevelsAbove(file, undefined), withoutLevelsAbove(file, 2048)]).toEqual([file, file]);
  const largestFirst = ktx2File(2048, false).buffer as ArrayBuffer;
  expect(withoutLevelsAbove(largestFirst, 1024)).toBe(largestFirst);
});

it('loads a texture from its start file, then its largest levels from one background read of the full file', async () => {
  const fetchMock = serve({'/t/road.ktx2.zst': ktx2File(2048), '/t/road-start.ktx2.zst': startFile(2048)});
  const ktx2 = loader({start: url => url.replace('.ktx2', '-start.ktx2')});
  const texture = await ktx2.loadAsync('/t/road.ktx2.zst');
  expect(await ktx2.loadAsync('/t/road.ktx2.zst')).toBe(texture);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/t/road-start.ktx2.zst']);
  expect([texture.image.width, texture.mipmaps.length]).toEqual([512, 10]);
  const detail = ktx2.detail(texture);
  expect(detail?.missing).toBe(2);
  const [first, again] = await Promise.all([detail?.load(), detail?.load()]);
  expect(again).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(first?.map(level => [level.width, level.data.length, level.data[0]])).toEqual([[2048, 512 * 512, 0], [1024, 256 * 256, 1]]);
});

it('sharpens a texture no further than its given size', async () => {
  serve({'/t/stand.ktx2.zst': ktx2File(2048), '/t/stand-start.ktx2.zst': startFile(2048), '/t/far.ktx2.zst': ktx2File(2048), '/t/far-start.ktx2.zst': startFile(2048)});
  const ktx2 = loader({start: url => url.replace('.ktx2', '-start.ktx2'), maxPx: url => (url.includes('stand') ? 1024 : 256)});
  const stand = await ktx2.loadAsync('/t/stand.ktx2.zst'), detail = ktx2.detail(stand);
  expect([stand.image.width, detail?.missing]).toEqual([512, 1]);
  expect((await detail?.load())?.map(level => [level.width, level.data[0]])).toEqual([[1024, 1]]);
  // A size under the start file's: the start file itself is cut, and nothing comes later.
  const far = await ktx2.loadAsync('/t/far.ktx2.zst');
  expect([far.image.width, far.mipmaps.length, ktx2.detail(far)]).toEqual([256, 9, undefined]);
});

it('reads a texture without a start file whole, cut to its given size', async () => {
  const fetchMock = serve({'/t/sign.ktx2.zst': ktx2File(256), '/t/body.ktx2.zst': ktx2File(2048)});
  const ktx2 = loader({start: () => undefined, maxPx: url => (url.includes('body') ? 1024 : undefined)});
  const sign = await ktx2.loadAsync('/t/sign.ktx2.zst'), body = await ktx2.loadAsync('/t/body.ktx2.zst');
  expect([sign.mipmaps.length, ktx2.detail(sign)]).toEqual([9, undefined]);
  expect([body.image.width, body.mipmaps.length, body.mipmaps[0].data[0], ktx2.detail(body)]).toEqual([1024, 11, 1, undefined]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
