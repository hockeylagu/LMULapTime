import { fetchJson } from './apiClient.js';
import { parseTrackBoundaryGeometry } from '../../shared/domain/trackGeometry.js';
import type { TrackBoundaryGeometry } from '../../shared/types/trackGeometry.js';
import type { PluginTrackResource } from '../../shared/types/dataPlugin.js';

export function getTrackOutlineUrl(layoutKey: string): string {
  return `/track-outlines/${encodeURIComponent(layoutKey)}.svg`;
}

/** Loads the active local package's track: metric geometry with its map `surfaces` and `brakeMarkers`; absence is an API availability error. */
export async function loadTrackBoundaryGeometry(layoutKey: string): Promise<TrackBoundaryGeometry> {
  const resource = await fetchJson<PluginTrackResource>(`/api/data-plugin/tracks/${encodeURIComponent(layoutKey)}`, { cache: 'no-cache' });
  return parseTrackBoundaryGeometry(resource.geometry, layoutKey);
}
