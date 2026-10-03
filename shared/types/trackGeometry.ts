export interface TimingGateGeometry {
  name: string;
  center: [number, number];
  left: [number, number];
  right: [number, number];
  stationM: number;
}

/** Each polygon contains an exterior ring followed by any holes, in local x/z meters. */
export type TrackSurfacePolygon = Array<Array<[number, number]>>;

export interface TrackMapSurfaces {
  road: TrackSurfacePolygon[];
  kerb: TrackSurfacePolygon[];
  runoff: TrackSurfacePolygon[];
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

export interface TrackSurfaceProfile extends TrackSurfaceProfileColumns {
  /** Ascending centerline stations: first is zero and last is strictly below lengthM. */
  stationM: number[];
}

export type TrackSurfaceProfileSample = {
  stationM: number;
} & { [Key in keyof TrackSurfaceProfileColumns]: number | null };

export interface TrackRoadEdgeDistances {
  /** Signed distance remaining to the left edge; negative means outside the road. */
  leftDistanceM: number | null;
  /** Signed distance remaining to the right edge; negative means outside the road. */
  rightDistanceM: number | null;
}

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
  /** Display surfaces only; timing and lap projection continue to use the centerline. */
  mapSurfaces?: TrackMapSurfaces;
  startFinish?: [number, number];
  timingGates?: {
    startFinish: TimingGateGeometry;
    sector1?: TimingGateGeometry;
    sector2?: TimingGateGeometry;
  };
  elevationProfile?: number[];
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
  schemaVersion?: 2;
  geometryRevision?: string;
  projectionRevision?: string;
  coordinates?: { frame: 'lmu-local'; unit: 'm'; axes: 'xyz' };
  quality?: TrackGeometryQuality;
  surfaceProfile?: TrackSurfaceProfile;
}
