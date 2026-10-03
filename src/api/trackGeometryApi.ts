import { fetchJson } from './apiClient.js';
import { parseTrackBoundaryGeometry } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';

/** Loads a layout's 1:1 boundary JSON (`public/tracks/<layoutKey>.json`); rejects with ApiError on a failed request. */
export async function loadTrackBoundaryGeometry(layoutKey: string): Promise<TrackBoundaryGeometry> {
  const value = await fetchJson<unknown>(`/tracks/${layoutKey}.json`, { cache: 'no-cache' });
  return parseTrackBoundaryGeometry(value, layoutKey);
}
