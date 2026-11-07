import { CompressedTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import type { CachedKtx2Loader } from '../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js';
import { createSurfaceTexturePool } from '../../../../../src/components/replay/view3d/scenery/materials/textureSource.js';
import { isStreaming } from '../../../../../src/components/replay/view3d/scenery/materials/mipStreaming.js';
import type { SurfaceMap } from '../../../../../src/components/replay/view3d/scenery/materials/surfaceConfig.js';

const map: SurfaceMap = {texture: 'ROAD', uv: 'UV_A', srgb: true};
const uris = new Map([['ROAD__srgb.ktx2.zst', 'textures/road.ktx2.zst']]);
const renderer = {capabilities: {getMaxAnisotropy: () => 16}} as unknown as WebGLRenderer;

it('shares a GPU texture across chunks and retains it until its final chunk unloads', async () => {
  const loadAsync = vi.fn(async () => new CompressedTexture([], 1, 1));
  const pool = createSurfaceTexturePool({loadAsync} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const first = pool.source(uris), second = pool.source(uris);
  try {
    const [texture, other] = await Promise.all([first.load(map), second.load(map)]);
    expect(other).toBe(texture);
    expect(await first.load(map)).toBe(texture);
    expect(loadAsync).toHaveBeenCalledExactlyOnceWith('/scenery/textures/road.ktx2.zst');
    const dispose = vi.spyOn(texture, 'dispose');
    first.dispose();
    await Promise.resolve();
    expect(dispose).not.toHaveBeenCalled();
    second.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    first.dispose(); second.dispose(); pool.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  } finally { first.dispose(); second.dispose(); pool.dispose(); }
});

it('keeps content identities distinct and rejects loads after release', async () => {
  const loadAsync = vi.fn(async () => new CompressedTexture([], 1, 1));
  const pool = createSurfaceTexturePool({loadAsync} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const first = pool.source(uris), other = pool.source(new Map([['ROAD__srgb.ktx2.zst', 'textures/other.ktx2.zst']]));
  try {
    const texture = await first.load(map), different = await other.load(map);
    expect(different).not.toBe(texture);
    const dispose = vi.spyOn(texture, 'dispose');
    pool.dispose();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    first.dispose(); other.dispose();
    await expect(first.load(map)).rejects.toThrow('disposed');
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  } finally { first.dispose(); other.dispose(); pool.dispose(); }
});
it('gives raw textures trilinear filtering and starts large ones on their reduced levels', async () => {
  const levels = (size: number) => Array.from({length: Math.log2(size) + 1}, (_, i) => ({data: new Uint8Array(1), width: size >> i, height: size >> i}));
  const original = new DataTexture(null, 2048, 2048), small = new CompressedTexture(levels(256), 256, 256);
  original.mipmaps = levels(2048);
  const loadAsync = vi.fn(async (url: string) => (url.includes('small') ? small : original));
  const pool = createSurfaceTexturePool({loadAsync} as unknown as CachedKtx2Loader, renderer, '/scenery/');
  const source = pool.source(new Map([['ROAD__srgb.ktx2.zst', 'textures/road.ktx2.zst'], ['ROAD__linear.ktx2.zst', 'textures/small.ktx2.zst']]));
  try {
    const texture = await source.load(map), whole = await source.load({...map, srgb: false});
    expect([texture.minFilter, texture.magFilter]).toEqual([LinearMipmapLinearFilter, LinearFilter]);
    expect([isStreaming(texture), texture.source.dataReady, texture.mipmaps.length]).toEqual([true, false, 12]);
    expect(original.source.dataReady).toBe(true); // The cached original keeps its data for other chunks.
    expect([isStreaming(whole), whole.source]).toEqual([false, small.source]); // Small textures load whole.
  } finally { source.dispose(); pool.dispose(); }
});

it('stops streaming a texture whose last chunk released it', async () => {
  const levels = Array.from({length: 12}, (_, i) => ({data: new Uint8Array(1), width: 2048 >> i, height: 2048 >> i}));
  const loadAsync = vi.fn(async () => new CompressedTexture(levels, 2048, 2048));
  const pool = createSurfaceTexturePool({loadAsync} as unknown as CachedKtx2Loader, renderer, '/scenery/'), source = pool.source(uris);
  const texture = await source.load(map);
  expect(isStreaming(texture)).toBe(true);
  source.dispose(); await Promise.resolve();
  expect(isStreaming(texture)).toBe(false);
  pool.dispose();
});
