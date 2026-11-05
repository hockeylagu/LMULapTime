import { CompressedTexture, type WebGLRenderer } from 'three';
import { expect, it, vi } from 'vitest';
import type { CachedKtx2Loader } from '../../../../../src/components/replay/view3d/scenery/cachedKtx2Loader.js';
import { createSurfaceTexturePool } from '../../../../../src/components/replay/view3d/scenery/materials/textureSource.js';
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