export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

export interface TrackTimingGates {
  startFinish: TimingGateGeometry;
  sector1?: TimingGateGeometry;
  sector2?: TimingGateGeometry;
}

/** Each polygon contains an exterior ring followed by any holes, in local x/z meters. */
export type TrackSurfacePolygon = Array<Array<[number, number]>>;

export interface TrackMapSurfaces {
  road: TrackSurfacePolygon[];
  kerb: TrackSurfacePolygon[];
  /** Named anti-cut/sausage kerbs, drawn over the combined kerb layer. */
  raisedKerb?: TrackSurfacePolygon[];
  /** Kerbs belonging to other roads, outside `kerb`; shown with other roads. */
  otherRoadKerb?: TrackSurfacePolygon[];
  runoff: TrackSurfacePolygon[];
  /** Painted and artificial-turf runoff, split from `runoff` for display only. */
  apron?: TrackSurfacePolygon[];
  gravel?: TrackSurfacePolygon[];
  grass?: TrackSurfacePolygon[];
  pit?: TrackSurfacePolygon[];
  otherRoad?: TrackSurfacePolygon[];
}

/** A brake-board marker of the 2D map; display only. */
export interface TrackBrakeMarker {
  id: string;
  center: [number, number];
  label?: string;
  stationM: number;
  side: 'left' | 'right';
  normal?: [number, number];
  /** Native height of the board's bottom edge, when the game's board bounds are known. */
  baseY?: number;
}

export interface TrackGeometryQuality {
  surfaces: 'native' | 'estimated';
  boundaries: 'native' | 'partial' | 'estimated';
  elevation: 'native' | 'partial' | 'unavailable';
  banking: 'native' | 'partial' | 'unavailable';
  legalLimits: 'unavailable' | 'candidate' | 'validated';
}

/** Actual native surface measurements; unavailable measurements remain null. */
export interface TrackSurfaceProfileColumns {
  leftWidthM: Array<number | null>;
  rightWidthM: Array<number | null>;
  elevationM: Array<number | null>;
  gradePct: Array<number | null>;
  /** Positive banking means the left edge is higher than the right edge. */
  bankDeg: Array<number | null>;
  leftElevationM: Array<number | null>;
  rightElevationM: Array<number | null>;
  leftKerbWidthM: Array<number | null>;
  rightKerbWidthM: Array<number | null>;
  leftKerbHeightM: Array<number | null>;
  rightKerbHeightM: Array<number | null>;
}

/** Kerb surface category: flat rumble strip, raised sawtooth (razor) kerb, or another kerb surface. */
export type TrackKerbType = 'flat' | 'sawtooth' | 'other';

/** Kerb type at each station (null where that side has no kerb); absent in files built before it existed. */
export interface TrackKerbTypeColumns {
  leftKerbType?: Array<TrackKerbType | null>;
  rightKerbType?: Array<TrackKerbType | null>;
}

export interface TrackSurfaceProfile extends TrackSurfaceProfileColumns, TrackKerbTypeColumns {
  /** Ascending centerline stations: first is zero and last is strictly below lengthM. */
  stationM: number[];
}

export type TrackSurfaceProfileSample = {
  stationM: number;
  leftKerbType: TrackKerbType | null;
  rightKerbType: TrackKerbType | null;
} & { [Key in keyof TrackSurfaceProfileColumns]: number | null };

export interface TrackBoundaryGeometry {
  layoutKey: string;
  circuitId: string;
  layoutId: string;
  trackVenue: string;
  trackCourse: string;
  lengthM: number;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    spanX: number;
    spanZ: number;
  };
  leftBoundary: Array<[number, number]>;
  rightBoundary: Array<[number, number]>;
  centerline: Array<[number, number]>;
  nominalWidthM?: number;
  startFinish?: [number, number];
  timingGates?: TrackTimingGates;
  pitLane?: {
    centerline: Array<[number, number]>;
    elevation?: number[];
  };
  pitStalls?: Array<{
    id: number;
    center: [number, number];
    widthM: number;
    angleDeg?: number;
  }>;
  gridSlots?: Array<{
    slot: number;
    center: [number, number];
  }>;
  geometryRevision?: string;
  projectionRevision?: string;
  quality?: TrackGeometryQuality;
  surfaceProfile?: TrackSurfaceProfile;
  /** Map display surfaces (road and kerb are active-layout only); timing and lap projection use the centerline. Not part of `geometryRevision`. */
  surfaces?: TrackMapSurfaces;
  /** Brake-board markers of the 2D map. Not part of `geometryRevision`. */
  brakeMarkers?: TrackBrakeMarker[];
}
