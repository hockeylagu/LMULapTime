import { fetchJson } from './apiClient.js';
import { parseTrackBoundaryGeometry, parseTrackMapDisplay } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry, TrackMapDisplay } from '../../shared/types/trackGeometry.js';
import { ApiError } from './apiClient.js';
import type { PluginTrackResource } from '../../shared/types/dataPlugin.js';

const geometryDisplays = new WeakMap<TrackBoundaryGeometry, unknown>();

export function getTrackOutlineUrl(layoutKey: string): string {
  return `/track-outlines/${encodeURIComponent(layoutKey)}.svg`;
}

export async function loadTrackMapDisplay(geometry: TrackBoundaryGeometry, signal?: AbortSignal): Promise<TrackMapDisplay | null> {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  const { layoutKey, geometryRevision } = geometry;
  if (geometryDisplays.has(geometry)) return parseAvailableDisplay(geometryDisplays.get(geometry), layoutKey, geometryRevision);

  let value: unknown;
  try {
    const resource=await fetchJson<PluginTrackResource>(`/api/data-plugin/tracks/${encodeURIComponent(layoutKey)}`, { cache: 'no-cache', signal });
    value=resource.display;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  // Generation can replace geometry and display files at different instants. Do not show stale layers.
  return parseAvailableDisplay(value, layoutKey, geometryRevision);
}

function parseAvailableDisplay(value: unknown, layoutKey: string, geometryRevision?: string): TrackMapDisplay | null {
  if (!value || !geometryRevision) return null;
  if (typeof value === 'object' && 'sourceRevision' in value && value.sourceRevision !== geometryRevision) return null;
  return parseTrackMapDisplay(value, layoutKey, geometryRevision);
}

/** Loads the active local package's metric geometry; absence is an API availability error. */
export async function loadTrackBoundaryGeometry(layoutKey: string): Promise<TrackBoundaryGeometry> {
  const resource = await fetchJson<PluginTrackResource>(`/api/data-plugin/tracks/${encodeURIComponent(layoutKey)}`, { cache: 'no-cache' });
  const geometry = parseTrackBoundaryGeometry(resource.geometry, layoutKey);
  geometryDisplays.set(geometry, resource.display);
  return geometry;
}
