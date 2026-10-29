import type { TrackSceneResource } from '../../shared/types/scenes/trackScene.js';
import { fetchBinary, fetchJson } from './apiClient.js';

export async function fetchTrackScene(layoutKey: string, signal: AbortSignal): Promise<{ metadata: TrackSceneResource; bytes: ArrayBuffer }> {
  const base = `/api/data-plugin/scenes/${encodeURIComponent(layoutKey)}`;
  const metadata = await fetchJson<TrackSceneResource>(base, { signal });
  if (metadata.layoutKey !== layoutKey) throw Error('3D scene layout mismatch');
  const bytes = await fetchBinary(`${base}/${encodeURIComponent(metadata.revision)}/asset`, { signal });
  if (bytes.byteLength !== metadata.byteLength) throw Error('Incomplete 3D scene');
  return { metadata, bytes };
}
