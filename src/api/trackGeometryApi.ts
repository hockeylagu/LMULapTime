import { fetchJson } from './apiClient.js';

/** Loads a layout's 1:1 boundary JSON (`public/tracks/<layoutKey>.json`); rejects with ApiError on a failed request. */
export function loadTrackBoundaryGeometry<T>(layoutKey: string): Promise<T> {
  return fetchJson<T>(`/tracks/${layoutKey}.json`);
}
