import { cloudMapFiles, loadClouds } from '../../shared/domain/scenery/cloudMaps.js';
import type { SceneryChunk, SceneryLayoutPayload, SceneryLayoutResource } from '../../shared/types/scenes/scenery.js';
import { fetchBinary, fetchJson } from './apiClient.js';

/** Content-named scenery files: a chunk GLB at `<sha256>.glb` and the KTX2 textures it names at `textures/<sha256>.ktx2.zst` beside it. */
export const SCENERY_FILES = '/api/data-plugin/scenery/files/';

/** Content-named cloud map files of the package's `rendering/` folder: `<sha256>.bin`, the decoded mip levels of one map, largest first. */
export const RENDERING_FILES = '/api/data-plugin/rendering/files/';

/** The layout with its sky's cloud maps read: the layout JSON names each map's file, whose bytes are sliced into the map's mip levels. */
export async function fetchSceneryLayout(layoutKey: string, signal: AbortSignal): Promise<SceneryLayoutResource> {
  const layout = await fetchJson<SceneryLayoutPayload>(`/api/data-plugin/scenery/${encodeURIComponent(layoutKey)}`, { signal });
  if (layout.layoutKey !== layoutKey) throw Error('3D scenery layout mismatch');
  const files = cloudMapFiles(layout.sky.clouds);
  const bytes = new Map(await Promise.all([...files].map(async ([path, map]) => {
    const file = await fetchBinary(`${RENDERING_FILES}${map.sha256}.bin`, { signal, cache: 'default' });
    if (file.byteLength !== map.byteLength) throw Error(`Incomplete cloud map ${path}`);
    return [path, new Uint8Array(file)] as const;
  })));
  return { ...layout, sky: { ...layout.sky, clouds: loadClouds(layout.sky.clouds, bytes) } };
}

/** One chunk's GLB bytes. Files never change under their hash, so the browser may cache them. */
export async function fetchSceneryChunk(chunk: SceneryChunk, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await fetchBinary(`${SCENERY_FILES}${chunk.sha256}.glb`, { signal, cache: 'default' });
  if (bytes.byteLength !== chunk.byteLength) throw Error(`Incomplete 3D scenery chunk ${chunk.id}`);
  return bytes;
}
