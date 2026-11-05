import type { SceneryChunk, SceneryLayoutResource } from '../../shared/types/scenes/scenery.js';
import { fetchBinary, fetchJson } from './apiClient.js';

/** Content-named scenery files: a chunk GLB at `<sha256>.glb` and the KTX2 textures it names at `textures/<sha256>.ktx2.zst` beside it. */
export const SCENERY_FILES = '/api/data-plugin/scenery/files/';

export async function fetchSceneryLayout(layoutKey: string, signal: AbortSignal): Promise<SceneryLayoutResource> {
  const layout = await fetchJson<SceneryLayoutResource>(`/api/data-plugin/scenery/${encodeURIComponent(layoutKey)}`, { signal });
  if (layout.layoutKey !== layoutKey) throw Error('3D scenery layout mismatch');
  return layout;
}

/** One chunk's GLB bytes. Files never change under their hash, so the browser may cache them. */
export async function fetchSceneryChunk(chunk: SceneryChunk, signal: AbortSignal): Promise<ArrayBuffer> {
  const bytes = await fetchBinary(`${SCENERY_FILES}${chunk.sha256}.glb`, { signal, cache: 'default' });
  if (bytes.byteLength !== chunk.byteLength) throw Error(`Incomplete 3D scenery chunk ${chunk.id}`);
  return bytes;
}
