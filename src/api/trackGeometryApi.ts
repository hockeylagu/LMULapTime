import { fetchJson } from './apiClient.js';
import { parseTrackBoundaryGeometry, parseTrackMapDisplay } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../shared/types/trackGeometry.js';
import { ApiError } from './apiClient.js';

export function getTrackOutlineUrl(layoutKey: string): string {
  return `/track-outlines/${encodeURIComponent(layoutKey)}.svg`;
}

export async function loadTrackMapDisplay(layoutKey: string, sourceRevision: string, signal?: AbortSignal): Promise<TrackMapDisplay | null> {
  let value: unknown;
  try {
    value = await fetchJson<unknown>(`/tracks-display/${encodeURIComponent(layoutKey)}.json`, { cache: 'no-cache', signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  // Generation can replace geometry and display files at different instants. Do not show stale layers.
  if (typeof value === 'object' && value !== null && 'sourceRevision' in value
    && value.sourceRevision !== sourceRevision) return null;
  return parseTrackMapDisplay(value, layoutKey, sourceRevision);
}

/** Loads a layout's 1:1 boundary JSON (`public/tracks/<layoutKey>.json`); rejects with ApiError on a failed request. */
export async function loadTrackBoundaryGeometry(layoutKey: string): Promise<TrackBoundaryGeometry> {
  const value = await fetchJson<unknown>(`/tracks/${layoutKey}.json`, { cache: 'no-cache' });
  return parseTrackBoundaryGeometry(value, layoutKey);
}
