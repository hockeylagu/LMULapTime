import { fetchJson } from './apiClient.js';
import { parseTrackBoundaryGeometry, parseTrackMapDisplay } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../shared/types/trackGeometry.js';
import { ApiError } from './apiClient.js';
import type { PluginTrackResource } from '../../shared/types/dataPlugin.js';

export function getTrackOutlineUrl(layoutKey: string): string {
  return `/track-outlines/${encodeURIComponent(layoutKey)}.svg`;
}

export async function loadTrackMapDisplay(layoutKey: string, sourceRevision: string, signal?: AbortSignal): Promise<TrackMapDisplay | null> {
  let value: unknown;
  try {
    const resource=await fetchJson<PluginTrackResource>(`/api/data-plugin/tracks/${encodeURIComponent(layoutKey)}`, { cache: 'no-cache', signal });
    value=resource.display;
    if (!value) return null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  // Generation can replace geometry and display files at different instants. Do not show stale layers.
  if (typeof value === 'object' && value !== null && 'sourceRevision' in value
    && value.sourceRevision !== sourceRevision) return null;
  return parseTrackMapDisplay(value, layoutKey, sourceRevision);
}

/** Loads the active local package's metric geometry; absence is an API availability error. */
export async function loadTrackBoundaryGeometry(layoutKey: string): Promise<TrackBoundaryGeometry> {
  const resource = await fetchJson<PluginTrackResource>(`/api/data-plugin/tracks/${encodeURIComponent(layoutKey)}`, { cache: 'no-cache' });
  const value=resource.geometry;
  return parseTrackBoundaryGeometry(value, layoutKey);
}
