import { cloudMapFiles, loadClouds } from '../../shared/domain/scenery/cloudMaps.js';
import { readRoadHeight } from '../../shared/domain/scenery/roadHeight.js';
import { realRoadBytes } from '../../shared/packageContract/scenery.js';
import type { SceneryChunkFile, SceneryLayoutPayload, SceneryLayoutResource } from '../../shared/types/scenes/scenery.js';
import { fetchBinary, fetchJson } from './apiClient.js';

/** Content-named scenery files: a chunk GLB at `<sha256>.glb` and the KTX2 textures it names at `textures/<sha256>.ktx2.zst` beside it. */
export const SCENERY_FILES = '/api/data-plugin/scenery/files/';

/** Content-named cloud map files of the package's `rendering/` folder: `<sha256>.bin`, the decoded mip levels of one map, largest first. */
export const RENDERING_FILES = '/api/data-plugin/rendering/files/';

/**
 * The layout with its sky's cloud maps, its road height grid and its RealRoad point table read: the layout JSON names each file. The
 * grid is read before the scene starts, so a height a car or line takes from it is final (no refit as the scenery streams in).
 */
export async function fetchSceneryLayout(layoutKey: string, signal: AbortSignal): Promise<SceneryLayoutResource> {
  const layout = await fetchJson<SceneryLayoutPayload>(`/api/data-plugin/scenery/${encodeURIComponent(layoutKey)}`, { signal });
  if (layout.layoutKey !== layoutKey) throw Error('3D scenery layout mismatch');
  const files = cloudMapFiles(layout.sky.clouds);
  const [maps, heights, realRoad] = await Promise.all([
    Promise.all([...files].map(async ([path, map]) => {
      const file = await fetchBinary(`${RENDERING_FILES}${map.sha256}.bin`, { signal, cache: 'default' });
      if (file.byteLength !== map.byteLength) throw Error(`Incomplete cloud map ${path}`);
      return [path, new Uint8Array(file)] as const;
    })),
    fetchBinary(`${SCENERY_FILES}heights/${layout.roadHeight.sha256}.bin`, { signal, cache: 'default' }),
    fetchBinary(`${SCENERY_FILES}realroad/${layout.realRoad.sha256}.bin`, { signal, cache: 'default' }),
  ]);
  if (realRoad.byteLength !== realRoadBytes(layout.realRoad)) throw Error(`RealRoad table: ${realRoad.byteLength} bytes, the layout states ${layout.realRoad.byteLength}`);
  return {
    ...layout, sky: { ...layout.sky, clouds: loadClouds(layout.sky.clouds, new Map(maps)) }, roadHeightAt: readRoadHeight(layout.roadHeight, heights),
    // Little-endian, as every browser's typed arrays are.
    realRoadTable: new Uint32Array(realRoad),
  };
}

/** One chunk's GLB bytes. Files never change under their hash, so the browser may cache them. */
export async function fetchSceneryChunk(chunk: SceneryChunkFile, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await fetchBinary(`${SCENERY_FILES}${chunk.sha256}.glb`, { signal, cache: 'default' });
  if (bytes.byteLength !== chunk.byteLength) throw Error(`Incomplete 3D scenery chunk ${chunk.id}`);
  return bytes;
}
