import { CompressedTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import type { CachedKtx2Loader } from '../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js';
import { createSurfaceTexturePool } from '../../../../../src/components/replay/view3d/scenery/materials/textureSource.js';
import { isStreaming } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import type { SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

const map: SurfaceMap = {texture: 'ROAD', uv: 'uv0', scale: [1, 1], srgb: true};
const uris = new Map([['ROAD__srgb.ktx2.zst', 'textures/road.ktx2.zst']]);
const renderer = {capabilities: {getMaxAnisotropy: () => 16}} as unknown as WebGLRenderer;

it('shares a GPU texture across chunks and keeps it until the pool is disposed', async () => {
  const loadAsync = vi.fn(async () => new CompressedTexture([], 1, 1));
  const pool = createSurfaceTexturePool({loadAsync, detail: () => undefined, file: () => undefined} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const first = pool.source(uris), second = pool.source(uris);
  try {
    const [texture, other] = await Promise.all([first.load(map), second.load(map)]);
    expect(other).toBe(texture);
    expect(await first.load(map)).toBe(texture);
    expect(loadAsync).toHaveBeenCalledExactlyOnceWith('/scenery/textures/road.ktx2.zst');
    const dispose = vi.spyOn(texture, 'dispose');
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    pool.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    pool.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  } finally { pool.dispose(); }
});

it('keeps content identities distinct and rejects loads after disposal', async () => {
  const loadAsync = vi.fn(async () => new CompressedTexture([], 1, 1));
  const pool = createSurfaceTexturePool({loadAsync, detail: () => undefined, file: () => undefined} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const first = pool.source(uris), other = pool.source(new Map([['ROAD__srgb.ktx2.zst', 'textures/other.ktx2.zst']]));
  try {
    const texture = await first.load(map), different = await other.load(map);
    expect(different).not.toBe(texture);
    const dispose = vi.spyOn(texture, 'dispose');
    pool.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    await expect(first.load(map)).rejects.toThrow('disposed');
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  } finally { pool.dispose(); }
});

const levels = (size: number) => Array.from({length: Math.log2(size) + 1}, (_, i) => ({data: new Uint8Array(1), width: size >> i, height: size >> i}));
/** How a loader reads the two levels above a start file. */
const detailOf = (startPx: number) => ({missing: 2, load: async () => levels(startPx * 4).slice(0, 2), drop: () => {}});

it('gives raw textures trilinear filtering and starts those read from a start file on its levels', async () => {
  const original = new DataTexture(null, 512, 512), small = new CompressedTexture(levels(256), 256, 256);
  original.mipmaps = levels(512);
  const loadAsync = vi.fn(async (url: string) => (url.includes('small') ? small : original));
  const detail = (texture: unknown) => texture === original ? detailOf(512) : undefined;
  const pool = createSurfaceTexturePool({loadAsync, detail, file: () => undefined} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const source = pool.source(new Map([['ROAD__srgb.ktx2.zst', 'textures/road.ktx2.zst'], ['ROAD__linear.ktx2.zst', 'textures/small.ktx2.zst']]));
  try {
    const texture = await source.load(map), whole = await source.load({...map, srgb: false});
    expect([texture.minFilter, texture.magFilter]).toEqual([LinearMipmapLinearFilter, LinearFilter]);
    expect([isStreaming(texture), texture.source.dataReady, texture.mipmaps.length]).toEqual([true, true, 10]);
    expect(original.source.dataReady).toBe(true); // The cached original keeps its data for other chunks.
    expect([isStreaming(whole), whole.source]).toEqual([false, small.source]); // A texture without a start file loads whole.
  } finally { pool.dispose(); }
});

it('stops streaming a texture once the pool is disposed', async () => {
  const loadAsync = vi.fn(async () => new CompressedTexture(levels(512), 512, 512));
  const pool = createSurfaceTexturePool({loadAsync, detail: () => detailOf(512), file: () => undefined} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const texture = await pool.source(uris).load(map);
  expect(isStreaming(texture)).toBe(true);
  pool.dispose(); await Promise.resolve();
  expect(isStreaming(texture)).toBe(false);
});

it('hands a texture its loader file, so one read whole is let go after its upload', async () => {
  const original = new CompressedTexture(levels(256), 256, 256), file = {drop: vi.fn()};
  const pool = createSurfaceTexturePool({loadAsync: async () => original, detail: () => undefined, file: () => file} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  try {
    const texture = await pool.source(uris).load(map);
    expect([isStreaming(texture), texture.source === original.source, texture.source.dataReady, file.drop.mock.calls.length]).toEqual([false, false, true, 0]);
  } finally { pool.dispose(); }
});
