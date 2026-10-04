import type { TrackBoundaryGeometry, TrackMapSurfaces } from '../../../../../shared/types/trackGeometry.js';

export const DEFAULT_MAP_LAYERS = {
  road: true, kerb: true, runoff: false, pit: false, otherRoad: false, centerline: false, brakeMarkers: false,
};
export type MapLayers = typeof DEFAULT_MAP_LAYERS;
export type MapLayerKey = keyof MapLayers;
export const MAP_LAYER_LABELS: Record<Exclude<MapLayerKey, 'otherRoad'>, string> = {
  road: 'Active track', kerb: 'Kerbs', runoff: 'Runoff and other roads', pit: 'Pit lane and apron',
  centerline: 'Centerline guide', brakeMarkers: 'Braking markers',
};
export const MAP_LAYERS_STORAGE_KEY = 'lmu-map-layers-v1';

export function readMapLayers(): MapLayers {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(MAP_LAYERS_STORAGE_KEY) ?? 'null');
    if (typeof value !== 'object' || value === null) return { ...DEFAULT_MAP_LAYERS };
    const result = { ...DEFAULT_MAP_LAYERS };
    for (const key of Object.keys(result) as MapLayerKey[]) {
      if (key in value && typeof value[key as keyof typeof value] === 'boolean') {
        result[key] = value[key as keyof typeof value] as boolean;
      }
    }
    // Migrate either previously enabled outer-surface layer into the shared toggle.
    result.runoff = result.otherRoad = result.runoff || result.otherRoad;
    return result;
  } catch { return { ...DEFAULT_MAP_LAYERS }; }
}

export function activeTrackBounds(geometry: TrackBoundaryGeometry | null | undefined) {
  const points = [...(geometry?.leftBoundary ?? []), ...(geometry?.rightBoundary ?? []), ...(geometry?.centerline ?? [])];
  if (!points.length) return undefined;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, minZ, maxX, maxZ, spanX: maxX - minX, spanZ: maxZ - minZ };
}

export function visibleSurfacePoints(surfaces: TrackMapSurfaces | undefined, layers: MapLayers): Array<[number, number]> {
  if (!surfaces) return [];
  return (['road', 'kerb', 'runoff', 'pit', 'otherRoad'] as const)
    .flatMap(key => layers[key] ? (surfaces[key] ?? []).flatMap(polygon => polygon.flat()) : []);
}
