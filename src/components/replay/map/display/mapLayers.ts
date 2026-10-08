import type { TrackBoundaryGeometry, TrackMapSurfaces } from '../../../../../shared/types/trackGeometry.js';
import { MAP_COLORS } from '../../../../utils/themeColors.js';

export const DEFAULT_MAP_LAYERS = {
  road: true, kerb: true, brakeMarkers: false,
  brakeDistance: true, brakeAds: true, brakeDigi: true,
  pit: false, centerline: false, runoff: false, otherRoad: false,
  apron: false, gravel: false, grass: false,
};
export type MapLayers = typeof DEFAULT_MAP_LAYERS;
export type MapLayerKey = keyof MapLayers;
/** Layers switched together by the runoff toggle; colour tells them apart, so they share one checkbox. */
export const RUNOFF_GROUP = ['runoff', 'otherRoad', 'apron', 'gravel', 'grass'] as const;
/** Colour key shown under the runoff toggle for the kinds a layout has. */
export const RUNOFF_LEGEND = [
  { key: 'runoff', label: 'Paved runoff', color: MAP_COLORS.runoffSurface },
  { key: 'apron', label: 'Painted apron', color: MAP_COLORS.apronSurface },
  { key: 'gravel', label: 'Gravel', color: MAP_COLORS.gravelSurface },
  { key: 'grass', label: 'Grass', color: MAP_COLORS.grassSurface },
  { key: 'otherRoad', label: 'Other roads', color: MAP_COLORS.outerRoadSurface },
] as const satisfies ReadonlyArray<{ key: typeof RUNOFF_GROUP[number]; label: string; color: string }>;
export const MAP_LAYER_LABELS: Record<Exclude<MapLayerKey, typeof RUNOFF_GROUP[number] | 'brakeDistance' | 'brakeAds' | 'brakeDigi'> | 'runoff', string> = {
  road: 'Active track', kerb: 'Kerbs', brakeMarkers: 'Braking markers', pit: 'Pit lane',
  centerline: 'Centerline guide', runoff: 'Runoff and other roads',
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
    const runoffGroup = RUNOFF_GROUP.some(key => result[key]);
    for (const key of RUNOFF_GROUP) result[key] = runoffGroup;
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
  return (['road', 'kerb', 'runoff', 'apron', 'gravel', 'grass', 'pit', 'otherRoad'] as const)
    .flatMap(key => layers[key] ? (surfaces[key] ?? []).flatMap(polygon => polygon.flat()) : []);
}
