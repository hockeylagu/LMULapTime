import type { TimingGateGeometry, TrackBoundaryGeometry as PackageTrackGeometry, TrackBrakeMarker, TrackKerbType, TrackKerbTypeColumns, TrackMapSurfaces,
  TrackSurfaceProfile, TrackSurfaceProfileColumns, TrackSurfacePolygon, TrackTimingGates } from '../packageContract/index.js';

// The package's track shapes are the contract's (docs/PACKAGE_FORMAT.md, Tracks); this file adds what only the app derives.
export type { TimingGateGeometry, TrackBrakeMarker, TrackKerbType, TrackKerbTypeColumns, TrackMapSurfaces, TrackSurfaceProfile, TrackSurfaceProfileColumns, TrackSurfacePolygon, TrackTimingGates };

export interface TrackGeometryQuality {
  surfaces: 'native' | 'estimated';
  boundaries: 'native' | 'partial' | 'estimated';
  elevation: 'native' | 'partial' | 'unavailable';
  banking: 'native' | 'partial' | 'unavailable';
  legalLimits: 'unavailable' | 'candidate' | 'validated';
}

export type TrackSurfaceProfileSample = {
  stationM: number;
  leftKerbType: TrackKerbType | null;
  rightKerbType: TrackKerbType | null;
} & { [Key in keyof TrackSurfaceProfileColumns]: number | null };

/**
 * A track as the app handles it: the package's layout file (`PackageTrackGeometry`) with the revisions and map layers optional, because geometry
 * from the database or an older source has none, plus the app's own `quality`.
 */
export interface TrackBoundaryGeometry extends Omit<PackageTrackGeometry, 'geometryRevision' | 'projectionRevision' | 'surfaces' | 'brakeMarkers'> {
  geometryRevision?: string;
  projectionRevision?: string;
  quality?: TrackGeometryQuality;
  /** Map display surfaces (road and kerb are active-layout only); timing and lap projection use the centerline. Not part of `geometryRevision`. */
  surfaces?: TrackMapSurfaces;
  /** Brake-board markers of the 2D map. Not part of `geometryRevision`. */
  brakeMarkers?: TrackBrakeMarker[];
}
